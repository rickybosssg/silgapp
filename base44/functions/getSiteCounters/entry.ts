import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// ═══════════════════════════════════════════════════════════════════════════
// getSiteCounters — Compteurs publics pour le site vitrine SILGAPP
// ═══════════════════════════════════════════════════════════════════════════
//
// FONCTION PUBLIQUE — aucune authentification requise.
// Retourne uniquement des compteurs agrégés (aucune donnée personnelle).
//
// Compteurs fournis :
//   - clients_registered       : ClientExterne (inscrits, hors tests)
//   - drivers_registered       : Livreur (inscrits, hors tests)
//   - shops_registered         : Boutique (inscrits, hors tests)
//   - restaurants_registered   : Restaurant (inscrits, hors tests)
//   - deliveries_completed_all_time : CourseExterne + Course (statut=livree)
//
// Sécurité :
//   - Aucun paramètre accepté (pas de filtrage possible).
//   - Aucune donnée personnelle renvoyée (noms, téléphones, emails, GPS).
//   - Pas de breakdown par entreprise, ville ou catégorie.
//   - Les tables métier ne sont pas exposées (count() côté service role).
//
// Cache : 10 minutes (AppConfig), stale-on-error (dernier résultat conservé
//         avec sa date d'origine si le recalcul échoue).
// Verrou : 30 secondes (anti-recalcul simultané).
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_TTL_MS = 10 * 60 * 1000;
const LOCK_TTL_MS = 30 * 1000;
const CACHE_KEY = 'site_counters_cache_v1';
const LOCK_KEY = 'site_counters_lock_v1';
const METHODOLOGY_VERSION = '1.1';

// Critères d'exclusion tests/démos (fiables : les vrais utilisateurs n'ont pas
// "test" ou "demo" dans leur nom, ni des numéros répétitifs/séquentiels).
const TEST_NAME_PATTERN = 'test|demo|exemple';
const TEST_PHONE_PATTERN = '^0{6,}|^1{6,}|^9{6,}|^123456';

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
      // Un autre recalcul est en cours — retourner le cache stale
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
        stale: true,
      }, { status: 503 });
    }

    // ── 4. Sauvegarder le cache ──
    const result = {
      version: 1 as const,
      updated_at: new Date().toISOString(),
      methodology_version: METHODOLOGY_VERSION,
      counts,
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
      return false; // verrou actif
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

async function calculateCounters(sr: any): Promise<any> {
  // ── Batch 1 : téléphones uniques pour clients et drivers (4 appels) ──
  // On utilise distinct() pour dédupliquer par téléphone : chaque compte est
  // compté une seule fois, même s'il a plusieurs enregistrements.
  const batch1 = await Promise.allSettled([
    // Clients — téléphones uniques (tous avec données minimales)
    sr.entities.ClientExterne.filter(
      { nom: { $nin: [null, ''] }, telephone: { $nin: [null, ''] } },
      { distinct: 'telephone_normalized', limit: 10000 }
    ),
    // Clients — téléphones uniques des tests/démos à exclure
    sr.entities.ClientExterne.filter(
      {
        nom: { $nin: [null, ''] },
        telephone: { $nin: [null, ''] },
        $or: [
          { nom: { $regex: TEST_NAME_PATTERN, $options: 'i' } },
          { telephone: { $regex: TEST_PHONE_PATTERN, $options: 'i' } },
        ],
      },
      { distinct: 'telephone_normalized', limit: 10000 }
    ),
    // Drivers — téléphones uniques (tous avec données minimales)
    sr.entities.Livreur.filter(
      { nom: { $nin: [null, ''] }, telephone: { $nin: [null, ''] } },
      { distinct: 'telephone', limit: 10000 }
    ),
    // Drivers — téléphones uniques des tests/démos à exclure
    sr.entities.Livreur.filter(
      {
        nom: { $nin: [null, ''] },
        telephone: { $nin: [null, ''] },
        $or: [
          { nom: { $regex: TEST_NAME_PATTERN, $options: 'i' } },
          { telephone: { $regex: TEST_PHONE_PATTERN, $options: 'i' } },
        ],
      },
      { distinct: 'telephone', limit: 10000 }
    ),
  ]);

  // ── Batch 2 : count() pour shops, restaurants, livraisons (6 appels) ──
  const batch2 = await Promise.allSettled([
    sr.entities.Boutique.count({ nom: { $nin: [null, ''] } }),
    sr.entities.Boutique.count({ nom: { $regex: TEST_NAME_PATTERN, $options: 'i' } }),
    sr.entities.Restaurant.count({ nom: { $nin: [null, ''] } }),
    sr.entities.Restaurant.count({ nom: { $regex: TEST_NAME_PATTERN, $options: 'i' } }),
    sr.entities.CourseExterne.count({ statut: 'livree', heure_livraison: { $nin: [null, ''] } }),
    sr.entities.Course.count({ statut: 'livree', heure_livraison: { $nin: [null, ''] } }),
  ]);

  // ── Clients : téléphones uniques hors tests ──
  let clients_registered = null;
  if (batch1[0].status === 'fulfilled') {
    const allPhones = new Set(batch1[0].value?.items || []);
    if (batch1[1].status === 'fulfilled') {
      const testPhones = batch1[1].value?.items || [];
      for (const p of testPhones) allPhones.delete(p);
    }
    clients_registered = allPhones.size;
  }

  // ── Drivers : téléphones uniques hors tests ──
  let drivers_registered = null;
  if (batch1[2].status === 'fulfilled') {
    const allPhones = new Set(batch1[2].value?.items || []);
    if (batch1[3].status === 'fulfilled') {
      const testPhones = batch1[3].value?.items || [];
      for (const p of testPhones) allPhones.delete(p);
    }
    drivers_registered = allPhones.size;
  }

  // ── Shops ──
  const shopsTotal = batch2[0].status === 'fulfilled' ? batch2[0].value : null;
  const shopsTest = batch2[1].status === 'fulfilled' ? batch2[1].value : null;
  const shops_registered = (shopsTotal !== null && shopsTest !== null)
    ? Math.max(0, shopsTotal - shopsTest) : null;

  // ── Restaurants ──
  const restTotal = batch2[2].status === 'fulfilled' ? batch2[2].value : null;
  const restTest = batch2[3].status === 'fulfilled' ? batch2[3].value : null;
  const restaurants_registered = (restTotal !== null && restTest !== null)
    ? Math.max(0, restTotal - restTest) : null;

  // ── Livraisons ──
  // Uniquement si l'historique est vérifiable (les deux entités sont lisibles).
  // Si l'une échoue, on retourne null (jamais de faux zéro).
  const coursesExt = batch2[4].status === 'fulfilled' ? batch2[4].value : null;
  const coursesInt = batch2[5].status === 'fulfilled' ? batch2[5].value : null;
  const deliveries_completed_all_time = (coursesExt !== null && coursesInt !== null)
    ? coursesExt + coursesInt : null;

  return {
    clients_registered,
    drivers_registered,
    shops_registered,
    restaurants_registered,
    deliveries_completed_all_time,
  };
}