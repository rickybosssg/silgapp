import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Bascule entre mode Venus (automatique) et mode admin (manuel).
 * - action: 'take_over' → Venus s'arrete, l'admin prend la main
 * - action: 'give_back' → Venus reprend les reponses automatiques
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { conversation_id, action } = await req.json();
    if (!conversation_id || !action) {
      return Response.json({ error: 'conversation_id et action requis' }, { status: 400 });
    }

    if (action === 'take_over') {
      await base44.asServiceRole.entities.Conversation.update(conversation_id, {
        venus_active: false,
        assigned_admin_email: user.email,
      });
      console.log(`[toggleVenus] Admin ${user.email} a pris la main sur ${conversation_id}`);
      return Response.json({ success: true, venus_active: false, assigned_admin: user.email });
    }

    if (action === 'give_back') {
      await base44.asServiceRole.entities.Conversation.update(conversation_id, {
        venus_active: true,
        assigned_admin_email: '',
      });
      console.log(`[toggleVenus] Venus reprend la main sur ${conversation_id}`);
      return Response.json({ success: true, venus_active: true });
    }

    return Response.json({ error: 'Action invalide (take_over ou give_back)' }, { status: 400 });
  } catch (error) {
    console.error('[toggleVenusConversation] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});