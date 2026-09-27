import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { normalizeEnterpriseId } from '../../shared/enterpriseFinance.ts';

// ═══════════════════════════════════════════════════════════════════════════
// getEnterpriseGlobalSuivi — Vue consolidée Super Admin de TOUTES les Enterprises.
//
// RÉSERVÉ AU SUPER ADMIN SILGAPP (user.role === 'admin').
// Un admin_entreprise ne peut JAMAIS appeler cette fonction.
//
// Architecture anti-N+1 :
//   1. Charge toutes les Enterprises (1 requête, limit 200)
//   2. Charge tous les livreurs Enterprise en batch (1 requête, limit 500)
//   3. Charge toutes les courses Enterprise en batch (1 requête, limit 500)
//   4. Charge tout le EnterpriseLedger en batch (1 requête, limit 500)
//   5. Agrège en mémoire → réponse consolidée
//
// Sources financières :
//   - Cache Enterprise (volume_courses_total, total_commissions_silgapp,
//     total_paiements, montant_du_silgapp) = source d'affichage rapide.
//   - EnterpriseLedger = source de vérité (recomputed pour détection divergence).
//   - Si cache ≠ ledger → divergence signalée (NON corrigée silencieusement).
//
// Le Super Admin conserve enterprise_id = null. Aucun PendingEnterpriseAdmin créé.
// ═══════════════════════════════════════════════════════════════════════════

