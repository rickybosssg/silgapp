// ════════════════════════════════════════════════════════════════════════
// GARDE-FOU CENTRALISÉ — LIMITATION À 2 COURSES ACTIVES PAR LIVREUR
// ════════════════════════════════════════════════════════════════════════
//
// Objectif : empêcher qu'un livreur dépasse MAX_ACTIVE_COURSES_LIVREUR
// courses actives simultanées, quel que soit le chemin d'acceptation
// (proposition sur trajet, mission Éco, attribution manuelle admin).
//
// Mécanisme atomique :
//   1. Verrou temporaire par livreur (capacity_lock_until, TTL 30s)
//      acquis via updateMany conditionnel — deux acceptations simultanées
//      ne peuvent pas passer le verrou en même temps.
//   2. Comptage dynamique des courses actives (depuis CourseExterne,
//      dédupliqué par course ID — jamais compter deux fois la même course).
//   3. Si count + slots > MAX → refus. Sinon, l'acceptation proceed.
//   4. Le verrou est libéré immédiatement après le claim (succès ou échec).
//      En cas de crash, le verrou auto-expire après 30s.
//
// Le comptage est toujours dynamique (jamais de compteur persistant à
// décrémenter) — donc aucune modification de la finalisation/annulation.
// Une course terminée ou annulée libère automatiquement sa place car
// elle quitte STATUTS_ACTIFS_COURSE.
//
// Dispatch V2 (accepterCourseV2) n'est PAS modifié — il conserve sa
// règle existante (1 course max via aCourseActive).
//
// Une mission Éco de N courses réserve N places atomiquement.
// ════════════════════════════════════════════════════════════════════════

import { STATUTS_ACTIFS_COURSE, STATUTS_TERMINAUX_COURSE } from './dispatchConstants.ts';

const DEFAULT_MAX_ACTIVE_COURSES = 2;
const CAPACITY_LOCK_TTL_SEC = 30;
const CAPACITY_CONFIG_PREFIX = 'DISPATCH';

function configKey(countryCode: string): string {
  return `${CAPACITY_CONFIG_PREFIX}:${String(countryCode || '').toUpperCase()}:MAX_ACTIVE_COURSES_LIVREUR`;
}

/**
 * Récupère le nombre maximum de courses actives par livreur pour un pays.
 * Configurable via AppConfig (clé DISPATCH:<PAYS>:MAX_ACTIVE_COURSES_LIVREUR).
 * Défaut : 2. Le Super Admin peut modifier cette valeur sans rebuild.
 */
export async function getMaxActiveCourses(base44: any, countryCode: string): Promise<number> {
  const code = String(countryCode || '').toUpperCase();
  if (!code) return DEFAULT_MAX_ACTIVE_COURSES;
  try {
    const configs = await base44.asServiceRole.entities.AppConfig.filter(
      { cle: configKey(code) }, undefined, 1
    ).catch(() => []);
    const val = configs?.[0]?.valeur;
    const n = Number(val);
    if (Number.isFinite(n) && n >= 1) return Math.min(Math.floor(n), 5);
    return DEFAULT_MAX_ACTIVE_COURSES;
  } catch {
    return DEFAULT_MAX_ACTIVE_COURSES;
  }
}

/**
 * Compte les courses actives d'un livreur (dédupliqué par course ID).
 * Une course est "active" si son statut est dans STATUTS_ACTIFS_COURSE
 * OU si dispatch_status='accepte' et statut non terminal.
 * N'importe jamais deux fois la même CourseExterne.
 *
 * excludeCourseIds : IDs de courses à exclure du comptage (ex: la course
// en cours d'acceptation, pour ne pas la compter avant son claim).
 */
