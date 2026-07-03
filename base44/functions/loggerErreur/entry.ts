import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}

    const { message, type_erreur, stack, fichier, ligne, page_url, user_agent } = body;

    if (!message) return Response.json({ error: 'Message requis' }, { status: 400 });

    // Déduplication : chercher une erreur identique (même message + type) non résolue
    const existing = await base44.asServiceRole.entities.BugSignale.filter({
      message,
      type_erreur: type_erreur || 'javascript',
      statut: { $in: ['nouveau', 'en_cours'] }
    }).catch(() => []);

    if (existing.length > 0) {
      // Incrémenter le compteur d'occurrences
      const bug = existing[0];
      await base44.asServiceRole.entities.BugSignale.update(bug.id, {
        occurrences: (bug.occurrences || 1) + 1,
        derniere_occurrence: new Date().toISOString(),
      });
      return Response.json({ success: true, deduplicated: true, bug_id: bug.id });
    }

    // Déterminer la priorité automatiquement
    const msgLower = (message || '').toLowerCase();
    let priorite = 'moyenne';
    if (msgLower.includes('white screen') || msgLower.includes('crash') || msgLower.includes('undefined is not') || msgLower.includes('cannot read prop')) {
      priorite = 'critique';
    } else if (msgLower.includes('network') || msgLower.includes('fetch') || msgLower.includes('timeout')) {
      priorite = 'elevee';
    }

    // Déterminer le type d'utilisateur
    let user_type = 'anonyme';
    let user_email = null;
    if (user) {
      user_email = user.email;
      // Heuristique simple basée sur les métadonnées utilisateur
      const role = user.role || user.silgapp_role;
      if (role === 'admin') user_type = 'admin';
      else if (role === 'livreur') user_type = 'livreur';
      else if (role === 'partenaire') user_type = 'partenaire';
      else user_type = 'client';
    }

    const bug = await base44.asServiceRole.entities.BugSignale.create({
      message: message.substring(0, 2000),
      type_erreur: type_erreur || 'javascript',
      stack: stack ? stack.substring(0, 5000) : null,
      fichier: fichier || null,
      ligne: ligne || null,
      user_email,
      user_type,
      page_url: page_url || null,
      user_agent: user_agent || null,
      priorite,
      occurrences: 1,
      derniere_occurrence: new Date().toISOString(),
    });

    return Response.json({ success: true, bug_id: bug.id, priorite });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});