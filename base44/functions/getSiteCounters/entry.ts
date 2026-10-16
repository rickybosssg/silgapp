import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// ═══════════════════════════════════════════════════════════════════════════
// getSiteCounters — Compteurs publics pour le site vitrine SILGAPP
// ═══════════════════════════════════════════════════════════════════════════
//
// FONCTION PUBLIQUE — aucune authentification requise.
// Retourne uniquement des compteurs agrégés (aucune donnée personnelle).
//
// MÉTHODOLOGIE v2.0 :
//   - Comptage par identifiant d'enregistrement unique (id), pas par téléphone.
//     Un téléphone partagé ne prouve pas un doublon — ne pas dédupliquer par téléphone.
//   - Aucune exclusion par motifs de noms (test/demo/exemple) — non fiable.
//   - null pour tout compteur non vérifiable sans indicateur explicite de test.
//   - Notes de vérification pour chaque compteur indiquant ce qui manque.
//
// CE QUI MANQUE POUR VÉRIFIER CHAQUE COMPTEUR :
//   - clients_registered : aucun champ is_test sur ClientExterne
//   - drivers_registered : aucun champ is_test sur Livreur
//   - shops_registered   : aucun champ is_test sur Boutique, doublons non vérifiés
//   - restaurants_registered : idem
//   - deliveries_completed_all_time : aucun champ is_test sur Course/CourseExterne,
//     chevauchements entre les deux entités non vérifiables
//
// SÉCURITÉ :
//   - Aucune donnée personnelle renvoyée.
//   - Aucune donnée métier modifiée ou supprimée.
//
// Cache : 10 minutes (AppConfig), stale-on-error.
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_TTL_MS = 10 * 60 * 1000;
const LOCK_TTL_MS = 30 * 1000;
const CACHE_KEY = 'site_counters_cache_v1';
const LOCK_KEY = 'site_counters_lock_v1';
const METHODOLOGY_VERSION = '2.0';

const VERIFICATION_NOTES = {
  clients_registered: 'Non vérifié : aucun champ is_test sur ClientExterne. L\'exclusion par motifs de noms (test/demo/exemple) n\'est pas fiable. Comptage par id (enregistrements) sans déduplication par téléphone — un téléphone partagé ne prouve pas un doublon.',
  drivers_registered: 'Non vérifié : aucun champ is_test sur Livreur. Même problème que clients.',
  shops_registered: 'Non vérifié : aucun champ is_test sur Boutique. Doublons d\'établissements (même nom, même adresse) non vérifiés. L\'identifiant partenaire_id identifie le propriétaire, pas l\'établissement.',
  restaurants_registered: 'Non vérifié : aucun champ is_test sur Restaurant. Même problème que boutiques.',
  deliveries_completed_all_time: 'Non vérifié : aucun champ is_test sur Course et CourseExterne. Chevauchements entre les deux entités non vérifiables (pas d\'identifiant commun). Une date de livraison renseignée ne prouve ni l\'absence de tests ni l\'absence de doublons inter-entités.',
};

