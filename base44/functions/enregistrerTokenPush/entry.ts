import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json();
    const { token, platform, livreur_id } = body;

    if (!token) {
      return Response.json({ error: 'Token is required' }, { status: 400 });
    }

    // Déterminer le type d'utilisateur
    const user_type = user.role === 'admin' ? 'admin' : 'livreur';

    // Vérifier si le token existe déjà
    const existingTokens = await base44.entities.NotificationToken.filter({
      user_email: user.email,
      token: token,
      platform: platform || 'web',
    });

    if (existingTokens.length > 0) {
      // Mettre à jour le token existant
      await base44.entities.NotificationToken.update(existingTokens[0].id, {
        actif: true,
        derniere_utilisation: new Date().toISOString(),
      });
      return Response.json({ success: true, action: 'updated' });
    }

    // Créer un nouveau token
    await base44.entities.NotificationToken.create({
      user_email: user.email,
      token,
      platform: platform || 'web',
      user_type,
      livreur_id: livreur_id || null,
      actif: true,
      derniere_utilisation: new Date().toISOString(),
    });

    return Response.json({ success: true, action: 'created' });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});