import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';

// ═══════════════════════════════════════════════════════════════════════════
// silgappCopilotQuery — Copilote de direction SILGAPP pour ChatGPT (MCP)
//
// PHASE 1 — READ-ONLY
//   • Super Admin SILGAPP uniquement (user.role === 'admin')
//   • Aucune écriture, modification ou suppression possible
//   • Données minimisées (aucun secret, token, OTP, mot de passe, téléphone, email)
//   • Rate limiting : 30 appels/minute par utilisateur
//   • Logs d'accès pour audit
//
// Architecture : un seul handler backend pour 17 outils MCP custom.
// Le paramètre `tool` (discriminateur) route vers la logique métier.
// ═══════════════════════════════════════════════════════════════════════════

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_CALLS = 30;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userEmail: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userEmail);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userEmail, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_CALLS) return false;
  entry.count++;
  return true;
}

function logAccess(user: any, tool: string, params: any) {
  const paramsStr = JSON.stringify(params).slice(0, 300);
  console.log(`[COPILOT] ${new Date().toISOString()} | ${user.email} | ${tool} | ${paramsStr}`);
}

// ── Minimisation des données retournées ──
function minimizeCourse(c: any) {
  return {
    id: c.id,
    type_course: c.type_course,
    statut: c.statut,
    dispatch_status: c.dispatch_status,
    country_code: c.country_code,
    created_date: c.created_date,
    adresse_depart: c.adresse_depart,
    adresse_arrivee: c.adresse_arrivee,
    ville_depart: c.ville_depart,
    ville_arrivee: c.ville_arrivee,
    prix_final: c.prix_final,
    devise: c.devise,
    livreur_nom: c.livreur_nom,
    client_nom: c.client_nom,
    heure_acceptation: c.heure_acceptation,
    heure_livraison: c.heure_livraison,
    distance_reelle_km: c.distance_reelle_km,
    is_enterprise: !!c.enterprise_id,
  };
}

function minimizeDriver(l: any) {
  return {
    id: l.id,
    prenom: l.prenom,
    nom: l.nom,
    statut: l.statut,
    validation: l.validation,
    actif: l.actif,
    country_code: l.country_code,
    ville: l.ville,
    vehicule: l.vehicule,
    note_moyenne: l.note_moyenne,
    nombre_avis: l.nombre_avis,
    courses_du_jour: l.courses_du_jour,
    derniere_position_date: l.derniere_position_date,
    last_seen_at: l.last_seen_at,
    is_enterprise: !!l.enterprise_id,
  };
}

function minimizeClient(c: any) {
  return {
    id: c.id,
    nom: c.nom,
    prenom: c.prenom,
    country_code: c.country_code,
    ville: c.ville,
    statut_crm: c.statut_crm,
    nb_courses_total: c.nb_courses_total,
    montant_total_depense: c.montant_total_depense,
    derniere_course_date: c.derniere_course_date,
  };
}

