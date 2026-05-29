import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Envoi d'alerte WhatsApp via Twilio.
 * Déclenché sur création de Notification (toute entity Notification).
 * Couvre : livreurs internes/externes + clients externes.
 *
 * Règles :
 * - Si l'utilisateur est actif (app_active=true ET last_seen_at < 2 min) → pas de WhatsApp
 * - Anti-doublon : pas d'envoi si alerte "sent" déjà présente avec notifs non lues
 * - Numéros normalisés : +226XXXXXXXX
 * - Message neutre : pas d'infos sensibles (prix, adresse, GPS, détails course)
 */

const SEUIL_INACTIVITE_MS = 2 * 60 * 1000; // 2 minutes

const MESSAGE_WHATSAPP = `Bonjour 👋\nVous avez reçu une notification importante sur SILGAPP.\nVeuillez ouvrir l'application pour consulter les détails.`;

function normaliserTelephone(tel) {
  if (!tel) return null;
  let t = tel.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (t.startsWith('+')) return t;
  if (t.startsWith('226')) return '+' + t;
  if (t.startsWith('0') && t.length <= 9) return '+226' + t.slice(1);
  if (t.length === 8) return '+226' + t;
  return '+226' + t;
}

function estActifDansApp(entity) {
  if (!entity.app_active || !entity.last_seen_at) return false;
  const ecart = Date.now() - new Date(entity.last_seen_at).getTime();
  return ecart < SEUIL_INACTIVITE_MS;
}

