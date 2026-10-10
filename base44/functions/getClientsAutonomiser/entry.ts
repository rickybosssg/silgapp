import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    let user;
    try {
      user = await base44.auth.me();
    } catch {
      return Response.json({ error: "Authentification requise." }, { status: 401 });
    }
    if (!user) return Response.json({ error: "Authentification requise." }, { status: 401 });
    if (user.role !== "admin") {
      return Response.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
    }

    const computeAutonomyStatus = (client) => {
      const total = client.total_courses || 0;
      const adminCount = client.admin_count || 0;
      const appCount = client.app_count || 0;

      if (total < 5) return "faible_potentiel";

      const pctAdmin = total > 0 ? adminCount / total : 0;

      // AUTONOME : ≥2 courses app ET <50% admin
      if (appCount >= 2 && pctAdmin < 0.5) return "autonome";

      // Utilise l'app : ≥2 courses app mais encore ≥50% admin
      if (appCount >= 2) return "utilise_app";

      // À accompagner : ≥70% admin, <2 courses app
      if (pctAdmin >= 0.7) return "a_accompagner";

      return "potentiel_moyen";
    };

    const now = Date.now();
    const days30 = now - 30 * 86400000;

    // Preserve the existing pagination and population; only courses_30j has a date filter.
    let allCourses = [];
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.CourseExterne.filter(
        {}, "-created_date", 500, skip
      );
      if (!batch || batch.length === 0) break;
      allCourses.push(...batch);
      if (batch.length < 500) break;
      skip += 500;
      if (skip > 3000) break;
    }

    // Grouper par client (phone_normalized en priorité, email en fallback)
    const clientMap = new Map();
    for (const c of allCourses) {
      const phone = (c.client_phone_normalized || "").trim();
      const email = (c.client_user_email || "").trim().toLowerCase();
      const key = phone || (email ? `email:${email}` : null) || `raw:${c.client_telephone || c.client_nom || "unknown"}`;

      if (!clientMap.has(key)) {
        clientMap.set(key, {
          phone_normalized: phone || null,
          email: email || null,
          client_nom: c.client_nom || "",
          client_telephone: c.client_telephone || "",
          courses: [],
        });
      }
      clientMap.get(key).courses.push(c);
    }

    // Calculer stats par client
    const clientStats = [];
    for (const [key, data] of clientMap) {
      const courses = data.courses;
      const courses30 = courses.filter(c => c.created_date && new Date(c.created_date).getTime() >= days30);

      // Preserve the existing minimum across the loaded population.
      if (courses.length < 5) continue;

      const adminCount = courses.filter(c => c.source === "admin").length;
      const appCount = courses.filter(c => c.source === "client").length;
      const venusCount = courses.filter(c => c.created_by_venus === true).length;
      const livrees = courses.filter(c => c.statut === "livree").length;

      // Départ récurrent
      const departs = courses.map(c => (c.quartier_depart || c.adresse_depart || "").trim()).filter(Boolean);
      const departCounts = {};
      for (const d of departs) departCounts[d] = (departCounts[d] || 0) + 1;
      const topDepart = Object.entries(departCounts).sort((a, b) => b[1] - a[1])[0];
      const pctSameDepart = topDepart && courses.length > 0 ? Math.round((topDepart[1] / courses.length) * 100) : 0;

      const lastCourse = courses.length > 0 ? courses[0].created_date : null;

      const status = computeAutonomyStatus({
        total_courses: courses.length,
        admin_count: adminCount,
        app_count: appCount,
      });

      clientStats.push({
        key,
        phone_normalized: data.phone_normalized,
        email: data.email,
        client_nom: data.client_nom,
        client_telephone: data.client_telephone,
        total_courses: courses.length,
        courses_30j: courses30.length,
        admin_count: adminCount,
        app_count: appCount,
        venus_count: venusCount,
        livrees: livrees,
        pct_admin: courses.length > 0 ? Math.round((adminCount / courses.length) * 100) : 0,
        top_depart: topDepart ? topDepart[0] : "—",
        pct_same_depart: pctSameDepart,
        last_course: lastCourse,
        status,
      });
    }

    // Trier par courses 30j desc
    clientStats.sort((a, b) => b.courses_30j - a.courses_30j);

    const stats = {
      total: clientStats.length,
      aAccompagner: clientStats.filter(c => c.status === "a_accompagner").length,
      utiliseApp: clientStats.filter(c => c.status === "utilise_app").length,
      autonome: clientStats.filter(c => c.status === "autonome").length,
    };
    // Only send the fields rendered by the panel, never the source courses.
    const clients = clientStats.map(c => ({
      key: c.key,
      client_nom: c.client_nom,
      phone_normalized: c.phone_normalized,
      courses_30j: c.courses_30j,
      admin_count: c.admin_count,
      app_count: c.app_count,
      pct_admin: c.pct_admin,
      pct_same_depart: c.pct_same_depart,
      last_course: c.last_course,
      status: c.status,
    }));
    return Response.json({ clients, stats });
  } catch {
    console.error("[getClientsAutonomiser] Loading failed");
    return Response.json({ error: "Impossible de charger les clients à autonomiser." }, { status: 500 });
  }
}
