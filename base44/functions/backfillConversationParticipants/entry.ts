import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { resolveParticipantUserIds } from '../../shared/conversationSecurity.ts';

/**
 * Automation déclenchée à la création d'une Conversation.
 *
 * Résout participant_user_ids côté backend à partir du champ participants (JSON).
 * Ignore et écrase toute valeur participant_user_ids fournie par le frontend.
 *
 * Garantit que le tableau participant_user_ids est TOUJOURS calculé côté serveur,
 * jamais fourni librement par le client. La RLS read s'appuie ensuite sur ce tableau
 * + created_by_id (le créateur peut toujours lire sa propre conversation).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event, data } = payload;
    if (event?.type !== 'create' || event?.entity_name !== 'Conversation') {
      return Response.json({ skipped: true, reason: 'not a conversation create event' });
    }

    const conv = data || await base44.asServiceRole.entities.Conversation.get(event.entity_id).catch(() => null);
    if (!conv) {
      return Response.json({ skipped: true, reason: 'conversation not found' });
    }

    // ── Toujours recalculer (même si déjà peuplé) — le backend est l'autorité ──
    let participants: any[] = [];
    try { participants = JSON.parse(conv.participants || '[]'); } catch {}
    if (participants.length === 0) {
      return Response.json({ skipped: true, reason: 'no participants in JSON' });
    }

    const { userIds, unresolved } = await resolveParticipantUserIds(base44, participants);
    if (userIds.length === 0) {
      console.warn(`[backfillConversationParticipants] No User IDs resolved for conversation ${conv.id}`, unresolved);
      return Response.json({ skipped: true, reason: 'no user IDs resolved', unresolved });
    }

    await base44.asServiceRole.entities.Conversation.update(conv.id, {
      participant_user_ids: userIds,
    });

    return Response.json({ success: true, userIds, unresolved_count: unresolved.length });
  } catch (error) {
    console.error('[backfillConversationParticipants] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});