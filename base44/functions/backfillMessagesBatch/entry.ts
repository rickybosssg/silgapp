import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { resolveParticipantUserIds, resolveCourseParticipantUserIds } from '../../shared/conversationSecurity.ts';

/**
 * Backfill batch — scan les Messages et Conversations SANS participant_user_ids
 * et les complète côté backend.
 *
 * Nécessaire car :
 * 1. Les automations entity ne se déclenchent PAS pour les opérations asServiceRole
 * 2. dispatchV2.ts est figé et ne peut pas être modifié
 * 3. Certains messages legacy n'ont jamais été migrés
 *
 * Planifié toutes les 5 minutes pour rattraper les messages orphelins.
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const results = { messages_backfilled: 0, conversations_backfilled: 0, errors: 0 };

  try {
    // ── 1. Backfill Messages sans participant_user_ids ──
    const messages = await base44.asServiceRole.entities.Message.list('-created_date', 200);
    const orphans = (messages || []).filter(m =>
      !m.participant_user_ids || !Array.isArray(m.participant_user_ids) || m.participant_user_ids.length === 0
    );

    for (const msg of orphans.slice(0, 50)) {
      try {
        let userIds: string[] = [];

        if (msg.conversation_id) {
          const conv = await base44.asServiceRole.entities.Conversation.get(msg.conversation_id).catch(() => null);
          if (conv?.participant_user_ids && Array.isArray(conv.participant_user_ids) && conv.participant_user_ids.length > 0) {
            userIds = conv.participant_user_ids;
          } else if (conv) {
            let participants: any[] = [];
            try { participants = JSON.parse(conv.participants || '[]'); } catch {}
            const { userIds: resolved } = await resolveParticipantUserIds(base44, participants);
            userIds = resolved;
            if (resolved.length > 0) {
              await base44.asServiceRole.entities.Conversation.update(conv.id, { participant_user_ids: resolved });
              results.conversations_backfilled++;
            }
          }
        } else if (msg.course_id) {
          const courses = await base44.asServiceRole.entities.CourseExterne.filter({ id: msg.course_id }).catch(() => []);
          const c = courses?.[0];
          if (c) {
            userIds = await resolveCourseParticipantUserIds(base44, c.livreur_id, c.expediteur_client_id || c.destinataire_client_id);
          }
        }

        if (userIds.length > 0) {
          await base44.asServiceRole.entities.Message.update(msg.id, { participant_user_ids: userIds });
          results.messages_backfilled++;
        }
      } catch (err) {
        results.errors++;
      }
    }

    // ── 2. Backfill Conversations sans participant_user_ids ──
    const convs = await base44.asServiceRole.entities.Conversation.list('-created_date', 100);
    const convOrphans = (convs || []).filter(c =>
      !c.participant_user_ids || !Array.isArray(c.participant_user_ids) || c.participant_user_ids.length === 0
    );

    for (const conv of convOrphans.slice(0, 30)) {
      try {
        let participants: any[] = [];
        try { participants = JSON.parse(conv.participants || '[]'); } catch {}
        if (participants.length === 0) continue;

        const { userIds } = await resolveParticipantUserIds(base44, participants);
        if (userIds.length > 0) {
          await base44.asServiceRole.entities.Conversation.update(conv.id, { participant_user_ids: userIds });
          results.conversations_backfilled++;
        }
      } catch (err) {
        results.errors++;
      }
    }

    return Response.json({ success: true, ...results });
  } catch (error) {
    console.error('[backfillMessagesBatch] Error:', error);
    return Response.json({ error: error.message, ...results }, { status: 500 });
  }
});