export async function countActiveCourses(
  base44: any,
  livreurId: string,
  countryCode: string,
  excludeCourseIds: string[] = [],
): Promise<number> {
  if (!livreurId || !countryCode) return 0;
  const excludeSet = new Set(excludeCourseIds);
  const [courses, coursesAccepted] = await Promise.all([
    base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: countryCode, livreur_id: livreurId }, '-created_date', 20
    ).catch(() => []),
    base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: countryCode, accepted_by_livreur_id: livreurId }, '-created_date', 20
    ).catch(() => []),
  ]);

  const seen = new Set<string>();
  for (const c of [...(courses || []), ...(coursesAccepted || [])]) {
    if (!c?.id) continue;
    if (excludeSet.has(c.id)) continue;
    if (seen.has(c.id)) continue;
    const isActive =
      STATUTS_ACTIFS_COURSE.includes(c.statut) ||
      (c.dispatch_status === 'accepte' && !STATUTS_TERMINAUX_COURSE.includes(c.statut));
    if (isActive) seen.add(c.id);
  }
  return seen.size;
}

/**
 * Acquiert un verrou temporaire par livreur (atomicité anti-concurrence).
 * Utilise updateMany conditionnel : le verrou n'est acquis que si
 * capacity_lock_until est null ou expiré. TTL 30s (auto-libération).
 * Retourne true si le verrou a été acquis.
 */
export async function acquireCapacityLock(
  base44: any,
  livreurId: string,
  ttlSec: number = CAPACITY_LOCK_TTL_SEC,
): Promise<boolean> {
  if (!livreurId) return false;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
  try {
    const result = await base44.asServiceRole.entities.Livreur.updateMany(
      {
        id: livreurId,
        $or: [
          { capacity_lock_until: null },
          { capacity_lock_until: { $lt: now } },
        ],
      },
      { $set: { capacity_lock_until: expiresAt } },
    );
    return result?.updated === 1;
  } catch {
    return false;
  }
}

/**
 * Libère immédiatement le verrou de capacité d'un livreur.
 */
export async function releaseCapacityLock(base44: any, livreurId: string): Promise<void> {
  if (!livreurId) return;
  try {
    await base44.asServiceRole.entities.Livreur.updateMany(
      { id: livreurId },
      { $set: { capacity_lock_until: null } },
    );
  } catch {
    // Non-bloquant — le verrou auto-expire après 30s.
  }
}

/**
 * Vérifie et réserve atomiquement la capacité d'un livreur.
 *
 * Étapes :
 *   1. Acquiert le verrou temporaire (atomicité).
 *   2. Compte les courses actives (vérité dynamique).
 *   3. Si count + slots > MAX → échec (verrou libéré).
 *   4. Si OK → retourne success (le verrou reste actif jusqu'à release).
 *
 * L'appelant DOIT libérer le verrou (releaseCapacityLock) après le
 * claim de la course (succès ou échec).
 *
 * @param slots Nombre de places à réserver (1 pour une course simple,
 *              N pour une mission Éco de N courses).
 * @param excludeCourseIds IDs de courses à exclure du comptage.
 */
export async function checkAndReserveCapacity(
  base44: any,
  livreurId: string,
  countryCode: string,
  slots: number = 1,
  excludeCourseIds: string[] = [],
): Promise<{ success: boolean; reason?: string; activeCount?: number; maxCourses?: number }> {
  const maxCourses = await getMaxActiveCourses(base44, countryCode);

  const locked = await acquireCapacityLock(base44, livreurId);
  if (!locked) {
    return { success: false, reason: 'capacity_lock_busy', maxCourses };
  }

  try {
    const activeCount = await countActiveCourses(base44, livreurId, countryCode, excludeCourseIds);
    if (activeCount + slots > maxCourses) {
      await releaseCapacityLock(base44, livreurId);
      return { success: false, reason: 'max_courses_reached', activeCount, maxCourses };
    }
    return { success: true, activeCount, maxCourses };
  } catch {
    await releaseCapacityLock(base44, livreurId);
    return { success: false, reason: 'capacity_check_error', maxCourses };
  }
}

/**
 * Vérifie si un livreur a de la capacité disponible SANS verrou.
 * Utilisé pour le filtrage (ex: findBestOnRouteDriver) où le verrou
 * n'est pas nécessaire — seul le comptage importe.
 */
export async function hasCapacityAvailable(
  base44: any,
  livreurId: string,
  countryCode: string,
  slots: number = 1,
): Promise<boolean> {
  const maxCourses = await getMaxActiveCourses(base44, countryCode);
  const activeCount = await countActiveCourses(base44, livreurId, countryCode);
  return activeCount + slots <= maxCourses;
}