const EMPTY_COUNTS = {
  clients_registered: null,
  drivers_registered: null,
  shops_registered: null,
  restaurants_registered: null,
  deliveries_completed_all_time: null,
};

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    // ── 1. Vérifier le cache ──
    const cacheRecords = await sr.entities.AppConfig.filter({ cle: CACHE_KEY });
    const cached = cacheRecords?.[0];
    let cachedData: any = null;

    if (cached?.valeur) {
      try {
        cachedData = JSON.parse(cached.valeur);
        const age = Date.now() - new Date(cachedData.updated_at).getTime();
        if (age < CACHE_TTL_MS) {
          return Response.json(cachedData);
        }
      } catch {}
    }

    // ── 2. Acquérir le verrou (anti-recalcul simultané) ──
    const lockId = crypto.randomUUID();
    const lockAcquired = await tryAcquireLock(sr, lockId);

    if (!lockAcquired) {
      if (cachedData) {
        return Response.json({ ...cachedData, stale: true });
      }
    }

    // ── 3. Calculer les compteurs ──
    let counts: any;
    try {
      counts = await calculateCounters(sr);
    } catch (error) {
      if (lockAcquired) await releaseLock(sr);
      if (cachedData) {
        return Response.json({ ...cachedData, stale: true });
      }
      return Response.json({
        version: 1,
        updated_at: new Date().toISOString(),
        methodology_version: METHODOLOGY_VERSION,
        counts: EMPTY_COUNTS,
        verification_notes: VERIFICATION_NOTES,
        stale: true,
      }, { status: 503 });
    }

    // ── 4. Sauvegarder le cache ──
    const result = {
      version: 1 as const,
      updated_at: new Date().toISOString(),
      methodology_version: METHODOLOGY_VERSION,
      counts,
      verification_notes: VERIFICATION_NOTES,
    };

    await saveCache(sr, result, cached);
    if (lockAcquired) await releaseLock(sr);

    return Response.json(result);
  } catch (error) {
    return Response.json({
      version: 1,
      updated_at: new Date().toISOString(),
      methodology_version: METHODOLOGY_VERSION,
      counts: EMPTY_COUNTS,
      verification_notes: VERIFICATION_NOTES,
      stale: true,
    }, { status: 503 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GESTION DU VERROU (AppConfig)
// ═══════════════════════════════════════════════════════════════════════════

async function tryAcquireLock(sr: any, lockId: string): Promise<boolean> {
  try {
    const lockRecords = await sr.entities.AppConfig.filter({ cle: LOCK_KEY });
    const lock = lockRecords?.[0];
    const now = new Date();
    const expiry = lock?.lock_expires_at ? new Date(lock.lock_expires_at) : null;

    if (lock && expiry && expiry > now) {
      return false;
    }

    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS).toISOString();
    if (lock) {
      await sr.entities.AppConfig.update(lock.id, {
        lock_owner: lockId,
        lock_expires_at: expiresAt,
      });
    } else {
      await sr.entities.AppConfig.create({
        cle: LOCK_KEY,
        valeur: 'locked',
        lock_owner: lockId,
        lock_expires_at: expiresAt,
      });
    }
    return true;
  } catch {
    return false;
  }
}

async function releaseLock(sr: any): Promise<void> {
  try {
    const lockRecords = await sr.entities.AppConfig.filter({ cle: LOCK_KEY });
    const lock = lockRecords?.[0];
    if (lock) {
      await sr.entities.AppConfig.update(lock.id, {
        lock_owner: '',
        lock_expires_at: null,
      });
    }
  } catch {}
}

async function saveCache(sr: any, data: any, existing: any): Promise<void> {
  const jsonValue = JSON.stringify(data);
  if (existing && existing.cle === CACHE_KEY) {
    await sr.entities.AppConfig.update(existing.id, { valeur: jsonValue });
  } else {
    await sr.entities.AppConfig.create({ cle: CACHE_KEY, valeur: jsonValue });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CALCUL DES COMPTEURS
// ═══════════════════════════════════════════════════════════════════════════
//
// Tous les compteurs retournent null car aucun ne peut être vérifié :
//
// 1. Pas de champ is_test explicite sur ClientExterne, Livreur, Boutique,
//    Restaurant, Course ou CourseExterne. L'exclusion par motifs de noms
//    (test/demo/exemple) n'est pas fiable et a été supprimée.
//
// 2. Pour les livraisons : pas d'identifiant commun entre Course et CourseExterne
//    permettant de détecter les chevauchements. Les deux entités ont des schémas
//    différents et pas de clé de corrélation.
//
// 3. Pour les boutiques/restaurants : pas de détection de doublons (même nom +
//    même adresse) possible sans charger tous les enregistrements.
//
// Aucune donnée métier n'est modifiée ou supprimée.
// ═══════════════════════════════════════════════════════════════════════════

async function calculateCounters(sr: any): Promise<any> {
  return {
    clients_registered: null,
    drivers_registered: null,
    shops_registered: null,
    restaurants_registered: null,
    deliveries_completed_all_time: null,
  };
}