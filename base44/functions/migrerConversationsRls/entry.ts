import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { resolveParticipantUserIds } from '../../shared/conversationSecurity.ts';

/**
 * Migration des conversations existantes vers le champ participant_user_ids.
 *
 * Étapes :
 * 1. Scanner toutes les conversations existantes
 * 2. Pour chaque conversation, résoudre les participants vers des User.id
 * 3. Remplir participant_user_ids
 * 4. Identifier les conversations dont un participant ne peut pas être résolu
 *
 * Les conversations ambiguës ne sont PAS supprimées — elles sont laissées
 * avec participant_user_ids partiellement peuplé ou vide.
 *
 * Rapport : total, migrées complètement, migrées partiellement, impossibles.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    const conversations = await base44.asServiceRole.entities.Conversation.list('-created_date', 500);

    let total = conversations.length;
    let fullyMigrated = 0;
    let partiallyMigrated = 0;
    let impossible = 0;
    let alreadyMigrated = 0;
    const details: any[] = [];

    for (const conv of conversations) {
      // ── Skip si déjà migré ──
      if (conv.participant_user_ids && Array.isArray(conv.participant_user_ids) && conv.participant_user_ids.length > 0) {
        alreadyMigrated++;
        continue;
      }

      // ── Parser les participants ──
      let participants: any[] = [];
      try { participants = JSON.parse(conv.participants || '[]'); } catch {}

      if (participants.length === 0) {
        impossible++;
        details.push({
          conversation_id: conv.id,
          title: conv.title,
          unresolved: [{ type: 'unknown', id: '', reason: 'No participants in JSON' }],
        });
        continue;
      }

      // ── Résoudre les User.id ──
      const { userIds, unresolved } = await resolveParticipantUserIds(base44, participants);

      if (userIds.length > 0 && unresolved.length === 0) {
        fullyMigrated++;
      } else if (userIds.length > 0 && unresolved.length > 0) {
        partiallyMigrated++;
      } else {
        impossible++;
      }

      // ── Mettre à jour la conversation ──
      if (userIds.length > 0) {
        await base44.asServiceRole.entities.Conversation.update(conv.id, {
          participant_user_ids: userIds,
        });
      }

      if (unresolved.length > 0) {
        details.push({
          conversation_id: conv.id,
          title: conv.title,
          source: conv.source,
          unresolved,
        });
      }
    }

    return Response.json({
      success: true,
      stats: {
        total,
        fullyMigrated,
        partiallyMigrated,
        impossible,
        alreadyMigrated,
      },
      details: details.slice(0, 50),
    });
  } catch (error) {
    console.error('[migrerConversationsRls] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});