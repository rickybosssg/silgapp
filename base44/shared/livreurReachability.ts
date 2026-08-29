// ═══════════════════════════════════════════════════════════════════════════
// 📌 CALCUL DE REACHABILITÉ LIVREUR — BACKEND UNIQUEMENT (2026-08-29)
// ═══════════════════════════════════════════════════════════════════════════
//
// Notion calculée de "réellement disponible" sans modifier Livreur.statut.
//
// Règles :
//   - app_active=false ne JAMAIS exclure un livreur si background_active=true
//     ET derniere_position_date récent (Foreground Service actif).
//   - Un livreur fantôme = statut="disponible" mais last_seen_at ancien (>24h)
//     ET pas de GPS récent ET pas de background actif.
//   - Les comptes test sont exclus via AppConfig TEST_LIVREUR_IDS.
//
// NE MODIFIE PAS Livreur.statut — c'est une notion calculée en lecture seule.
// ═══════════════════════════════════════════════════════════════════════════

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h
const GPS_RECENT_MS = 30 * 60 * 1000; // 30 min
const HEARTBEAT_RECENT_MS = 10 * 60 * 1000; // 10 min

/**
 * Vérifie si un livreur est un compte test (via AppConfig TEST_LIVREUR_IDS).
 * N'utilise PAS de règle géographique — uniquement une liste explicite d'IDs.
 */
export async function estCompteTest(base44, livreurId) {
  if (!livreurId) return false;
  try {
    const configs = await base44.asServiceRole.entities.AppConfig.filter({ cle: 'TEST_LIVREUR_IDS' });
    const idsStr = configs?.[0]?.valeur || '';
    const ids = idsStr.split(',').map(s => s.trim()).filter(Boolean);
    return ids.includes(livreurId);
  } catch {
    return false;
  }
}

/**
 * Vérifie si un livreur a une activité récente (foreground OU background).
 *
 * Un livreur est considéré comme ayant une activité récente si :
 *   - last_seen_at < HEARTBEAT_RECENT_MS (10 min) — heartbeat récent
 *   - OU derniere_position_date < GPS_RECENT_MS (30 min) — GPS récent
 *
 * NOTE : app_active=false ne signifie PAS que le livreur est inactif.
 * Le Foreground Service Android envoie des heartbeats avec background_active=true
 * et app_active=false. Ces livreurs sont parfaitement actifs.
 */
export function aActiviteRecente(livreur) {
  if (!livreur) return false;
  const now = Date.now();

  // Heartbeat récent (foreground ou background)
  if (livreur.last_seen_at) {
    const lastSeenAge = now - new Date(livreur.last_seen_at).getTime();
    if (lastSeenAge < HEARTBEAT_RECENT_MS) return true;
  }

  // GPS récent (Foreground Service actif même si app minimisée)
  if (livreur.derniere_position_date) {
    const gpsAge = now - new Date(livreur.derniere_position_date).getTime();
    if (gpsAge < GPS_RECENT_MS) return true;
  }

  return false;
}

/**
 * Détermine si un livreur est "fantôme" :
 * statut="disponible" mais aucune activité récente (ni heartbeat, ni GPS, ni background).
 *
 * ATTENTION : app_active=false seul ne suffit PAS — il faut aussi que
 * background_active=false ET last_seen_at ancien ET derniere_position_date ancien.
 */
export function estFantome(livreur) {
  if (!livreur) return false;
  if (livreur.statut !== 'disponible') return false;

  const now = Date.now();

  // Si background_active=true, le Foreground Service fonctionne
  if (livreur.background_active === true) return false;

  // Si heartbeat récent, le livreur est actif
  if (livreur.last_seen_at) {
    const lastSeenAge = now - new Date(livreur.last_seen_at).getTime();
    if (lastSeenAge < HEARTBEAT_RECENT_MS) return false;
  }

  // Si GPS récent, le livreur est actif
  if (livreur.derniere_position_date) {
    const gpsAge = now - new Date(livreur.derniere_position_date).getTime();
    if (gpsAge < GPS_RECENT_MS) return false;
  }

  // Si last_seen_at est ancien (>24h) ou nul → fantôme
  if (!livreur.last_seen_at) return true;
  const lastSeenAge = now - new Date(livreur.last_seen_at).getTime();
  if (lastSeenAge > STALE_THRESHOLD_MS) return true;

  return false;
}

/**
 * Calcule si un livreur est "réellement disponible et joignable".
 *
 * Critères :
 *   1. statut = "disponible" (pas en_course, pas hors_ligne)
 *   2. actif = true (compte non désactivé)
 *   3. validation = "valide"
 *   4. bloque_encours = false (pas bloqué financièrement)
 *   5. manual_hors_ligne = false (pas mis hors ligne manuellement)
 *   6. admin_hors_ligne = false (pas désactivé par l'admin)
 *   7. Activité récente (heartbeat OU GPS récent)
 *   8. Pas un compte test
 *
 * NOTE : app_active=false n'exclut PAS le livreur si background_active=true
 * et GPS récent — le Foreground Service fonctionne en arrière-plan.
 */
export async function estReellementDisponible(base44, livreur, options = {}) {
  if (!livreur) return false;

  // Critères de base
  if (livreur.statut !== 'disponible') return false;
  if (livreur.actif === false) return false;
  if (livreur.validation !== 'valide') return false;
  if (livreur.bloque_encours === true) return false;
  if (livreur.manual_hors_ligne === true) return false;
  if (livreur.admin_hors_ligne === true) return false;

  // Activité récente (foreground OU background)
  if (!aActiviteRecente(livreur)) return false;

  // Exclure les comptes test
  const { skipTestCheck = false } = options;
  if (!skipTestCheck) {
    const isTest = await estCompteTest(base44, livreur.id);
    if (isTest) return false;
  }

  return true;
}

/**
 * Version synchrone (sans vérification compte test) pour les contextes
 * où on ne peut pas faire d'appel async (ex: filtres de tableau).
 */
export function estReellementDisponibleSync(livreur) {
  if (!livreur) return false;
  if (livreur.statut !== 'disponible') return false;
  if (livreur.actif === false) return false;
  if (livreur.validation !== 'valide') return false;
  if (livreur.bloque_encours === true) return false;
  if (livreur.manual_hors_ligne === true) return false;
  if (livreur.admin_hors_ligne === true) return false;
  return aActiviteRecente(livreur);
}

/**
 * Compte le nombre de livreurs réellement disponibles et joignables
 * pour un pays donné.
 */
export async function compterLivreursReellementDisponibles(base44, countryCode) {
  if (!countryCode) return { total: 0, details: [] };

  const livreurs = await base44.asServiceRole.entities.Livreur.filter({
    type_livreur: 'externe',
    country_code: countryCode,
    statut: 'disponible',
    actif: true,
    validation: 'valide',
    bloque_encours: { $ne: true },
    manual_hors_ligne: { $ne: true },
    admin_hors_ligne: { $ne: true },
  }, '-last_seen_at', 500).catch(() => []);

  const details = [];
  for (const livreur of livreurs || []) {
    const isReallyAvailable = await estReellementDisponible(base44, livreur);
    if (isReallyAvailable) {
      details.push({
        id: livreur.id,
        nom: `${livreur.prenom || ''} ${livreur.nom || ''}`.trim(),
        statut: livreur.statut,
        app_active: livreur.app_active,
        background_active: livreur.background_active,
        last_seen_at: livreur.last_seen_at,
        derniere_position_date: livreur.derniere_position_date,
      });
    }
  }

  return { total: details.length, details };
}