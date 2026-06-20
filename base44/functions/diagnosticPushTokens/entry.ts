import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Récupérer tous les tokens pour cet utilisateur
    const tokens = await base44.asServiceRole.entities.NotificationToken.filter(
      { user_email: user.email?.toLowerCase() },
      '-created_date',
      50
    );

    // Récupérer le profil livreur si existe
    let livreurProfil = null;
    try {
      const livreurs = await base44.asServiceRole.entities.Livreur.filter({ user_email: user.email });
      livreurProfil = livreurs?.[0] || null;
    } catch (_) {}

    // Récupérer le profil client si existe
    let clientProfil = null;
    try {
      const clients = await base44.asServiceRole.entities.ClientExterne.filter({ user_email: user.email });
      clientProfil = clients?.[0] || null;
    } catch (_) {}

    return Response.json({
      user_email: user.email,
      user_id: user.id,
      tokens: tokens || [],
      tokens_count: tokens?.length || 0,
      android_tokens: (tokens || []).filter(t => t.platform === 'android'),
      web_tokens: (tokens || []).filter(t => t.platform === 'web'),
      ios_tokens: (tokens || []).filter(t => t.platform === 'ios'),
      livreur_id: livreurProfil?.id,
      livreur_type: livreurProfil?.type_livreur,
      client_id: clientProfil?.id,
    });
  } catch (error) {
    return Response.json({
      error: error.message,
      details: error.toString()
    }, { status: 500 });
  }
});