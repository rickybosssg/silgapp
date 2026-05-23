import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const tokens = await base44.asServiceRole.entities.NotificationToken.filter({ actif: true });
    const notifications = await base44.asServiceRole.entities.Notification.list('-created_date', 50);

    return Response.json({
      tokens: tokens.map((t) => ({
        email: t.user_email,
        platform: t.platform,
        user_type: t.user_type,
        livreur_id: t.livreur_id,
        created: t.created_date,
      })),
      notifications: notifications.map((n) => ({
        titre: n.titre,
        message: n.message,
        type: n.type,
        destinataire: n.destinataire_email,
        lue: n.lue,
        created: n.created_date,
      })),
      stats: {
        total_tokens: tokens.length,
        total_notifications: notifications.length,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
