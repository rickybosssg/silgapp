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
      sender_id: raw_sender_id,
      message_type,
      content,
      audio_url,
      photo_url,
    } = payload;
    let final_sender_id = raw_sender_id;

    if (!sender_type || !final_sender_id) {
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
      if (livreur.id !== final_sender_id) {
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
      if (client.id !== final_sender_id) {
        return Response.json({ error: 'sender_id ne correspond pas au client authentifié' }, { status: 403 });
      }
      realName = `${client.prenom || ''} ${client.nom || ''}`.trim() || client.telephone || 'Client';
      photoUrl = '';
    } else if (sender_type === 'admin') {
      // L'admin est déjà authentifié — utiliser user.email comme sender_id
      final_sender_id = user.email;
      realName = user.full_name || user.email || 'Admin';
      photoUrl = '';
    } else if (sender_type === 'partenaire') {
      // Le partenaire est identifié par son établissement (Boutique ou Restaurant)
      // sender_id = ID de la boutique ou du restaurant
      // On vérifie que l'utilisateur authentifié est bien propriétaire de cet établissement
      const boutiques = await base44.asServiceRole.entities.Boutique.filter({ user_email: user.email });
      const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ user_email: user.email });
      const pharmacies = await base44.asServiceRole.entities.Pharmacie.filter({ user_email: user.email });
      const allEtabs = [
        ...(boutiques || []).map(b => ({ ...b, _kind: 'boutique' })),
        ...(restaurants || []).map(r => ({ ...r, _kind: 'restaurant' })),
        ...(pharmacies || []).map(p => ({ ...p, _kind: 'pharmacie' })),
      ];
      const etab = allEtabs.find(e => e.id === final_sender_id);
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
        isParticipant = c.livreur_id === final_sender_id;
      } else if (sender_type === 'client') {
        isParticipant = c.expediteur_client_id === final_sender_id || c.destinataire_client_id === final_sender_id;
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
      // Admin: autorisé si la conversation contient un participant admin (id='support', 'all', ou email)
      // Cela permet aux admins de répondre aux conversations de support créées par les livreurs bloqués
      const isParticipant = sender_type === 'admin'
        ? participants.some(p => p.type === 'admin')
        : participants.some(p => p.type === sender_type && p.id === final_sender_id);
      if (!isParticipant) {
        return Response.json({ error: 'Vous n\'êtes pas participant de cette conversation' }, { status: 403 });
      }
    }

    // ── 3. Créer le message avec les VRAIES informations ──
    const message = await base44.asServiceRole.entities.Message.create({
      course_id: course_id || null,
      conversation_id: conversation_id || null,
      sender_type,
      sender_id: final_sender_id,
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
        last_sender_type: sender_type,
      }).catch(() => {});
    }

    // ── 5. Envoyer une notification push à TOUS les destinataires du message ──
    // Préparer le texte de prévisualisation selon le type de message
    const msgPreview =
      message_type === 'text' ? (content || '').slice(0, 100) :
      message_type === 'audio' ? '🎤 Message vocal' :
      message_type === 'photo' ? '📷 Photo' : 'Nouveau message';

    const pushTitle = `💬 Nouveau message de ${realName}`;
    const recipients = new Set(); // emails des destinataires (déduit pour éviter les doublons)

    try {
      // ── 5a. Messages dans une COURSE → notifier l'autre partie ──
      if (course_id) {
        const courses = await base44.asServiceRole.entities.CourseExterne.filter({ id: course_id });
        if (courses && courses.length > 0) {
          const c = courses[0];

          // Résoudre l'email du livreur
          if (sender_type !== 'livreur' && c.livreur_id) {
            const livreur = await base44.asServiceRole.entities.Livreur.get(c.livreur_id).catch(() => null);
            if (livreur?.user_email) recipients.add(JSON.stringify({ email: livreur.user_email, user_type: 'livreur', livreur_id: livreur.id }));
          }

          // Résoudre l'email du client (expéditeur ou destinataire)
          if (sender_type !== 'client') {
            const clientId = c.expediteur_client_id || c.destinataire_client_id;
            if (clientId) {
              const client = await base44.asServiceRole.entities.ClientExterne.get(clientId).catch(() => null);
              if (client?.user_email) recipients.add(JSON.stringify({ email: client.user_email, user_type: 'client' }));
            }
          }

          // L'admin reçoit une notif si le message vient du livreur ou du client
          if (sender_type !== 'admin') {
            const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
            for (const a of admins || []) {
              if (a.email) recipients.add(JSON.stringify({ email: a.email, user_type: 'admin' }));
            }
          }
        }
      }

      // ── 5b. Messages dans une CONVERSATION → notifier tous les autres participants ──
      if (conversation_id) {
        const convs = await base44.asServiceRole.entities.Conversation.filter({ id: conversation_id });
        if (convs && convs.length > 0) {
          const conv = convs[0];
          let participants = [];
          try { participants = JSON.parse(conv.participants || '[]'); } catch {}

          for (const p of participants) {
            // Ne pas notifier l'expéditeur
            if (p.type === sender_type && p.id === final_sender_id) continue;
            // Si l'expéditeur est admin, ne pas notifier les autres admins (évite auto-notif)
            if (sender_type === 'admin' && p.type === 'admin') continue;

            if (p.type === 'partenaire') {
              // Résoudre l'email du partenaire via Boutique / Restaurant / Pharmacie
              const [boutiques, restaurants, pharmacies] = await Promise.all([
                base44.asServiceRole.entities.Boutique.filter({ id: p.id }),
                base44.asServiceRole.entities.Restaurant.filter({ id: p.id }),
                base44.asServiceRole.entities.Pharmacie.filter({ id: p.id }),
              ]);
              const etab = (boutiques?.[0]) || (restaurants?.[0]) || (pharmacies?.[0]);
              if (etab?.user_email) {
                recipients.add(JSON.stringify({ email: etab.user_email, user_type: 'partenaire' }));
              }
            } else if (p.type === 'client') {
              const client = await base44.asServiceRole.entities.ClientExterne.get(p.id).catch(() => null);
              if (client?.user_email) recipients.add(JSON.stringify({ email: client.user_email, user_type: 'client' }));
            } else if (p.type === 'livreur') {
              const livreur = await base44.asServiceRole.entities.Livreur.get(p.id).catch(() => null);
              if (livreur?.user_email) {
                recipients.add(JSON.stringify({ email: livreur.user_email, user_type: 'livreur', livreur_id: livreur.id }));
              }
            } else if (p.type === 'admin') {
              if (p.id && p.id.includes('@')) {
                recipients.add(JSON.stringify({ email: p.id, user_type: 'admin' }));
              } else {
                // Si pas d'email direct, notifier tous les admins
                const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
                for (const a of admins || []) {
                  if (a.email) recipients.add(JSON.stringify({ email: a.email, user_type: 'admin' }));
                }
              }
            }
          }
        }
      }

      // ── 5c. Envoyer le push à chaque destinataire unique ──
      for (const recipientStr of recipients) {
        try {
          const r = JSON.parse(recipientStr);
          await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
            titre: pushTitle,
            message: msgPreview,
            type: 'nouveau_message',
            destinataire_email: r.email,
            user_type: r.user_type,
            livreur_id: r.livreur_id || undefined,
            course_id: course_id || undefined,
            conversation_id: conversation_id || undefined,
          }).catch(() => {});
        } catch (_) {}
      }
    } catch (e) {
      console.error('[envoyerMessage] Push notification error:', e);
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