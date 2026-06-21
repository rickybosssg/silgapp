import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Envoi sécurisé d'un message de messagerie SILGAPP.
 *
 * - Authentifie l'utilisateur
 * - Résout le VRAI nom et la photo depuis le profil (Livreur / ClientExterne / Admin)
 * - Vérifie que sender_id correspond bien à l'utilisateur authentifié
 * - Vérifie que le sender participe à la course ou conversation
 * - Crée le message avec les vraies informations (sender_name, sender_photo_url)
 * - Met à jour last_message de la conversation si conversation_id
 * - Retourne le message créé
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const payload = await req.json();
    const {
      course_id,
      conversation_id,
      sender_type,
      sender_id,
      message_type,
      content,
      audio_url,
      photo_url,
    } = payload;

    if (!sender_type || !sender_id) {
      return Response.json({ error: 'sender_type et sender_id sont requis' }, { status: 400 });
    }

    // ── 1. Résoudre le VRAI nom et la photo depuis le profil ──
    let realName = '';
    let photoUrl = '';

    if (sender_type === 'livreur') {
      const livreurs = await base44.asServiceRole.entities.Livreur.filter({ user_email: user.email });
      if (!livreurs || livreurs.length === 0) {
        return Response.json({ error: 'Profil livreur introuvable' }, { status: 404 });
      }
      const livreur = livreurs[0];
      // Sécurité : le sender_id doit correspondre au livreur authentifié
      if (livreur.id !== sender_id) {
        return Response.json({ error: 'sender_id ne correspond pas au livreur authentifié' }, { status: 403 });
      }
      realName = `${livreur.prenom || ''} ${livreur.nom || ''}`.trim() || livreur.telephone || 'Livreur';
      photoUrl = livreur.photo_url || '';
    } else if (sender_type === 'client') {
      const clients = await base44.asServiceRole.entities.ClientExterne.filter({ user_email: user.email });
      if (!clients || clients.length === 0) {
        return Response.json({ error: 'Profil client introuvable' }, { status: 404 });
      }
      const client = clients[0];
      if (client.id !== sender_id) {
        return Response.json({ error: 'sender_id ne correspond pas au client authentifié' }, { status: 403 });
      }
      realName = `${client.prenom || ''} ${client.nom || ''}`.trim() || client.telephone || 'Client';
      photoUrl = '';
    } else if (sender_type === 'admin') {
      if (user.email !== sender_id) {
        return Response.json({ error: 'sender_id ne correspond pas à l\'admin authentifié' }, { status: 403 });
      }
      realName = user.full_name || user.email || 'Admin';
      photoUrl = '';
    } else if (sender_type === 'partenaire') {
      // Le partenaire est identifié par son établissement (Boutique ou Restaurant)
      // sender_id = ID de la boutique ou du restaurant
      // On vérifie que l'utilisateur authentifié est bien propriétaire de cet établissement
      const boutiques = await base44.asServiceRole.entities.Boutique.filter({ user_email: user.email });
      const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ user_email: user.email });
      const allEtabs = [
        ...(boutiques || []).map(b => ({ ...b, _kind: 'boutique' })),
        ...(restaurants || []).map(r => ({ ...r, _kind: 'restaurant' })),
      ];
      const etab = allEtabs.find(e => e.id === sender_id);
      if (!etab) {
        return Response.json({ error: 'Vous n\'êtes pas propriétaire de cet établissement' }, { status: 403 });
      }
      realName = etab.nom || 'Partenaire';
      photoUrl = etab.logo_url || '';
    } else {
      return Response.json({ error: 'sender_type invalide' }, { status: 400 });
    }

    // ── 2. Vérifier que le sender participe à la course ou conversation ──
    if (course_id) {
      const courses = await base44.asServiceRole.entities.CourseExterne.filter({ id: course_id });
      if (!courses || courses.length === 0) {
        return Response.json({ error: 'Course introuvable' }, { status: 404 });
      }
      const c = courses[0];
      let isParticipant = false;
      if (sender_type === 'livreur') {
        isParticipant = c.livreur_id === sender_id;
      } else if (sender_type === 'client') {
        isParticipant = c.expediteur_client_id === sender_id || c.destinataire_client_id === sender_id;
      } else if (sender_type === 'admin') {
        isParticipant = true; // L'admin peut discuter dans toutes les courses
      }
      if (!isParticipant) {
        return Response.json({ error: 'Vous n\'êtes pas autorisé à envoyer un message dans cette course' }, { status: 403 });
      }
    } else if (conversation_id) {
      const convs = await base44.asServiceRole.entities.Conversation.filter({ id: conversation_id });
      if (!convs || convs.length === 0) {
        return Response.json({ error: 'Conversation introuvable' }, { status: 404 });
      }
      const c = convs[0];
      let participants = [];
      try { participants = JSON.parse(c.participants || '[]'); } catch {}
      const isParticipant = participants.some(p => p.type === sender_type && p.id === sender_id);
      if (!isParticipant) {
        return Response.json({ error: 'Vous n\'êtes pas participant de cette conversation' }, { status: 403 });
      }
    }

    // ── 3. Créer le message avec les VRAIES informations ──
    const message = await base44.asServiceRole.entities.Message.create({
      course_id: course_id || null,
      conversation_id: conversation_id || null,
      sender_type,
      sender_id,
      sender_name: realName,
      sender_photo_url: photoUrl,
      message_type: message_type || 'text',
      content: content || '',
      audio_url: audio_url || null,
      photo_url: photo_url || null,
    });

    // ── 4. Mettre à jour la conversation (last_message) ──
    if (conversation_id) {
      const lastMsgPreview =
        message_type === 'text' ? (content || '').slice(0, 80) :
        message_type === 'audio' ? '🎤 Message vocal' : '📷 Photo';
      await base44.asServiceRole.entities.Conversation.update(conversation_id, {
        last_message: lastMsgPreview,
        last_message_date: message.created_date,
        last_sender_name: realName,
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      message,
    });
  } catch (error) {
    console.error('[envoyerMessage] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});