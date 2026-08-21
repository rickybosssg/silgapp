import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { resolveParticipantUserIds } from '../../shared/conversationSecurity.ts';

/**
 * Migration des messages existants vers participant_user_ids.
 *
 * Approche optimisée : parcourt les conversations (déjà migrées), et pour chaque
 * conversation, récupère ses messages et utilise bulkUpdate pour définir
 * participant_user_ids en une seule opération.
 *
 * Sans cette migration, la RLS Message bloquerait les messages existants
 * pour les utilisateurs non-admins.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    // ── 1. Récupérer toutes les conversations ──
    const allConvs = await base44.asServiceRole.entities.Conversation.list('-created_date', 500);

    let totalMessagesUpdated = 0;
    let totalMessagesSkipped = 0;
    let totalConvsProcessed = 0;
    let totalConvsSkipped = 0;

    // ── 2. Pour chaque conversation, mettre à jour ses messages ──
    for (const conv of allConvs || []) {
      // Résoudre participant_user_ids si manquant
      let userIds = conv.participant_user_ids;
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        let parts: any[] = [];
        try { parts = JSON.parse(conv.participants || '[]'); } catch {}
        if (parts.length === 0) {
          totalConvsSkipped++;
          continue;
        }
        const { userIds: resolved } = await resolveParticipantUserIds(base44, parts);
        userIds = resolved;
        if (resolved.length > 0) {
          await base44.asServiceRole.entities.Conversation.update(conv.id, { participant_user_ids: resolved });
        }
      }

      if (!userIds || userIds.length === 0) {
        totalConvsSkipped++;
        continue;
      }

      // ── 3. Récupérer les messages de cette conversation ──
      const messages = await base44.asServiceRole.entities.Message.filter({ conversation_id: conv.id }, '-created_date', 200);

      // ── 4. Séparer les messages à migrer de ceux déjà migrés ──
      const toUpdate = [];
      for (const msg of messages || []) {
        if (msg.participant_user_ids && Array.isArray(msg.participant_user_ids) && msg.participant_user_ids.length > 0) {
          totalMessagesSkipped++;
        } else {
          toUpdate.push({ id: msg.id, participant_user_ids: userIds });
        }
      }

      // ── 5. BulkUpdate des messages ──
      if (toUpdate.length > 0) {
        // bulkUpdate accepte max 500 records à la fois
        for (let i = 0; i < toUpdate.length; i += 100) {
          const batch = toUpdate.slice(i, i + 100);
          await base44.asServiceRole.entities.Message.bulkUpdate(batch);
          totalMessagesUpdated += batch.length;
        }
      }

      totalConvsProcessed++;
    }

    // ── 6. Traiter les messages liés à une course (sans conversation) ──
    const courseMessages = await base44.asServiceRole.entities.Message.filter(
      { conversation_id: null, course_id: { $exists: true } },
      '-created_date', 200
    ).catch(() => []);

    let courseMessagesUpdated = 0;
    let courseMessagesSkipped = 0;

    for (const msg of courseMessages || []) {
      if (msg.participant_user_ids && Array.isArray(msg.participant_user_ids) && msg.participant_user_ids.length > 0) {
        courseMessagesSkipped++;
        continue;
      }
      if (!msg.course_id) {
        courseMessagesSkipped++;
        continue;
      }

      const courses = await base44.asServiceRole.entities.CourseExterne.filter({ id: msg.course_id });
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
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      for (const a of admins || []) courseParticipants.push({ type: 'admin', id: a.email });
      const { userIds: resolved } = await resolveParticipantUserIds(base44, courseParticipants);

      if (resolved.length > 0) {
        await base44.asServiceRole.entities.Message.update(msg.id, { participant_user_ids: resolved });
        courseMessagesUpdated++;
      } else {
        courseMessagesSkipped++;
      }
    }

    return Response.json({
      success: true,
      stats: {
        conversations_processed: totalConvsProcessed,
        conversations_skipped: totalConvsSkipped,
        messages_updated: totalMessagesUpdated,
        messages_skipped_already: totalMessagesSkipped,
        course_messages_updated: courseMessagesUpdated,
        course_messages_skipped: courseMessagesSkipped,
      },
    });
  } catch (error) {
    console.error('[migrerMessagesRls] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});