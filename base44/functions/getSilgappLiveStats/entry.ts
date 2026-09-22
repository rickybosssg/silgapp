import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// ═══════════════════════════════════════════════════════════════════════════
// SILGAPP LIVE STATS — Source unique partagée pour le composant « SILGAPP en direct »
// ═══════════════════════════════════════════════════════════════════════════
//
// Retourne 4 compteurs agrégés pour le pays de l'utilisateur :
//   - livreurs_en_ligne : livreurs connectés (heartbeat récent + statut actif)
//   - clients_silgapp   : clients enregistrés (ClientExterne avec user_email)
//   - courses_aujourdhui: courses livrées aujourd'hui (fuseau Africa/Ouagadougou)
//   - courses_total     : courses livrées depuis le début (cumul)
//
// SÉCURITÉ :
//   - Utilisateur authentifié obligatoire
//   - Pays résolu côté backend (jamais confiance aveugle au paramètre frontend)
//   - Aucune donnée privée exposée (uniquement des compteurs agrégés)
//   - Cache in-memory 45s pour éviter la surcharge DB
//
// DÉFINITION « EN LIGNE » :
//   Un livreur est « en ligne » s'il a un heartbeat récent (< heartbeat_on_seuil_min)
//   ET un statut actif (disponible ou en_course). Cette définition réutilise
//   la logique de présence/heartbeat existante (isON dans dispatchRules.js).
//   Elle NE MODIFIE PAS les règles d'éligibilité Dispatch V2.
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_TTL_MS = 45 * 1000; // 45 secondes
const HEARTBEAT_ON_SEUIL_MIN = 10; // aligné sur le default Country.heartbeat_on_seuil_min

// Cache in-memory : { [countryCode]: { data, expiresAt } }
const cache = new Map<string, { data: any; expiresAt: number }>();

// Fuseau horaire SILGAPP (tous les pays actifs sont en même fuseau pour l'instant)
const SILGAPP_TIMEZONE = 'Africa/Ouagadougou';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    // ── 1. Résoudre le country_code côté backend (sécurisé) ──
    let countryCode: string | null = null;

    // Accepter un paramètre optionnel uniquement pour les admins
    let bodyParam: any = null;
    try { bodyParam = await req.json(); } catch { /* pas de body */ }

    if (user.role === 'admin' && bodyParam?.country_code) {
      countryCode = bodyParam.country_code;
    }

    if (!countryCode) {
      // Résoudre depuis le profil du user (ClientExterne, Livreur, ou Partenaire)
      const [clients, livreurs] = await Promise.all([
        base44.asServiceRole.entities.ClientExterne.filter({ user_email: user.email }).catch(() => []),
        base44.asServiceRole.entities.Livreur.filter({ user_email: user.email }).catch(() => []),
      ]);
      countryCode = clients?.[0]?.country_code || livreurs?.[0]?.country_code || null;

      // Fallback : partenaire (Boutique / Restaurant / Pharmacie)
      if (!countryCode) {
        const [boutiques, restaurants, pharmacies] = await Promise.all([
          base44.asServiceRole.entities.Boutique.filter({ partenaire_id: user.id }).catch(() => []),
          base44.asServiceRole.entities.Restaurant.filter({ partenaire_id: user.id }).catch(() => []),
          base44.asServiceRole.entities.Pharmacie.filter({ partenaire_id: user.id }).catch(() => []),
        ]);
        countryCode = boutiques?.[0]?.pays_code || restaurants?.[0]?.pays_code || pharmacies?.[0]?.pays_code || null;
      }
    }

    if (!countryCode) {
      return Response.json({
        livreurs_en_ligne: 0,
        clients_silgapp: 0,
        courses_aujourdhui: 0,
        courses_total: 0,
        pays: null,
        updated_at: new Date().toISOString(),
        cached: false,
      });
    }

    // ── 2. Vérifier le cache ──
    const cached = cache.get(countryCode);
    if (cached && Date.now() < cached.expiresAt) {
      return Response.json({ ...cached.data, cached: true });
    }

    // ── 3. Calculer les statistiques ──
    const now = Date.now();
    const heartbeatCutoff = new Date(now - HEARTBEAT_ON_SEUIL_MIN * 60 * 1000).toISOString();

    // Livreurs en ligne : statut actif + heartbeat récent (isON)
    const livreursPays = await base44.asServiceRole.entities.Livreur.filter({
      country_code: countryCode,
      statut: ['disponible', 'en_course'],
    }).catch(() => []);

    const livreursEnLigne = (livreursPays || []).filter((l: any) => {
      if (l.actif === false) return false;
      if (l.validation !== 'valide') return false;
      const dt = l.last_seen_at || l.derniere_position_date;
      if (!dt) return false;
      return new Date(dt).getTime() > (now - HEARTBEAT_ON_SEUIL_MIN * 60 * 1000);
    }).length;

    // Clients SILGAPP : ClientExterne avec user_email (compte réel)
    const clientsPays = await base44.asServiceRole.entities.ClientExterne.filter({
      country_code: countryCode,
    }).catch(() => []);
    const clientsSilgapp = (clientsPays || []).filter((c: any) => !!c.user_email).length;

    // Courses livrées (paginé) — pour today et total
    const startOfToday = getStartOfTodayISO(SILGAPP_TIMEZONE);
    let coursesTotal = 0;
    let coursesAujourdhui = 0;
    let skip = 0;
    const pageSize = 500;
    let hasMore = true;

    while (hasMore) {
      const batch = await base44.asServiceRole.entities.CourseExterne.filter(
        { statut: 'livree', country_code: countryCode },
        '-created_date', pageSize, skip
      ).catch(() => []);

      if (!batch || batch.length === 0) {
        hasMore = false;
        break;
      }

      coursesTotal += batch.length;
      for (const c of batch) {
        const livraisonDate = c.heure_livraison || c.colis_livre_at || c.created_date;
        if (livraisonDate && new Date(livraisonDate).toISOString() >= startOfToday) {
          coursesAujourdhui++;
        }
      }

      if (batch.length < pageSize) {
        hasMore = false;
      } else {
        skip += pageSize;
      }
      // Aucun plafond arbitraire : pagination exhaustive jusqu'à épuisement
    }

    const data = {
      livreurs_en_ligne: livreursEnLigne,
      clients_silgapp: clientsSilgapp,
      courses_aujourdhui: coursesAujourdhui,
      courses_total: coursesTotal,
      pays: countryCode,
      updated_at: new Date().toISOString(),
      cached: false,
    };

    // ── 4. Mettre en cache ──
    cache.set(countryCode, { data, expiresAt: now + CACHE_TTL_MS });

    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ── Helper : début de journée (00:00) dans le fuseau horaire donné, en ISO UTC ──
function getStartOfTodayISO(timezone: string): string {
  const now = new Date();
  // Formater la date du jour dans le fuseau horaire cible
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')?.value || '2026';
  const month = parts.find(p => p.type === 'month')?.value || '01';
  const day = parts.find(p => p.type === 'day')?.value || '01';
  // 00:00 dans le fuseau cible → convertir en UTC
  // Le fuseau Africa/Ouagadougou est UTC+0, donc pas de décalage.
  return new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
}