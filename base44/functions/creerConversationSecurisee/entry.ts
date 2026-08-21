import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { resolveParticipantUserIds } from '../../shared/conversationSecurity.ts';

/**
 * Création sécurisée d'une conversation.
 *
 * - Authentifie l'utilisateur
 * - Résout les User.id des participants côté backend (jamais fournis par le frontend)
 * - Vérifie que l'utilisateur authentifié est dans les participant_user_ids résolus
 * - Crée la conversation avec participant_user_ids peuplé
 * - Retourne la conversation créée
 *
 * Le frontend ne doit JAMAIS créer de conversation directement — il doit passer
 * par cette fonction pour garantir que participant_user_ids est résolu côté serveur.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const payload = await req.json();
    const { participants, title, group_type } = payload;

    if (!participants || !Array.isArray(participants) || participants.length < 2) {
      return Response.json({ error: 'participants doit être un tableau avec au moins 2 éléments' }, { status: 400 });
    }

    // ── 1. Résoudre les User.id des participants ──
    const { userIds, unresolved } = await resolveParticipantUserIds(base44, participants);

    if (userIds.length === 0) {
      return Response.json({
        error: 'Impossible de résoudre les participants — aucun User.id valide',
        unresolved,
      }, { status: 400 });
    }

    // ── 2. Vérifier que l'utilisateur authentifié est un participant autorisé ──
    if (!userIds.includes(user.id)) {
      return Response.json({
        error: 'Vous n\'êtes pas un participant de cette conversation',
        user_id: user.id,
        resolved_user_ids: userIds,
      }, { status: 403 });
    }

    // ── 3. Vérifier si une conversation existe déjà (mêmes participants) ──
    const allConvs = await base44.asServiceRole.entities.Conversation.list('-created_date', 500);
    const existing = (allConvs || []).find(c => {
      try {
        const parts = JSON.parse(c.participants || '[]');
        const ids = parts.map((p: any) => `${p.type}:${p.id}`).sort().join(',');
        const newIds = participants.map((p: any) => `${p.type}:${p.id}`).sort().join(',');
        return ids === newIds;
      } catch { return false; }
    });

    if (existing) {
      // Mettre à jour participant_user_ids si manquant (backfill)
      if (!existing.participant_user_ids || existing.participant_user_ids.length === 0) {
        await base44.asServiceRole.entities.Conversation.update(existing.id, {
          participant_user_ids: userIds,
        });
      }
      return Response.json({ success: true, conversation: existing, existed: true });
    }

    // ── 4. Créer la conversation avec participant_user_ids ──
    const conv = await base44.asServiceRole.entities.Conversation.create({
      participants: JSON.stringify(participants),
      group_type: group_type || 'direct',
      title: title || '',
      participant_user_ids: userIds,
    });

    return Response.json({
      success: true,
      conversation: conv,
      unresolved_participants: unresolved.length > 0 ? unresolved : undefined,
    });
  } catch (error) {
    console.error('[creerConversationSecurisee] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});