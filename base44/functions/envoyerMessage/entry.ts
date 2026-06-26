import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PARTNER_TYPES = ['partner', 'partenaire', 'boutique', 'restaurant', 'pharmacie'];

function normalizeActorType(type) {
  return PARTNER_TYPES.includes(type) ? 'partenaire' : type;
}

async function getEntityById(asService, entityName, id) {
  if (!id) return null;
  try {
    const direct = await asService.entities[entityName].get(id);
    if (direct) return direct;
  } catch (_) {}
  try {
    const rows = await asService.entities[entityName].filter({ id });
    return rows?.[0] || null;
  } catch (_) {
    return null;
  }
}

function participantMatches(participant, normalizedType, effectiveId, userId) {
  const participantType = normalizeActorType(participant?.type);
  if (participantType !== normalizedType) return false;
  const ids = [
    participant?.id,
    participant?.partner_id,
    participant?.partenaire_id,
    participant?.boutique_id,
    participant?.restaurant_id,
    participant?.pharmacie_id,
    participant?.user_id,
  ].filter(Boolean).map(String);
  return ids.includes(String(effectiveId)) || (userId && ids.includes(String(userId)));
}

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
      client_message_id,
    } = payload;

    if (!sender_type || !sender_id) {
      return Response.json({ error: 'sender_type et sender_id sont requis' }, { status: 400 });
    }
    const normalized_sender_type = normalizeActorType(sender_type);
    let effective_sender_id = sender_id;

    // ── 1. Résoudre le VRAI nom et la photo depuis le profil ──
    let realName = '';
    let photoUrl = '';

    if (normalized_sender_type === 'livreur') {
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
    } else if (normalized_sender_type === 'client') {
      const clients = await base44.asServiceRole.entities.ClientExterne.filter({ user_email: user.email });
      if (!clients || clients.length === 0) {
        return Response.json({ error: 'Profil client introuvable' }, { status: 404 });
      }
      const client = clients[0];
      if (client.id !== sender_id) {
        return Response.json({ error: 'sender_id ne correspond pas au client authentifié' }, { status: 403 });
      }
      realName = `${client.prenom || ''} ${client.nom || ''}`.trim() || client.telephone || 'Client';
      photoUrl = client.photo_url || client.avatar_url || '';
    } else if (normalized_sender_type === 'admin') {
      if (user.email !== sender_id) {
        return Response.json({ error: 'sender_id ne correspond pas à l\'admin authentifié' }, { status: 403 });
      }
      realName = user.full_name || user.email || 'Admin';
      photoUrl = '';
    } else if (normalized_sender_type === 'partenaire') {
      // Le partenaire est identifié par son établissement (Boutique, Restaurant ou Pharmacie).
      // sender_id = ID de l'établissement. On vérifie que l'utilisateur authentifié
      // est bien propriétaire de cet établissement.
      const boutiques = await base44.asServiceRole.entities.Boutique.filter({ user_email: user.email });
      const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ user_email: user.email });
      const pharmacies = await base44.asServiceRole.entities.Pharmacie.filter({ user_email: user.email });
      const allEtabs = [
        ...(boutiques || []).map(b => ({ ...b, _kind: 'boutique' })),
        ...(restaurants || []).map(r => ({ ...r, _kind: 'restaurant' })),
        ...(pharmacies || []).map(p => ({ ...p, _kind: 'pharmacie' })),
      ];
      const etab = allEtabs.find(e => e.id === sender_id || e.partenaire_id === sender_id || e.partenaire_id === user.id);
      if (etab) effective_sender_id = etab.id;
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
      if (normalized_sender_type === 'livreur') {
        isParticipant = c.livreur_id === effective_sender_id;
      } else if (normalized_sender_type === 'client') {
        isParticipant = c.expediteur_client_id === effective_sender_id || c.destinataire_client_id === effective_sender_id;
      } else if (normalized_sender_type === 'partenaire') {
        if (c.commande_boutique_id) {
          const cmd = await getEntityById(base44.asServiceRole, 'CommandeBoutique', c.commande_boutique_id);
          isParticipant = cmd?.boutique_id === effective_sender_id || cmd?.partenaire_id === user.id || cmd?.partenaire_id === sender_id;
        }
        if (!isParticipant && c.commande_restaurant_id) {
          const cmd = await getEntityById(base44.asServiceRole, 'CommandeRestaurant', c.commande_restaurant_id);
          isParticipant = cmd?.restaurant_id === effective_sender_id || cmd?.partenaire_id === user.id || cmd?.partenaire_id === sender_id;
        }
        if (!isParticipant && c.commande_pharmacie_id) {
          const cmd = await getEntityById(base44.asServiceRole, 'CommandePharmacie', c.commande_pharmacie_id);
          isParticipant = cmd?.pharmacie_id === effective_sender_id || cmd?.partenaire_id === user.id || cmd?.partenaire_id === sender_id;
        }
      } else if (normalized_sender_type === 'admin') {
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
      const isParticipant = participants.some(p =>
        participantMatches(p, normalized_sender_type, effective_sender_id, user.id)
      );
      if (!isParticipant) {
        return Response.json({ error: 'Vous n\'êtes pas participant de cette conversation' }, { status: 403 });
      }
    }

    // ── 3. Créer le message avec les VRAIES informations ──
    if (client_message_id) {
      const existing = await base44.asServiceRole.entities.Message.filter({ client_message_id });
      if (existing && existing.length > 0) {
        return Response.json({
          success: true,
          duplicate: true,
          message: existing[0],
        });
      }
    }

    const recentScope = course_id
      ? await base44.asServiceRole.entities.Message.filter({ course_id }, '-created_date', 20)
      : await base44.asServiceRole.entities.Message.filter({ conversation_id }, '-created_date', 20);
    const now = Date.now();
    const duplicateRecent = (recentScope || []).find((m) => {
      const created = new Date(m.created_date || 0).getTime();
      return (
        now - created < 5000 &&
        m.sender_type === normalized_sender_type &&
        m.sender_id === effective_sender_id &&
        m.message_type === (message_type || 'text') &&
        (m.content || '') === (content || '') &&
        (m.audio_url || '') === (audio_url || '') &&
        (m.photo_url || '') === (photo_url || '')
      );
    });
    if (duplicateRecent) {
      return Response.json({
        success: true,
        duplicate: true,
        message: duplicateRecent,
      });
    }

    const message = await base44.asServiceRole.entities.Message.create({
      course_id: course_id || null,
      conversation_id: conversation_id || null,
      sender_type: normalized_sender_type,
      sender_id: effective_sender_id,
      sender_name: realName,
      sender_photo_url: photoUrl,
      client_message_id: client_message_id || null,
      message_type: message_type || 'text',
      content: content || '',
      audio_url: audio_url || null,
      photo_url: photo_url || null,
    });

    // ── 4. Mettre à jour la conversation (last_message) ──
    if (conversation_id) {
      const lastMsgPreview =
        message_type === 'text' ? (content || '').slice(0, 80) :
        message_type === 'audio' ? 'Message vocal' : 'Photo';
      await base44.asServiceRole.entities.Conversation.update(conversation_id, {
        last_message: lastMsgPreview,
        last_message_date: message.created_date,
        last_sender_name: realName,
      }).catch(() => {});
    }

    // ── 5. Envoyer une notification push au partenaire si le message vient d'un client ──
    if (conversation_id && normalized_sender_type === 'client') {
      try {
        const convs = await base44.asServiceRole.entities.Conversation.filter({ id: conversation_id });
        if (convs && convs.length > 0) {
          const conv = convs[0];
          let participants = [];
          try { participants = JSON.parse(conv.participants || '[]'); } catch {}
          const partenaire = participants.find(p => normalizeActorType(p.type) === 'partenaire');
          if (partenaire) {
            const [boutiques, restaurants, pharmacies] = await Promise.all([
              base44.asServiceRole.entities.Boutique.filter({ id: partenaire.id }),
              base44.asServiceRole.entities.Restaurant.filter({ id: partenaire.id }),
              base44.asServiceRole.entities.Pharmacie.filter({ id: partenaire.id }),
            ]);
            const etab = (boutiques?.[0]) || (restaurants?.[0]) || (pharmacies?.[0]);
            if (etab?.user_email) {
              await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
                titre: '💬 Nouveau message',
                message: (content || '').slice(0, 100) || 'Nouveau message',
                type: 'nouveau_message',
                destinataire_email: etab.user_email,
                user_type: 'partenaire',
              }).catch(() => {});
            }
          }
        }
      } catch (e) {
        console.error('[envoyerMessage] Push notification error:', e);
      }
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