const TRAITEMENT_STATUSES = [
  'nouvelle', 'en_attente', 'programmee', 'recherche_livreur',
  'livreur_en_route', 'client_contacte', 'en_route_expediteur',
  'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque',
  'pris_en_charge', 'en_livraison', 'arrivee',
];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // ── RÉSERVÉ AU SUPER ADMIN SILGAPP ──
    if (user.role !== 'admin') {
      return Response.json({ error: 'Réservé au Super Admin SILGAPP' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const country_filter = body?.country_code || null;

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. CHARGER TOUTES LES ENTERPRISES
    // ═══════════════════════════════════════════════════════════════════════════
    const enterprises = await base44.asServiceRole.entities.Enterprise.list('-date_creation', 200);
    const filteredEnts = country_filter
      ? (enterprises || []).filter((e: any) => e.country_code === country_filter)
      : (enterprises || []);

    const entFinancierIds = (filteredEnts || []).map((e: any) => e.enterprise_financier_id).filter(Boolean);

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. CHARGER TOUS LES LIVREURS ENTERPRISE EN BATCH
    // ═══════════════════════════════════════════════════════════════════════════
    let allLivreurs: any[] = [];
    if (entFinancierIds.length > 0) {
      allLivreurs = await base44.asServiceRole.entities.Livreur.filter(
        { enterprise_id: { $in: entFinancierIds } },
        '-created_date',
        500
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. CHARGER TOUTES LES COURSES ENTERPRISE EN BATCH
    // ═══════════════════════════════════════════════════════════════════════════
    let allCourses: any[] = [];
    if (entFinancierIds.length > 0) {
      allCourses = await base44.asServiceRole.entities.CourseExterne.filter(
        { enterprise_id: { $in: entFinancierIds } },
        '-created_date',
        500
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. CHARGER TOUT LE ENTERPRISELEDGER EN BATCH
    // ═══════════════════════════════════════════════════════════════════════════
    let allLedger: any[] = [];
    if (entFinancierIds.length > 0) {
      allLedger = await base44.asServiceRole.entities.EnterpriseLedger.filter(
        { enterprise_financier_id: { $in: entFinancierIds } },
        '-created_date',
        500
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. AGRÉGATION PAR ENTERPRISE
    // ═══════════════════════════════════════════════════════════════════════════
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const livreursByEnt: Record<string, any[]> = {};
    for (const l of allLivreurs || []) {
      const eid = normalizeEnterpriseId(l.enterprise_id);
      if (eid) {
        if (!livreursByEnt[eid]) livreursByEnt[eid] = [];
        livreursByEnt[eid].push(l);
      }
    }

    const coursesByEnt: Record<string, any[]> = {};
    for (const c of allCourses || []) {
      const eid = normalizeEnterpriseId(c.enterprise_id);
      if (eid) {
        if (!coursesByEnt[eid]) coursesByEnt[eid] = [];
        coursesByEnt[eid].push(c);
      }
    }

    const ledgerByEnt: Record<string, any[]> = {};
    for (const entry of allLedger || []) {
      const eid = normalizeEnterpriseId(entry.enterprise_financier_id);
      if (eid) {
        if (!ledgerByEnt[eid]) ledgerByEnt[eid] = [];
        ledgerByEnt[eid].push(entry);
      }
    }

    const perEnterprise = (filteredEnts || []).map((ent: any) => {
      const eid = ent.enterprise_financier_id;
      const livreurList = livreursByEnt[eid] || [];
      const courseList = coursesByEnt[eid] || [];
      const ledgerList = ledgerByEnt[eid] || [];

      // ── Livreurs ──
      const livreursActifs = livreurList.filter((l: any) => l.actif !== false && l.validation === 'valide');
      const livreursDispo = livreurList.filter((l: any) => l.statut === 'disponible' && l.actif !== false);
      const livreursEnCourse = livreurList.filter((l: any) => l.statut === 'en_course');
      const livreursHorsLigne = livreurList.filter((l: any) => l.statut === 'hors_ligne');

      // ── Courses ──
      const coursesToday = courseList.filter((c: any) =>
        c.created_date && new Date(c.created_date) >= todayStart
      );
      const coursesEnTraitement = courseList.filter((c: any) => TRAITEMENT_STATUSES.includes(c.statut));
      const coursesLivrees = courseList.filter((c: any) => c.statut === 'livree');
      const coursesAnnulees = courseList.filter((c: any) => c.statut === 'annulee');
      const coursesProgrammees = courseList.filter((c: any) => c.statut === 'programmee');

      // ── Finance : source de vérité = EnterpriseLedger (recomputed) ──
      let ledgerVolume = 0;
      let ledgerCommissions = 0;
      let ledgerPaiements = 0;
      for (const entry of ledgerList) {
        if (entry.type === 'commission_course') {
          ledgerCommissions += Number(entry.montant) || 0;
          // Le volume = somme des prix_final des courses commissionnées
          if (entry.prix_final) ledgerVolume += Number(entry.prix_final) || 0;
        } else if (entry.type === 'paiement') {
          ledgerPaiements += Number(entry.montant) || 0;
        }
      }
      const ledgerDu = ledgerCommissions - ledgerPaiements;

      // ── Cache Enterprise ──
      const cacheVolume = Number(ent.volume_courses_total) || 0;
      const cacheCommissions = Number(ent.total_commissions_silgapp) || 0;
      const cachePaiements = Number(ent.total_paiements) || 0;
      const cacheDu = Number(ent.montant_du_silgapp) || 0;

      // ── Détection de divergence (non corrigée) ──
      const divergence =
        Math.abs(ledgerCommissions - cacheCommissions) > 1 ||
        Math.abs(ledgerPaiements - cachePaiements) > 1 ||
        Math.abs(ledgerDu - cacheDu) > 1;

      return {
        id: ent.id,
        enterprise_financier_id: eid,
        nom: ent.nom,
        nom_commercial: ent.nom_commercial || ent.nom,
        logo_url: ent.logo_url,
        couleur_primaire: ent.couleur_primaire || '#007AFF',
        country_code: ent.country_code,
        statut: ent.statut,
        commission_silgapp_pct: ent.commission_silgapp_pct,
        date_creation: ent.date_creation,

        // Livreurs
        nb_livreurs: livreurList.length,
        nb_livreurs_actifs: livreursActifs.length,
        nb_livreurs_dispo: livreursDispo.length,
        nb_livreurs_en_course: livreursEnCourse.length,
        nb_livreurs_hors_ligne: livreursHorsLigne.length,

        // Courses
        nb_courses: courseList.length,
        nb_courses_today: coursesToday.length,
        nb_courses_en_traitement: coursesEnTraitement.length,
        nb_courses_livrees: coursesLivrees.length,
        nb_courses_annulees: coursesAnnulees.length,
        nb_courses_programmees: coursesProgrammees.length,

        // Finance — cache (source d'affichage)
        volume_courses_total: cacheVolume,
        total_commissions_silgapp: cacheCommissions,
        total_paiements: cachePaiements,
        montant_du_silgapp: cacheDu,

        // Finance — ledger (source de vérité, pour audit)
        ledger_volume: ledgerVolume,
        ledger_commissions: ledgerCommissions,
        ledger_paiements: ledgerPaiements,
        ledger_du: ledgerDu,

        divergence,
      };
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. KPI GLOBAUX
    // ═══════════════════════════════════════════════════════════════════════════
    const totalEnterprises = perEnterprise.length;
    const activeEnterprises = perEnterprise.filter((e: any) => e.statut === 'actif').length;
    const suspendedEnterprises = perEnterprise.filter((e: any) => e.statut === 'suspendu').length;

    const totalLivreurs = allLivreurs.length;
    const totalLivreursActifs = allLivreurs.filter((l: any) => l.actif !== false && l.validation === 'valide').length;
    const totalLivreursDispo = allLivreurs.filter((l: any) => l.statut === 'disponible' && l.actif !== false).length;
    const totalLivreursEnCourse = allLivreurs.filter((l: any) => l.statut === 'en_course').length;
    const totalLivreursHorsLigne = allLivreurs.filter((l: any) => l.statut === 'hors_ligne').length;

    const totalCourses = allCourses.length;
    const totalCoursesToday = allCourses.filter((c: any) => c.created_date && new Date(c.created_date) >= todayStart).length;
    const totalCoursesEnTraitement = allCourses.filter((c: any) => TRAITEMENT_STATUSES.includes(c.statut)).length;
    const totalCoursesLivrees = allCourses.filter((c: any) => c.statut === 'livree').length;
    const totalCoursesAnnulees = allCourses.filter((c: any) => c.statut === 'annulee').length;
    const totalCoursesProgrammees = allCourses.filter((c: any) => c.statut === 'programmee').length;

    // Finance globale — depuis le cache (source d'affichage)
    const totalVolume = perEnterprise.reduce((s: number, e: any) => s + e.volume_courses_total, 0);
    const totalCommissions = perEnterprise.reduce((s: number, e: any) => s + e.total_commissions_silgapp, 0);
    const totalPaiements = perEnterprise.reduce((s: number, e: any) => s + e.total_paiements, 0);
    const totalDu = perEnterprise.reduce((s: number, e: any) => s + e.montant_du_silgapp, 0);

    // Finance globale — depuis le ledger (source de vérité)
    const totalLedgerVolume = perEnterprise.reduce((s: number, e: any) => s + e.ledger_volume, 0);
    const totalLedgerCommissions = perEnterprise.reduce((s: number, e: any) => s + e.ledger_commissions, 0);
    const totalLedgerPaiements = perEnterprise.reduce((s: number, e: any) => s + e.ledger_paiements, 0);
    const totalLedgerDu = perEnterprise.reduce((s: number, e: any) => s + e.ledger_du, 0);

    const divergences = perEnterprise.filter((e: any) => e.divergence);

    return Response.json({
      success: true,
      kpis: {
        enterprises: {
          total: totalEnterprises,
          actives: activeEnterprises,
          suspendues: suspendedEnterprises,
        },
        livreurs: {
          total: totalLivreurs,
          actifs: totalLivreursActifs,
          disponibles: totalLivreursDispo,
          en_course: totalLivreursEnCourse,
          hors_ligne: totalLivreursHorsLigne,
        },
        courses: {
          total: totalCourses,
          today: totalCoursesToday,
          en_traitement: totalCoursesEnTraitement,
          livrees: totalCoursesLivrees,
          annulees: totalCoursesAnnulees,
          programmees: totalCoursesProgrammees,
        },
        finance: {
          volume_total: totalVolume,
          commissions_silgapp: totalCommissions,
          paiements_recus: totalPaiements,
          montant_du: totalDu,
          // Source de vérité (ledger)
          ledger_volume_total: totalLedgerVolume,
          ledger_commissions: totalLedgerCommissions,
          ledger_paiements: totalLedgerPaiements,
          ledger_du: totalLedgerDu,
        },
      },
      enterprises: perEnterprise,
      divergence_count: divergences.length,
      divergence_enterprise_ids: divergences.map((e: any) => e.enterprise_financier_id),
    });
  } catch (error) {
    console.error('[getEnterpriseGlobalSuivi] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}