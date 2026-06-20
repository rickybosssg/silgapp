import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token } = payload;

    if (!token) {
      return Response.json({ error: 'Token requis' }, { status: 400 });
    }

    // Valider le token via service role (sans auth utilisateur)
    const tokens = await base44.asServiceRole.entities.DemoAccess.filter({ token, actif: true });

    if (tokens.length === 0) {
      return Response.json({ valid: false, reason: 'invalid' });
    }

    const t = tokens[0];
    const expired = new Date(t.expire_le) < new Date();

    if (expired) {
      await base44.asServiceRole.entities.DemoAccess.update(t.id, { actif: false });
      return Response.json({ valid: false, reason: 'expired' });
    }

    // Récupérer toutes les stats (service role = pas besoin d'auth)
    const [clients, livreurs, courses, pays] = await Promise.all([
      base44.asServiceRole.entities.ClientExterne.list(),
      base44.asServiceRole.entities.Livreur.list(),
      base44.asServiceRole.entities.CourseExterne.list('-created_date', 500),
      base44.asServiceRole.entities.Country.list('ordre'),
    ]);

    const clientsActifs = clients.filter(c => c.actif).length;
    const livreursValides = livreurs.filter(l => l.validation === 'valide' && l.actif).length;
    const coursesLivrees = courses.filter(c => c.statut === 'livree');
    const coursesAnnulees = courses.filter(c => c.statut === 'annulee').length;
    const coursesEnCoursCount = courses.filter(c => !['nouvelle', 'annulee', 'livree', 'programmee'].includes(c.statut)).length;
    const paysUniques = [...new Set(courses.filter(c => c.country_code).map(c => c.country_code))];
    const paysActifs = pays.filter(p => p.actif);

    const ilYa30Jours = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const coursesRecentes = courses.filter(c => new Date(c.created_date) >= ilYa30Jours);

    const coursesExpedier = courses.filter(c => c.type_course === 'expedier').length;
    const coursesRecevoir = courses.filter(c => c.type_course === 'recevoir').length;
    const coursesDeplacement = courses.filter(c => c.type_course === 'deplacement').length;

    const statsByPays = paysActifs.map(p => {
      const crs = courses.filter(c => c.country_code === p.code);
      const lvres = crs.filter(c => c.statut === 'livree');
      const lvrs = livreurs.filter(l => l.country_code === p.code && l.validation === 'valide');
      const cls = clients.filter(c => c.country_code === p.code);
      return {
        code: p.code,
        nom: p.nom,
        emoji: p.emoji_flag || '🌍',
        courses: crs.length,
        livrees: lvres.length,
        livreurs: lvrs.length,
        clients: cls.length,
      };
    }).sort((a, b) => b.courses - a.courses);

    const dernieresLivrees = coursesLivrees
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 10)
      .map(c => ({
        created_date: c.created_date,
        type_course: c.type_course,
        country_code: c.country_code,
        client_nom: c.client_nom,
        statut: c.statut,
      }));

    const derniereConnexion = Math.max(
      ...clients.filter(c => c.last_seen_at).map(c => new Date(c.last_seen_at).getTime()),
      ...livreurs.filter(l => l.last_seen_at).map(l => new Date(l.last_seen_at).getTime()),
      0
    );

    return Response.json({
      valid: true,
      stats: {
        clients: clients.length,
        clientsActifs,
        livreurs: livreurs.length,
        livreursValides,
        courses: courses.length,
        coursesLivrees: coursesLivrees.length,
        coursesAnnulees,
        coursesEnCours: coursesEnCoursCount,
        coursesRecentes: coursesRecentes.length,
        paysUniques: paysUniques.length,
        paysNoms: paysUniques.join(', '),
        coursesExpedier,
        coursesRecevoir,
        coursesDeplacement,
        statsByPays,
        dernieresLivrees,
        derniereConnexion: derniereConnexion > 0 ? new Date(derniereConnexion).toISOString() : null,
      },
    });

  } catch (error) {
    console.error('[getDemoStats] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});