import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { resolveParticipantUserIds } from '../../shared/conversationSecurity.ts';

/**
 * Automation déclenchée à la création d'un Message.
 *
 * Copie participant_user_ids depuis la conversation parente.
 * Si la conversation n'a pas encore participant_user_ids (race condition avec
 * backfillConversationParticipants), résout depuis les participants et backfill
 * la conversation aussi.
 *
 * Garantit que le message hérite toujours des droits de la conversation, jamais
 * d'un tableau fourni par le client.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event, data } = payload;
    if (event?.type !== 'create' || event?.entity_name !== 'Message') {
      return Response.json({ skipped: true, reason: 'not a message create event' });
    }

    const msg = data || await base44.asServiceRole.entities.Message.get(event.entity_id).catch(() => null);
    if (!msg) {
      return Response.json({ skipped: true, reason: 'message not found' });
    }

    // ── Toujours recalculer (même si déjà peuplé) — le backend est l'autorité ──
    let userIds: string[] = [];

    // Cas 1 : message lié à une conversation
    if (msg.conversation_id) {
      const conv = await base44.asServiceRole.entities.Conversation.get(msg.conversation_id).catch(() => null);
      if (conv?.participant_user_ids && Array.isArray(conv.participant_user_ids) && conv.participant_user_ids.length > 0) {
        userIds = conv.participant_user_ids;
      } else if (conv) {
        // La conversation n'a pas encore participant_user_ids — résoudre depuis participants
        let participants: any[] = [];
        try { participants = JSON.parse(conv.participants || '[]'); } catch {}
        const { userIds: resolved } = await resolveParticipantUserIds(base44, participants);
        userIds = resolved;
        // Backfill la conversation aussi
        if (resolved.length > 0) {
          await base44.asServiceRole.entities.Conversation.update(conv.id, { participant_user_ids: resolved });
        }
      }
    }
    // Cas 2 : message lié à une course (sans conversation)
    else if (msg.course_id) {
      const courses = await base44.asServiceRole.entities.CourseExterne.filter({ id: msg.course_id }).catch(() => []);
      const c = courses?.[0];
      const courseParticipants: any[] = [];
      if (c?.livreur_id) {
        const livreur = await base44.asServiceRole.entities.Livreur.get(c.livreur_id).catch(() => null);
        if (livreur) courseParticipants.push({ type: 'livreur', id: livreur.id });
      }
      const clientId = c?.expediteur_client_id || c?.destinataire_client_id;
      if (clientId) {
        const client = await base44.asServiceRole.entities.ClientExterne.get(clientId).catch(() => null);
        if (client) courseParticipants.push({ type: 'client', id: client.id });
      }
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' }).catch(() => []);
      for (const a of admins || []) courseParticipants.push({ type: 'admin', id: a.email });
      const { userIds: resolved } = await resolveParticipantUserIds(base44, courseParticipants);
      userIds = resolved;
    }

    if (userIds.length === 0) {
      console.warn(`[backfillMessageParticipants] No User IDs resolved for message ${msg.id}`);
      return Response.json({ skipped: true, reason: 'no user IDs resolved' });
    }

    await base44.asServiceRole.entities.Message.update(msg.id, {
      participant_user_ids: userIds,
    });

    return Response.json({ success: true, userIds });
  } catch (error) {
    console.error('[backfillMessageParticipants] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});