import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const { date_debut, date_fin, country_code } = payload;

    const now = new Date();
    const fin = date_fin ? new Date(date_fin + 'T23:59:59.999Z') : now;
    const debut = date_debut ? new Date(date_debut + 'T00:00:00.000Z') : new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    // ── Fetch parallelise de toutes les entites ──
    const [clients, livreurs, users, pharmacies, boutiques, restaurants, courses, deviceSessions, appInstalls, downloadStats] = await Promise.all([
      base44.asServiceRole.entities.ClientExterne.list("-created_date", 5000),
      base44.asServiceRole.entities.Livreur.list("-created_date", 5000),
      base44.asServiceRole.entities.User.list("-created_date", 5000),
      base44.asServiceRole.entities.Pharmacie.list("-created_date", 5000),
      base44.asServiceRole.entities.Boutique.list("-created_date", 5000),
      base44.asServiceRole.entities.Restaurant.list("-created_date", 5000),
      base44.asServiceRole.entities.CourseExterne.list("-created_date", 5000),
      base44.asServiceRole.entities.DeviceSession.list("-created_date", 5000),
      base44.asServiceRole.entities.AppInstall.list("-created_date", 5000),
      base44.asServiceRole.entities.DownloadStats.list("-created_date", 5000),
    ]);

    // ── Filtrage par pays si demande ──
    const filterPays = (arr, field = 'country_code') => {
      if (!country_code || country_code === 'ALL') return arr;
      return arr.filter(item => item[field] === country_code || item.pays_code === country_code);
    };

    const fClients = filterPays(clients);
    const fLivreurs = filterPays(livreurs);
    const fCourses = filterPays(courses);
    const fPharmacies = filterPays(pharmacies);
    const fBoutiques = filterPays(boutiques);
    const fRestaurants = filterPays(restaurants);
    const fAppInstalls = filterPays(appInstalls);

    // ── KPIs totaux ──
    const total_clients = fClients.length;
    const total_livreurs = fLivreurs.length;
    const total_partenaires = users.filter(u => u.silgapp_role === 'partenaire').length;
    const total_pharmacies = fPharmacies.length;
    const total_boutiques = fBoutiques.length;
    const total_restaurants = fRestaurants.length;

    // ── Livreurs temps reel ──
    const livreurs_en_ligne = fLivreurs.filter(l => l.statut === 'disponible' || l.statut === 'en_course').length;
    const livreurs_hors_ligne = fLivreurs.filter(l => l.statut === 'hors_ligne' || !l.statut).length;

    // ── Utilisateurs connectes (last_seen < 5 min) ──
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const utilisateurs_connectes = deviceSessions.filter(ds =>
      ds.last_seen_at && new Date(ds.last_seen_at) >= fiveMinAgo
    ).length;

    // ── Courses dans la periode ──
    const periodCourses = fCourses.filter(c => {
      const d = new Date(c.created_date);
      return d >= debut && d <= fin;
    });
    const courses_creees = periodCourses.length;
    const courses_terminees = periodCourses.filter(c => c.statut === 'livree').length;
    const courses_annulees = periodCourses.filter(c => c.statut === 'annulee').length;

    // ── Chiffre d'affaires (courses livrees dans la periode) ──
    const deliveredInPeriod = periodCourses.filter(c => c.statut === 'livree');
    const ca_total = deliveredInPeriod.reduce((sum, c) => sum + (c.prix_final || 0), 0);

    // ── Installations ──
    const installs_total = fAppInstalls.length;
    const installs_android = fAppInstalls.filter(i => i.platform === 'android').length;
    const installs_ios = fAppInstalls.filter(i => i.platform === 'ios').length;
    const installs_web = fAppInstalls.filter(i => i.platform === 'web').length;

    // ── Telechargements (DownloadStats) ──
    const telechargements_total = downloadStats.reduce((sum, s) => sum + (s.downloads || 0), 0);

    // ── Generation des jours pour les series temporelles ──
    const days = [];
    const tempDate = new Date(debut);
    tempDate.setHours(0, 0, 0, 0);
    const endDate = new Date(fin);
    endDate.setHours(23, 59, 59, 999);
    while (tempDate <= endDate) {
      days.push(tempDate.toISOString().split('T')[0]);
      tempDate.setDate(tempDate.getDate() + 1);
    }

    // ── Evolution: nouveaux clients par jour ──
    const evolution_users = days.map(day => ({
      date: day,
      count: fClients.filter(c => c.created_date && c.created_date.split('T')[0] === day).length,
    }));

    // ── Evolution: courses par jour ──
    const evolution_courses = days.map(day => {
      const dc = fCourses.filter(c => c.created_date && c.created_date.split('T')[0] === day);
      return {
        date: day,
        creees: dc.length,
        terminees: dc.filter(c => c.statut === 'livree').length,
        annulees: dc.filter(c => c.statut === 'annulee').length,
      };
    });

    // ── Evolution: CA par jour ──
    const evolution_revenue = days.map(day => ({
      date: day,
      montant: fCourses
        .filter(c => c.statut === 'livree' && c.heure_livraison && c.heure_livraison.split('T')[0] === day)
        .reduce((sum, c) => sum + (c.prix_final || 0), 0),
    }));

    // ── Evolution: installations par jour ──
    const evolution_installations = days.map(day => {
      const di = fAppInstalls.filter(i => i.first_opened_at && i.first_opened_at.split('T')[0] === day);
      return {
        date: day,
        android: di.filter(i => i.platform === 'android').length,
        ios: di.filter(i => i.platform === 'ios').length,
        web: di.filter(i => i.platform === 'web').length,
      };
    });

    // ── Evolution: livreurs actifs par jour (unique livreurs ayant livre) ──
    const evolution_livreurs_actifs = days.map(day => {
      const dc = fCourses.filter(c => c.statut === 'livree' && c.heure_livraison && c.heure_livraison.split('T')[0] === day);
      const uniqueLivreurs = new Set(dc.map(c => c.livreur_id).filter(Boolean));
      return { date: day, count: uniqueLivreurs.size };
    });

    // ── Repartition par pays ──
    const PAYS_CODES = ['BF', 'CI', 'TG', 'BJ', 'SN', 'ML', 'GN', 'NE', 'GH'];
    const par_pays = {};
    PAYS_CODES.forEach(code => {
      par_pays[code] = {
        clients: clients.filter(c => c.country_code === code).length,
        livreurs: livreurs.filter(l => l.country_code === code).length,
        courses: courses.filter(c => c.country_code === code).length,
        ca: courses
          .filter(c => c.country_code === code && c.statut === 'livree' && new Date(c.created_date) >= debut && new Date(c.created_date) <= fin)
          .reduce((sum, c) => sum + (c.prix_final || 0), 0),
        installations: appInstalls.filter(i => i.country_code === code).length,
      };
    });

    return Response.json({
      success: true,
      periode: { debut: debut.toISOString(), fin: fin.toISOString() },
      kpis: {
        total_clients, total_livreurs, total_partenaires,
        total_pharmacies, total_boutiques, total_restaurants,
        courses_creees, courses_terminees, courses_annulees,
        livreurs_en_ligne, livreurs_hors_ligne, utilisateurs_connectes,
        ca_total, telechargements_total,
      },
      evolution: {
        users: evolution_users,
        courses: evolution_courses,
        revenue: evolution_revenue,
        installations: evolution_installations,
        livreurs_actifs: evolution_livreurs_actifs,
      },
      par_pays,
      installations: {
        total: installs_total,
        android: installs_android,
        ios: installs_ios,
        web: installs_web,
      },
    });
  } catch (error) {
    console.error('[getStatsGlobales] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});