import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Fonction déclenchée par l'automation sur création de Notification.
 * Envoie un WhatsApp Twilio au livreur UNIQUEMENT si :
 * - la notification est destinée à un livreur (pas un admin)
 * - le livreur n'est PAS actif dans l'app (app_active=false ou last_seen_at > 2 min)
 * - pas de doublon : aucune alerte "sent" active avec des notifs non lues
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Payload de l'automation entity (création de Notification)
    const notification = body?.data;
    if (!notification) {
      return Response.json({ skipped: true, reason: 'no_notification_data' });
    }

    const destinataireEmail = notification.destinataire_email;
    if (!destinataireEmail) {
      return Response.json({ skipped: true, reason: 'no_destinataire_email' });
    }

    // Chercher le livreur par email
    const livreurs = await base44.asServiceRole.entities.Livreur.filter({
      user_email: destinataireEmail,
      actif: true
    });

    if (!livreurs || livreurs.length === 0) {
      return Response.json({ skipped: true, reason: 'not_a_livreur' });
    }

    const livreur = livreurs[0];

    if (!livreur.telephone) {
      return Response.json({ skipped: true, reason: 'no_telephone' });
    }

    // ── Vérifier si le livreur est actif dans l'app ──────────────────────────
    // Seuil : si last_seen_at < 2 minutes, le livreur est considéré connecté
    const SEUIL_INACTIVITE_MS = 2 * 60 * 1000; // 2 minutes
    const now = Date.now();

    let livreurDansApp = false;
    if (livreur.app_active === true && livreur.last_seen_at) {
      const lastSeen = new Date(livreur.last_seen_at).getTime();
      const ecart = now - lastSeen;
      if (ecart < SEUIL_INACTIVITE_MS) {
        livreurDansApp = true;
      }
    }

    if (livreurDansApp) {
      console.log(`[WhatsApp] Livreur ${livreur.id} actif dans l'app (last_seen: ${livreur.last_seen_at}) → pas de WhatsApp`);
      return Response.json({ skipped: true, reason: 'livreur_actif_dans_app', last_seen_at: livreur.last_seen_at });
    }

    // ── Anti-doublon ──────────────────────────────────────────────────────────
    // Ne pas envoyer si une alerte "sent" existe déjà et que des notifs non lues sont présentes
    const [alertesExistantes, notifsNonLues] = await Promise.all([
      base44.asServiceRole.entities.WhatsAppAlerte.filter({ livreur_id: livreur.id, statut: 'sent' }),
      base44.asServiceRole.entities.Notification.filter({ destinataire_email: destinataireEmail, lue: false })
    ]);

    if (alertesExistantes.length > 0 && notifsNonLues.length > 1) {
      return Response.json({ skipped: true, reason: 'alerte_deja_envoyee_notifs_non_lues' });
    }

    // ── Normaliser le numéro de téléphone ─────────────────────────────────────
    let telephone = livreur.telephone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
    if (!telephone.startsWith('+')) {
      telephone = '+226' + telephone; // Burkina Faso
    }
    const whatsappTo = `whatsapp:${telephone}`;

    // ── Créer l'enregistrement alerte en "pending" ────────────────────────────
    const alerte = await base44.asServiceRole.entities.WhatsAppAlerte.create({
      livreur_id: livreur.id,
      livreur_telephone: telephone,
      notification_id: notification.id || '',
      statut: 'pending'
    });

    // ── Envoi via Twilio WhatsApp ─────────────────────────────────────────────
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromRaw = Deno.env.get('TWILIO_WHATSAPP_FROM') || '';
    const fromNumber = fromRaw.startsWith('whatsapp:') ? fromRaw : `whatsapp:${fromRaw}`;

    console.log(`[WhatsApp] Envoi → ${whatsappTo} (livreur inactif depuis ${livreur.last_seen_at || 'jamais'})`);

    const message = `📦 SILGAPP\nVous avez une nouvelle notification en attente sur SILGAPP. Veuillez ouvrir l'application.`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = btoa(`${accountSid}:${authToken}`);

    const formData = new URLSearchParams();
    formData.append('From', fromNumber);
    formData.append('To', whatsappTo);
    formData.append('Body', message);

    const twilioResp = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const twilioData = await twilioResp.json();

    if (twilioResp.ok && twilioData.sid) {
      await base44.asServiceRole.entities.WhatsAppAlerte.update(alerte.id, {
        statut: 'sent',
        twilio_sid: twilioData.sid,
        heure_envoi: new Date().toISOString()
      });
      return Response.json({ success: true, twilio_sid: twilioData.sid, to: whatsappTo });
    } else {
      const erreurDetail = `[${twilioData.code || twilioResp.status}] ${twilioData.message || ''} | status: ${twilioData.status} | more_info: ${twilioData.more_info || ''} | raw: ${JSON.stringify(twilioData)}`;
      console.error('[WhatsApp] Twilio error:', erreurDetail);
      await base44.asServiceRole.entities.WhatsAppAlerte.update(alerte.id, {
        statut: 'failed',
        erreur: erreurDetail.slice(0, 500)
      });
      return Response.json({
        success: false,
        twilio_status: twilioResp.status,
        twilio_code: twilioData.code,
        twilio_message: twilioData.message,
        twilio_more_info: twilioData.more_info,
        to: whatsappTo,
        from: fromNumber
      }, { status: 200 });
    }

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});