function getStartOfToday(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // ── Super Admin SILGAPP uniquement ──
    if (user.role !== 'admin') {
      return Response.json({ error: 'Super Admin requis' }, { status: 403 });
    }

    // ── Rate limiting ──
    if (!checkRateLimit(user.email)) {
      return Response.json({ error: 'Rate limit dépassé (30 appels/min)' }, { status: 429 });
    }

    const payload = await req.json().catch(() => ({}));
    const { tool, ...params } = payload;

    if (!tool) {
      return Response.json({ error: 'Paramètre tool requis' }, { status: 400 });
    }

    logAccess(user, tool, params);

    const now = new Date();
    const startOfToday = getStartOfToday();

    // ═════════════════════════════════════════════════════════════════════
    // 1. get_silgapp_overview — Vue d'ensemble globale
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_silgapp_overview') {
      const { date_debut, date_fin, country_code } = params;
      const fin = date_fin ? new Date(date_fin + 'T23:59:59.999Z') : now;
      const debut = date_debut ? new Date(date_debut + 'T00:00:00.000Z') : new Date(now.getTime() - 30 * 24 * 3600 * 1000);

      const [clients, livreurs, courses, boutiques, restaurants, pharmacies] = await Promise.all([
        base44.asServiceRole.entities.ClientExterne.list("-created_date", 5000),
        base44.asServiceRole.entities.Livreur.list("-created_date", 5000),
        base44.asServiceRole.entities.CourseExterne.list("-created_date", 5000),
        base44.asServiceRole.entities.Boutique.list("-created_date", 5000),
        base44.asServiceRole.entities.Restaurant.list("-created_date", 5000),
        base44.asServiceRole.entities.Pharmacie.list("-created_date", 5000),
      ]);

      const filterPays = (arr: any[]) => {
        if (!country_code || country_code === 'ALL') return arr;
        return arr.filter(item => item.country_code === country_code || item.pays_code === country_code);
      };

      const fClients = filterPays(clients);
      const fLivreurs = filterPays(livreurs);
      const fCourses = filterPays(courses);

      const periodCourses = fCourses.filter(c => {
        const d = new Date(c.created_date);
        return d >= debut && d <= fin;
      });

      const deliveredInPeriod = periodCourses.filter(c => c.statut === 'livree');

      return Response.json({
        success: true,
        tool,
        periode: { debut: debut.toISOString(), fin: fin.toISOString() },
        kpis: {
          total_clients: fClients.length,
          total_livreurs: fLivreurs.length,
          total_partenaires: filterPays(boutiques).length + filterPays(restaurants).length + filterPays(pharmacies).length,
          courses_creees: periodCourses.length,
          courses_terminees: deliveredInPeriod.length,
          courses_annulees: periodCourses.filter(c => c.statut === 'annulee').length,
          livreurs_en_ligne: fLivreurs.filter(l => l.statut === 'disponible' || l.statut === 'en_course').length,
          ca_total: deliveredInPeriod.reduce((sum, c) => sum + (c.prix_final || 0), 0),
        },
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 2. get_courses_today — Courses créées aujourd'hui
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_courses_today') {
      const { country_code, limit } = params;
      const maxLimit = Math.min(Number(limit) || 50, 200);

      const courses = await base44.asServiceRole.entities.CourseExterne.list("-created_date", 5000);
      const todayCourses = (courses || []).filter(c =>
        c.created_date && new Date(c.created_date) >= new Date(startOfToday) &&
        (!country_code || c.country_code === country_code)
      );

      const statusBreakdown: Record<string, number> = {};
      for (const c of todayCourses) {
        statusBreakdown[c.statut] = (statusBreakdown[c.statut] || 0) + 1;
      }

      return Response.json({
        success: true,
        tool,
        count: todayCourses.length,
        status_breakdown: statusBreakdown,
        courses: todayCourses.slice(0, maxLimit).map(minimizeCourse),
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 3. get_courses_in_progress — Courses actuellement en cours
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_courses_in_progress') {
      const { country_code, limit } = params;
      const maxLimit = Math.min(Number(limit) || 50, 200);

      const courses = await base44.asServiceRole.entities.CourseExterne.list("-created_date", 2000);
      const inProgress = (courses || []).filter(c =>
        !['livree', 'annulee'].includes(c.statut) &&
        (!country_code || c.country_code === country_code)
      );

      const statusBreakdown: Record<string, number> = {};
      for (const c of inProgress) {
        statusBreakdown[c.statut] = (statusBreakdown[c.statut] || 0) + 1;
      }

      return Response.json({
        success: true,
        tool,
        count: inProgress.length,
        status_breakdown: statusBreakdown,
        courses: inProgress.slice(0, maxLimit).map(minimizeCourse),
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 4. get_completed_courses — Courses livrées
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_completed_courses') {
      const { date_debut, date_fin, country_code, limit } = params;
      const maxLimit = Math.min(Number(limit) || 50, 200);
      const fin = date_fin ? new Date(date_fin + 'T23:59:59.999Z') : now;
      const debut = date_debut ? new Date(date_debut + 'T00:00:00.000Z') : new Date(startOfToday);

      const courses = await base44.asServiceRole.entities.CourseExterne.list("-created_date", 2000);
      const completed = (courses || []).filter(c =>
        c.statut === 'livree' &&
        c.heure_livraison && new Date(c.heure_livraison) >= debut && new Date(c.heure_livraison) <= fin &&
        (!country_code || c.country_code === country_code)
      );

      return Response.json({
        success: true,
        tool,
        count: completed.length,
        total_revenue: completed.reduce((sum, c) => sum + (c.prix_final || 0), 0),
        courses: completed.slice(0, maxLimit).map(minimizeCourse),
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 5. get_pending_courses — Courses en attente de dispatch
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_pending_courses') {
      const { country_code, limit } = params;
      const maxLimit = Math.min(Number(limit) || 50, 200);

      const courses = await base44.asServiceRole.entities.CourseExterne.list("-created_date", 1000);
      const pending = (courses || []).filter(c =>
        ['nouvelle', 'en_attente', 'recherche_livreur'].includes(c.statut) &&
        (!country_code || c.country_code === country_code)
      );

      return Response.json({
        success: true,
        tool,
        count: pending.length,
        status_breakdown: {
          nouvelle: pending.filter(c => c.statut === 'nouvelle').length,
          en_attente: pending.filter(c => c.statut === 'en_attente').length,
          recherche_livreur: pending.filter(c => c.statut === 'recherche_livreur').length,
        },
        courses: pending.slice(0, maxLimit).map(minimizeCourse),
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 6. get_blocked_courses — Courses bloquées (dispatch épuisé)
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_blocked_courses') {
      const { country_code, limit } = params;
      const maxLimit = Math.min(Number(limit) || 50, 200);

      const courses = await base44.asServiceRole.entities.CourseExterne.list("-created_date", 1000);
      const blocked = (courses || []).filter(c =>
        (c.dispatch_status === 'cycle_epuise' || c.statut === 'en_attente') &&
        (!country_code || c.country_code === country_code)
      );

      return Response.json({
        success: true,
        tool,
        count: blocked.length,
        courses: blocked.slice(0, maxLimit).map(minimizeCourse),
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 7. get_available_drivers — Livreurs disponibles
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_available_drivers') {
      const { country_code, limit } = params;
      const maxLimit = Math.min(Number(limit) || 50, 200);

      const livreurs = await base44.asServiceRole.entities.Livreur.list("-created_date", 2000);
      const available = (livreurs || []).filter(l =>
        l.statut === 'disponible' && l.actif !== false && l.validation === 'valide' &&
        (!country_code || l.country_code === country_code)
      );

      return Response.json({
        success: true,
        tool,
        count: available.length,
        drivers: available.slice(0, maxLimit).map(minimizeDriver),
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 8. get_active_drivers — Livreurs actifs (en course ou récemment connectés)
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_active_drivers') {
      const { country_code, limit } = params;
      const maxLimit = Math.min(Number(limit) || 50, 200);
      const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);

      const livreurs = await base44.asServiceRole.entities.Livreur.list("-created_date", 2000);
      const active = (livreurs || []).filter(l => {
        const isOnline = l.last_seen_at && new Date(l.last_seen_at) >= tenMinAgo;
        const isInCourse = l.statut === 'en_course';
        return (isOnline || isInCourse) && l.actif !== false &&
          (!country_code || l.country_code === country_code);
      });

      return Response.json({
        success: true,
        tool,
        count: active.length,
        breakdown: {
          en_course: active.filter(l => l.statut === 'en_course').length,
          en_ligne: active.filter(l => l.statut !== 'en_course').length,
        },
        drivers: active.slice(0, maxLimit).map(minimizeDriver),
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 9. get_active_clients — Clients actifs (courses récentes)
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_active_clients') {
      const { country_code, limit } = params;
      const maxLimit = Math.min(Number(limit) || 50, 200);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

      const clients = await base44.asServiceRole.entities.ClientExterne.list("-created_date", 5000);
      const active = (clients || []).filter(c =>
        c.derniere_course_date && new Date(c.derniere_course_date) >= thirtyDaysAgo &&
        (!country_code || c.country_code === country_code)
      );

      return Response.json({
        success: true,
        tool,
        count: active.length,
        clients: active.slice(0, maxLimit).map(minimizeClient),
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 10. get_daily_revenue — Chiffre d'affaires du jour
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_daily_revenue') {
      const { country_code, date } = params;
      const dayStart = date ? new Date(date + 'T00:00:00.000Z') : new Date(startOfToday);
      const dayEnd = date ? new Date(date + 'T23:59:59.999Z') : now;

      const courses = await base44.asServiceRole.entities.CourseExterne.list("-created_date", 2000);
      const deliveredToday = (courses || []).filter(c =>
        c.statut === 'livree' &&
        c.heure_livraison && new Date(c.heure_livraison) >= dayStart && new Date(c.heure_livraison) <= dayEnd &&
        (!country_code || c.country_code === country_code)
      );

      const revenue = deliveredToday.reduce((sum, c) => sum + (c.prix_final || 0), 0);
      const commissions = deliveredToday.reduce((sum, c) => sum + (c.commission_silga || 0), 0);

      return Response.json({
        success: true,
        tool,
        date: dayStart.toISOString().split('T')[0],
        courses_livrees: deliveredToday.length,
        chiffre_affaires: revenue,
        commissions_silga: commissions,
        montant_livreurs: revenue - commissions,
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 11. get_daily_metrics — Métriques du jour
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_daily_metrics') {
      const { country_code } = params;

      const [courses, livreurs, clients] = await Promise.all([
        base44.asServiceRole.entities.CourseExterne.list("-created_date", 2000),
        base44.asServiceRole.entities.Livreur.list("-created_date", 2000),
        base44.asServiceRole.entities.ClientExterne.list("-created_date", 2000),
      ]);

      const fCourses = (courses || []).filter(c => !country_code || c.country_code === country_code);
      const fLivreurs = (livreurs || []).filter(l => !country_code || l.country_code === country_code);
      const fClients = (clients || []).filter(c => !country_code || c.country_code === country_code);

      const todayCourses = fCourses.filter(c => c.created_date && new Date(c.created_date) >= new Date(startOfToday));
      const deliveredToday = todayCourses.filter(c => c.statut === 'livree');
      const cancelledToday = todayCourses.filter(c => c.statut === 'annulee');
      const inProgress = fCourses.filter(c => !['livree', 'annulee'].includes(c.statut));

      return Response.json({
        success: true,
        tool,
        date: now.toISOString().split('T')[0],
        metrics: {
          courses_creees_aujourdhui: todayCourses.length,
          courses_livrees_aujourdhui: deliveredToday.length,
          courses_annulees_aujourdhui: cancelledToday.length,
          courses_en_cours: inProgress.length,
          livreurs_disponibles: fLivreurs.filter(l => l.statut === 'disponible' && l.actif !== false).length,
          livreurs_en_course: fLivreurs.filter(l => l.statut === 'en_course').length,
          total_clients: fClients.length,
          ca_aujourdhui: deliveredToday.reduce((sum, c) => sum + (c.prix_final || 0), 0),
        },
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 12. get_metrics_by_period — Métriques sur une période
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_metrics_by_period') {
      const { date_debut, date_fin, country_code } = params;
      const fin = date_fin ? new Date(date_fin + 'T23:59:59.999Z') : now;
      const debut = date_debut ? new Date(date_debut + 'T00:00:00.000Z') : new Date(now.getTime() - 7 * 24 * 3600 * 1000);

      const courses = await base44.asServiceRole.entities.CourseExterne.list("-created_date", 5000);
      const fCourses = (courses || []).filter(c => {
        const d = new Date(c.created_date);
        return d >= debut && d <= fin && (!country_code || c.country_code === country_code);
      });

      const delivered = fCourses.filter(c => c.statut === 'livree');
      const cancelled = fCourses.filter(c => c.statut === 'annulee');

      return Response.json({
        success: true,
        tool,
        periode: { debut: debut.toISOString(), fin: fin.toISOString() },
        metrics: {
          courses_creees: fCourses.length,
          courses_livrees: delivered.length,
          courses_annulees: cancelled.length,
          taux_annulation: fCourses.length > 0 ? Math.round((cancelled.length / fCourses.length) * 100) : 0,
          chiffre_affaires: delivered.reduce((sum, c) => sum + (c.prix_final || 0), 0),
          commissions_silga: delivered.reduce((sum, c) => sum + (c.commission_silga || 0), 0),
          panier_moyen: delivered.length > 0 ? Math.round(delivered.reduce((sum, c) => sum + (c.prix_final || 0), 0) / delivered.length) : 0,
        },
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 13. get_course_details — Détails d'une course
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_course_details') {
      const { course_id } = params;
      if (!course_id) {
        return Response.json({ error: 'course_id requis' }, { status: 400 });
      }

      const courses = await base44.asServiceRole.entities.CourseExterne.filter({ id: course_id });
      const course = courses?.[0];
      if (!course) {
        return Response.json({ error: 'Course introuvable' }, { status: 404 });
      }

      return Response.json({
        success: true,
        tool,
        course: minimizeCourse(course),
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 14. get_driver_details — Détails d'un livreur
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_driver_details') {
      const { driver_id } = params;
      if (!driver_id) {
        return Response.json({ error: 'driver_id requis' }, { status: 400 });
      }

      const livreurs = await base44.asServiceRole.entities.Livreur.filter({ id: driver_id });
      const driver = livreurs?.[0];
      if (!driver) {
        return Response.json({ error: 'Livreur introuvable' }, { status: 404 });
      }

      // Récupérer les courses récentes du livreur
      const recentCourses = await base44.asServiceRole.entities.CourseExterne.filter(
        { livreur_id: driver_id }, '-created_date', 10
      );

      return Response.json({
        success: true,
        tool,
        driver: minimizeDriver(driver),
        recent_courses: (recentCourses || []).map(minimizeCourse),
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 15. get_top_customers — Top clients par activité
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_top_customers') {
      const { limit, country_code } = params;
      const maxLimit = Math.min(Number(limit) || 10, 50);

      const clients = await base44.asServiceRole.entities.ClientExterne.list("-nb_courses_total", 5000);
      const filtered = (clients || []).filter(c =>
        (!country_code || c.country_code === country_code) &&
        (c.nb_courses_total || 0) > 0
      );

      return Response.json({
        success: true,
        tool,
        count: filtered.length,
        top_customers: filtered.slice(0, maxLimit).map(minimizeClient),
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 16. get_top_merchants — Top commerçants (boutiques, restaurants, pharmacies)
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_top_merchants') {
      const { limit, country_code } = params;
      const maxLimit = Math.min(Number(limit) || 10, 50);

      const [boutiques, restaurants, pharmacies] = await Promise.all([
        base44.asServiceRole.entities.Boutique.list("-created_date", 1000),
        base44.asServiceRole.entities.Restaurant.list("-created_date", 1000),
        base44.asServiceRole.entities.Pharmacie.list("-created_date", 1000),
      ]);

      const filterPays = (arr: any[]) => {
        if (!country_code || country_code === 'ALL') return arr;
        return arr.filter(item => item.country_code === country_code || item.pays_code === country_code);
      };

      const allMerchants = [
        ...filterPays(boutiques || []).map((b: any) => ({ id: b.id, nom: b.nom, type: 'boutique', country_code: b.country_code || b.pays_code, actif: b.actif })),
        ...filterPays(restaurants || []).map((r: any) => ({ id: r.id, nom: r.nom, type: 'restaurant', country_code: r.country_code || r.pays_code, actif: r.actif })),
        ...filterPays(pharmacies || []).map((p: any) => ({ id: p.id, nom: p.nom, type: 'pharmacie', country_code: p.country_code || p.pays_code, actif: p.actif })),
      ];

      return Response.json({
        success: true,
        tool,
        count: allMerchants.length,
        breakdown: {
          boutiques: filterPays(boutiques || []).length,
          restaurants: filterPays(restaurants || []).length,
          pharmacies: filterPays(pharmacies || []).length,
        },
        top_merchants: allMerchants.slice(0, maxLimit),
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 17. get_operations_summary — Résumé opérationnel consolidé
    // ═════════════════════════════════════════════════════════════════════
    if (tool === 'get_operations_summary') {
      const { country_code } = params;

      const [courses, livreurs, clients] = await Promise.all([
        base44.asServiceRole.entities.CourseExterne.list("-created_date", 2000),
        base44.asServiceRole.entities.Livreur.list("-created_date", 2000),
        base44.asServiceRole.entities.ClientExterne.list("-created_date", 2000),
      ]);

      const fCourses = (courses || []).filter(c => !country_code || c.country_code === country_code);
      const fLivreurs = (livreurs || []).filter(l => !country_code || l.country_code === country_code);
      const fClients = (clients || []).filter(c => !country_code || c.country_code === country_code);

      const todayCourses = fCourses.filter(c => c.created_date && new Date(c.created_date) >= new Date(startOfToday));
      const inProgress = fCourses.filter(c => !['livree', 'annulee'].includes(c.statut));
      const deliveredToday = todayCourses.filter(c => c.statut === 'livree');

      return Response.json({
        success: true,
        tool,
        summary: {
          courses: {
            aujourdhui: todayCourses.length,
            en_cours: inProgress.length,
            livrees_aujourdhui: deliveredToday.length,
            total_livrees: fCourses.filter(c => c.statut === 'livree').length,
            annulees_aujourdhui: todayCourses.filter(c => c.statut === 'annulee').length,
          },
          livreurs: {
            total: fLivreurs.length,
            disponibles: fLivreurs.filter(l => l.statut === 'disponible' && l.actif !== false).length,
            en_course: fLivreurs.filter(l => l.statut === 'en_course').length,
            hors_ligne: fLivreurs.filter(l => l.statut === 'hors_ligne').length,
          },
          clients: {
            total: fClients.length,
            actifs_30j: fClients.filter(c => c.derniere_course_date && new Date(c.derniere_course_date) >= new Date(now.getTime() - 30 * 24 * 3600 * 1000)).length,
          },
          finances: {
            ca_aujourdhui: deliveredToday.reduce((sum, c) => sum + (c.prix_final || 0), 0),
            commissions_aujourdhui: deliveredToday.reduce((sum, c) => sum + (c.commission_silga || 0), 0),
          },
        },
        updated_at: now.toISOString(),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    // Tool inconnu
    // ═════════════════════════════════════════════════════════════════════
    return Response.json({ error: `Tool inconnu: ${tool}` }, { status: 400 });

  } catch (error) {
    console.error('[silgappCopilotQuery] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});