async function envoyerWhatsApp(telephone, accountSid, authToken, fromNumber) {
  const to = `whatsapp:${telephone}`;
  const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = btoa(`${accountSid}:${authToken}`);

  const formData = new URLSearchParams();
  formData.append('From', from);
  formData.append('To', to);
  formData.append('Body', MESSAGE_WHATSAPP);

  const resp = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData.toString()
  });

  const data = await resp.json();
  return { ok: resp.ok, data, to };
}

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

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromRaw = Deno.env.get('TWILIO_WHATSAPP_FROM') || '';
    const fromNumber = fromRaw.startsWith('whatsapp:') ? fromRaw : `whatsapp:${fromRaw}`;

    if (!accountSid || !authToken || !fromRaw) {
      console.error('[WhatsApp] Variables Twilio manquantes');
      return Response.json({ skipped: true, reason: 'twilio_config_missing' });
    }

    // ── 1. Chercher si c'est un LIVREUR (interne ou externe) ─────────────────
    const livreurs = await base44.asServiceRole.entities.Livreur.filter({
      user_email: destinataireEmail,
      actif: true
    });

    if (livreurs && livreurs.length > 0) {
      const livreur = livreurs[0];

      if (!livreur.telephone) {
        return Response.json({ skipped: true, reason: 'livreur_no_telephone' });
      }

      // Logique : Si livreur n'est PAS dans l'app → WhatsApp pour lui dire d'ouvrir
      if (estActifDansApp(livreur)) {
        console.log(`[WhatsApp] Livreur ${livreur.id} actif dans l'app → pas de WhatsApp`);
        return Response.json({ skipped: true, reason: 'livreur_actif_dans_app' });
      }
      
      // Livreur n'est pas dans l'app → WhatsApp envoyé
      console.log(`[WhatsApp] Livreur ${livreur.id} hors ligne → WhatsApp envoyé`);

      // Anti-doublon livreur
      const [alertesExistantes, notifsNonLues] = await Promise.all([
        base44.asServiceRole.entities.WhatsAppAlerte.filter({ livreur_id: livreur.id, statut: 'sent' }),
        base44.asServiceRole.entities.Notification.filter({ destinataire_email: destinataireEmail, lue: false })
      ]);

      if (alertesExistantes.length > 0 && notifsNonLues.length > 1) {
        return Response.json({ skipped: true, reason: 'alerte_deja_envoyee_livreur' });
      }

      const telephone = normaliserTelephone(livreur.telephone);
      if (!telephone) return Response.json({ skipped: true, reason: 'telephone_invalide' });

      const alerte = await base44.asServiceRole.entities.WhatsAppAlerte.create({
        livreur_id: livreur.id,
        livreur_telephone: telephone,
        notification_id: notification.id || '',
        statut: 'pending'
      });

      const { ok, data, to } = await envoyerWhatsApp(telephone, accountSid, authToken, fromNumber);

      if (ok && data.sid) {
        await base44.asServiceRole.entities.WhatsAppAlerte.update(alerte.id, {
          statut: 'sent',
          twilio_sid: data.sid,
          heure_envoi: new Date().toISOString()
        });
        console.log(`[WhatsApp] Livreur ${livreur.id} → envoyé (${data.sid})`);
        return Response.json({ success: true, type: 'livreur', twilio_sid: data.sid, to });
      } else {
        const erreur = `[${data.code || ''}] ${data.message || ''} raw:${JSON.stringify(data)}`.slice(0, 500);
        await base44.asServiceRole.entities.WhatsAppAlerte.update(alerte.id, { statut: 'failed', erreur });
        console.error('[WhatsApp] Twilio erreur livreur:', erreur);
        return Response.json({ success: false, type: 'livreur', erreur });
      }
    }

    // ── 2. Chercher si c'est un CLIENT EXTERNE ────────────────────────────────
    const clients = await base44.asServiceRole.entities.ClientExterne.filter({
      user_email: destinataireEmail,
      actif: true
    });

    if (clients && clients.length > 0) {
      const client = clients[0];

      if (!client.telephone) {
        return Response.json({ skipped: true, reason: 'client_no_telephone' });
      }

      if (estActifDansApp(client)) {
        console.log(`[WhatsApp] Client ${client.id} actif → pas de WhatsApp`);
        return Response.json({ skipped: true, reason: 'client_actif_dans_app' });
      }

      const telephone = normaliserTelephone(client.telephone);
      if (!telephone) return Response.json({ skipped: true, reason: 'telephone_invalide_client' });

      // Anti-doublon client
      const [alertesExistantes, notifsNonLues] = await Promise.all([
        base44.asServiceRole.entities.WhatsAppAlerte.filter({ livreur_telephone: telephone, statut: 'sent' }),
        base44.asServiceRole.entities.Notification.filter({ destinataire_email: destinataireEmail, lue: false })
      ]);

      if (alertesExistantes.length > 0 && notifsNonLues.length > 1) {
        return Response.json({ skipped: true, reason: 'alerte_deja_envoyee_client' });
      }

      const alerte = await base44.asServiceRole.entities.WhatsAppAlerte.create({
        livreur_id: client.id,
        livreur_telephone: telephone,
        notification_id: notification.id || '',
        statut: 'pending'
      });

      const { ok, data, to } = await envoyerWhatsApp(telephone, accountSid, authToken, fromNumber);

      if (ok && data.sid) {
        await base44.asServiceRole.entities.WhatsAppAlerte.update(alerte.id, {
          statut: 'sent',
          twilio_sid: data.sid,
          heure_envoi: new Date().toISOString()
        });
        console.log(`[WhatsApp] Client ${client.id} → envoyé (${data.sid})`);
        return Response.json({ success: true, type: 'client', twilio_sid: data.sid, to });
      } else {
        const erreur = `[${data.code || ''}] ${data.message || ''} raw:${JSON.stringify(data)}`.slice(0, 500);
        await base44.asServiceRole.entities.WhatsAppAlerte.update(alerte.id, { statut: 'failed', erreur });
        console.error('[WhatsApp] Twilio erreur client:', erreur);
        return Response.json({ success: false, type: 'client', erreur });
      }
    }

    // ── 3. Ni livreur ni client trouvé ───────────────────────────────────────
    console.log(`[WhatsApp] Aucun profil trouvé pour email: ${destinataireEmail}`);
    return Response.json({ skipped: true, reason: 'no_livreur_ni_client_externe', email: destinataireEmail });

  } catch (error) {
    console.error('[WhatsApp] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});