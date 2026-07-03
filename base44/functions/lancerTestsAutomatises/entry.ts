import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin uniquement' }, { status: 403 });

    const results = [];
    let score = 0;
    let total = 0;

    // ─── Test 1: Intégrité des courses (pas de statut orphelin) ───
    total++;
    try {
      const coursesBloquees = await base44.asServiceRole.entities.CourseExterne.filter({
        statut: 'livreur_en_route',
        livreur_id: { $exists: false }
      });
      const ok = coursesBloquees.length === 0;
      results.push({
        test: 'Intégrité courses — pas de course en route sans livreur',
        statut: ok ? 'success' : 'warning',
        detail: ok ? 'OK' : `${coursesBloquees.length} course(s) sans livreur assigné`,
      });
      if (ok) score++;
    } catch (e) {
      results.push({ test: 'Intégrité courses', statut: 'error', detail: e.message });
    }

    // ─── Test 2: Tokens de notification actifs ───
    total++;
    try {
      const tokens = await base44.asServiceRole.entities.NotificationToken.filter({ actif: true });
      const taux = tokens.length > 0 ? Math.round((tokens.length / Math.max(tokens.length, 1)) * 100) : 0;
      const ok = tokens.length > 0;
      results.push({
        test: 'Tokens notification — au moins un token actif',
        statut: ok ? 'success' : 'warning',
        detail: `${tokens.length} token(s) actif(s)`,
      });
      if (ok) score++;
    } catch (e) {
      results.push({ test: 'Tokens notification', statut: 'error', detail: e.message });
    }

    // ─── Test 3: Fraîcheur GPS livreurs ───
    total++;
    try {
      const livreurs = await base44.asServiceRole.entities.Livreur.filter({ statut: 'disponible' });
      const now = Date.now();
      const frais = livreurs.filter(l => {
        if (!l.derniere_position_date) return false;
        return (now - new Date(l.derniere_position_date).getTime()) < 10 * 60 * 1000; // 10 min
      });
      const ok = livreurs.length === 0 || frais.length > 0;
      results.push({
        test: 'Fraîcheur GPS — livreurs disponibles avec position récente',
        statut: ok ? 'success' : 'warning',
        detail: livreurs.length === 0 ? 'Aucun livreur disponible' : `${frais.length}/${livreurs.length} livreurs avec GPS frais`,
      });
      if (ok) score++;
    } catch (e) {
      results.push({ test: 'Fraîcheur GPS livreurs', statut: 'error', detail: e.message });
    }

    // ─── Test 4: Pas de courses fantômes (nouvelle > 30 min sans dispatch) ───
    total++;
    try {
      const courses = await base44.asServiceRole.entities.CourseExterne.filter({ statut: 'nouvelle' });
      const now = Date.now();
      const fantomes = courses.filter(c => {
        if (!c.created_date) return false;
        return (now - new Date(c.created_date).getTime()) > 30 * 60 * 1000;
      });
      const ok = fantomes.length === 0;
      results.push({
        test: 'Pas de courses fantômes — nouvelle < 30 min',
        statut: ok ? 'success' : 'warning',
        detail: ok ? 'OK' : `${fantomes.length} course(s) en attente > 30 min`,
      });
      if (ok) score++;
    } catch (e) {
      results.push({ test: 'Courses fantômes', statut: 'error', detail: e.message });
    }

    // ─── Test 5: Entités partenaires accessibles ───
    total++;
    try {
      const boutiques = await base44.asServiceRole.entities.Boutique.filter({ actif: true });
      const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ actif: true });
      const ok = true; // Si on arrive ici sans erreur, les entités répondent
      results.push({
        test: 'Entités partenaires — boutiques & restaurants accessibles',
        statut: 'success',
        detail: `${boutiques.length} boutique(s), ${restaurants.length} restaurant(s) actifs`,
      });
      if (ok) score++;
    } catch (e) {
      results.push({ test: 'Entités partenaires', statut: 'error', detail: e.message });
    }

    // ─── Test 6: Messages — pas de messages orphelins (sans sender) ───
    total++;
    try {
      const messages = await base44.asServiceRole.entities.Message.list('-created_date', 50);
      const orphelins = messages.filter(m => !m.sender_id || !m.sender_type);
      const ok = orphelins.length === 0;
      results.push({
        test: 'Messages — pas de messages orphelins',
        statut: ok ? 'success' : 'warning',
        detail: ok ? 'OK' : `${orphelins.length} message(s) sans expéditeur`,
      });
      if (ok) score++;
    } catch (e) {
      results.push({ test: 'Messages orphelins', statut: 'error', detail: e.message });
    }

    const tauxReussite = total > 0 ? Math.round((score / total) * 100) : 0;

    return Response.json({
      success: true,
      score: score,
      total: total,
      taux_reussite: tauxReussite,
      resume: `${score}/${total} tests réussis (${tauxReussite}%) — ${results.filter(r => r.statut === 'warning').length} avertissement(s), ${results.filter(r => r.statut === 'error').length} erreur(s)`,
      tests: results,
      date: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});