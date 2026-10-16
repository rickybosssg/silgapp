import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// ═══════════════════════════════════════════════════════════════════════════
// getSiteCounters — Compteurs publics pour le site vitrine SILGAPP
// ═══════════════════════════════════════════════════════════════════════════
//
// FONCTION PUBLIQUE — aucune authentification requise.
// Retourne uniquement des compteurs agrégés (aucune donnée personnelle).
//
// MÉTHODOLOGIE v3.0 — Réutilisation des compteurs existants des tableaux de bord :
//
//   clients_registered :
//     → Réutilise « clients_silgapp » de getSilgappLiveStats
//     → Définition : ClientExterne possédant un user_email (compte réel)
//     → C'est le compteur « inscrits », PAS « actifs » ni « disponibles »
//
//   drivers_registered :
//     → Réutilise « total_livreurs » de getStatsGlobales
//     → Définition : count de tous les enregistrements Livreur
//     → C'est le compteur « inscrits », PAS « validés » ni « en ligne »
//
//   shops_registered :
//     → Réutilise « total_boutiques » de getStatsGlobales
//     → Définition : count de tous les enregistrements Boutique
//
//   restaurants_registered :
//     → Réutilise « total_restaurants » de getStatsGlobales
//     → Définition : count de tous les enregistrements Restaurant
//
//   deliveries_completed_all_time :
//     → Réutilise « courses_total » de getSilgappLiveStats
//     → Définition : CourseExterne avec statut = 'livree' (cumul toutes périodes)
//     → NB : ne compte QUE CourseExterne, comme le font les tableaux de bord.
//        L'entité Course (réseau interne) n'est pas incluse, car aucun
//        compteur existant ne l'agrège avec CourseExterne.
//
// PÉRIMÈTRE : réseau SILGAPP entier (tous pays confondus, tous réseaux).
//   Les tableaux de bord filtrent par pays ; le site agrège tous les pays.
//   Aucun filtrage par entreprise — le total agrégé ne révèle pas de données
//   personnelles d'une entreprise spécifique.
//
// SÉCURITÉ :
//   - Aucune donnée personnelle renvoyée (uniquement des compteurs).
//   - Aucune donnée métier modifiée ou supprimée.
//   - Les compteurs existants de l'application ne sont pas modifiés.
//
// Cache : 10 minutes (AppConfig), stale-on-error.
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_TTL_MS = 10 * 60 * 1000;
const LOCK_TTL_MS = 30 * 1000;
const CACHE_KEY = 'site_counters_cache_v1';
const LOCK_KEY = 'site_counters_lock_v1';
const METHODOLOGY_VERSION = '3.0';

const SOURCE_COUNTERS = {
  clients_registered: 'clients_silgapp (getSilgappLiveStats) — ClientExterne avec user_email',
  drivers_registered: 'total_livreurs (getStatsGlobales) — count de tous les enregistrements Livreur',
  shops_registered: 'total_boutiques (getStatsGlobales) — count de tous les enregistrements Boutique',
  restaurants_registered: 'total_restaurants (getStatsGlobales) — count de tous les enregistrements Restaurant',
  deliveries_completed_all_time: 'courses_total (getSilgappLiveStats) — CourseExterne avec statut=livree',
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
        source_counters: SOURCE_COUNTERS,
        stale: true,
      }, { status: 503 });
    }

    // ── 4. Sauvegarder le cache ──
    const result = {
      version: 1 as const,
      updated_at: new Date().toISOString(),
      methodology_version: METHODOLOGY_VERSION,
      counts,
      source_counters: SOURCE_COUNTERS,
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
      source_counters: SOURCE_COUNTERS,
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
// CALCUL DES COMPTEURS — Réutilisation des définitions des tableaux de bord
// ═══════════════════════════════════════════════════════════════════════════

async function calculateCounters(sr: any): Promise<any> {
  // ── Toutes les requêtes en parallèle (count() = 1 appel par compteur) ──
  // Mêmes définitions que les tableaux de bord, sans filtre pays (agrégé réseau).
  const [clients, drivers, shops, restaurants, deliveries] = await Promise.all([
    // clients_silgapp (getSilgappLiveStats) : ClientExterne avec user_email
    sr.entities.ClientExterne.count({ user_email: { $nin: [null, ''] } }),
    // total_livreurs (getStatsGlobales) : count de tous les Livreur
    sr.entities.Livreur.count({}),
    // total_boutiques (getStatsGlobales) : count de tous les Boutique
    sr.entities.Boutique.count({}),
    // total_restaurants (getStatsGlobales) : count de tous les Restaurant
    sr.entities.Restaurant.count({}),
    // courses_total (getSilgappLiveStats) : CourseExterne avec statut=livree
    sr.entities.CourseExterne.count({ statut: 'livree' }),
  ]);

  return {
    clients_registered: clients,
    drivers_registered: drivers,
    shops_registered: shops,
    restaurants_registered: restaurants,
    deliveries_completed_all_time: deliveries,
  };
}