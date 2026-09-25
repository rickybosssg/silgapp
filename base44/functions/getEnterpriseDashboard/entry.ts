import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { isEnterpriseAdmin } from '../../shared/enterpriseFinance.ts';

// ═══════════════════════════════════════════════════════════════════════════
// getEnterpriseDashboard — Données filtrées par tenant pour l'Admin Entreprise
//
// RÈGLE DE SÉCURITÉ : enterprise_id est résolu côté backend depuis l'utilisateur.
// Le frontend ne peut JAMAIS fournir un enterprise_id.
// Un Admin Entreprise A ne voit QUE les données de son entreprise.
//
// Retourne:
//   - enterprise (infos + branding)
//   - courses (aujourd'hui, en cours, terminées)
//   - livreurs (disponibles, total)
//   - comptabilité (volume, commissions, payé, dû)
//   - ledger (historique financier)
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    // ── RÉSERVÉ AUX ADMINS ENTREPRISE ──
    if (!isEnterpriseAdmin(user)) {
      return Response.json({ error: 'Réservé aux Admins Entreprise' }, { status: 403 });
    }

    const enterpriseId = user.enterprise_id;

    // ── Charger l'enterprise ──
    const enterprises = await base44.asServiceRole.entities.Enterprise.filter({
      enterprise_financier_id: enterpriseId,
    });
    const enterprise = enterprises?.[0];
    if (!enterprise) return Response.json({ error: 'Entreprise introuvable' }, { status: 404 });

    // ── Calculer les dates ──
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // ── Courses de l'entreprise ──
    const allCourses = await base44.asServiceRole.entities.CourseExterne.filter(
      { enterprise_id: enterpriseId },
      '-created_date',
      500
    );

    const coursesToday = (allCourses || []).filter((c: any) =>
      c.created_date && new Date(c.created_date) >= new Date(startOfDay)
    );
    const coursesInProgress = (allCourses || []).filter((c: any) =>
      !['livree', 'annulee'].includes(c.statut)
    );
    const coursesCompleted = (allCourses || []).filter((c: any) => c.statut === 'livree');

    // ── Livreurs de l'entreprise ──
    const livreurs = await base44.asServiceRole.entities.Livreur.filter(
      { enterprise_id: enterpriseId },
      '-created_date',
      200
    );
    const livreursDisponibles = (livreurs || []).filter((l: any) =>
      l.statut === 'disponible' && l.actif !== false
    );

    // ── Comptabilité depuis le ledger ──
    const ledger = await base44.asServiceRole.entities.EnterpriseLedger.filter(
      { enterprise_financier_id: enterpriseId },
      '-created_date',
      100
    );

    const commissionsTotal = (ledger || [])
      .filter((e: any) => e.type === 'commission_course')
      .reduce((sum: number, e: any) => sum + Number(e.montant || 0), 0);

    const paiementsTotal = (ledger || [])
      .filter((e: any) => e.type === 'paiement')
      .reduce((sum: number, e: any) => sum + Number(e.montant || 0), 0);

    const volumeTotal = (allCourses || [])
      .filter((c: any) => c.statut === 'livree')
      .reduce((sum: number, c: any) => sum + Number(c.prix_final || 0), 0);

    const montantDu = commissionsTotal - paiementsTotal;

    // ── Courses ce mois ──
    const coursesThisMonth = (allCourses || []).filter((c: any) =>
      c.created_date && new Date(c.created_date) >= new Date(startOfMonth)
    );

    return Response.json({
      success: true,
      enterprise: {
        id: enterprise.id,
        nom: enterprise.nom,
        slug: enterprise.slug,
        logo_url: enterprise.logo_url,
        couleur_primaire: enterprise.couleur_primaire,
        country_code: enterprise.country_code,
        commission_silgapp_pct: enterprise.commission_silgapp_pct,
        statut: enterprise.statut,
        date_creation: enterprise.date_creation,
      },
      stats: {
        courses_today: coursesToday.length,
        courses_in_progress: coursesInProgress.length,
        courses_completed: coursesCompleted.length,
        courses_this_month: coursesThisMonth.length,
        livreurs_total: (livreurs || []).length,
        livreurs_disponibles: livreursDisponibles.length,
        volume_courses: volumeTotal,
        total_commissions: commissionsTotal,
        total_paiements: paiementsTotal,
        montant_du_silgapp: montantDu,
        taux_silgapp: Number(enterprise.commission_silgapp_pct) || 0,
      },
      courses: {
        today: coursesToday.slice(0, 20),
        in_progress: coursesInProgress.slice(0, 20),
        recent: (allCourses || []).slice(0, 20),
      },
      livreurs: (livreurs || []).slice(0, 50),
      ledger: (ledger || []).slice(0, 50),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}