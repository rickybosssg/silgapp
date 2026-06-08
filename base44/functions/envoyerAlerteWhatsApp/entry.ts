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

function getMessageWhatsApp(type, destinataire) {
  // Messages pour LIVREUR
  if (destinataire === 'livreur') {
    if (type === 'nouvelle_course' || type === 'course_proximite') {
      return `📦 *Nouvelle course disponible !*\nOuvrez SILGAPP pour accepter ou refuser la mission.`;
    }
    if (type === 'course_assignee') {
      return `✅ *Course assignée*\nUne course vous a été attribuée. Ouvrez SILGAPP pour consulter les détails.`;
    }
    if (type === 'course_livree' || type === 'paiement_valide') {
      return `✅ *Livraison finalisée*\nMerci pour votre travail ! Consultez SILGAPP pour le récapitulatif.`;
    }
    if (type === 'course_annulee') {
      return `❌ *Course annulée*\nLa course a été annulée. Consultez SILGAPP pour plus d'informations.`;
    }
    if (type === 'course_bloquee' || type === 'rappel_reponse') {
      return `⏰ *Action requise*\nUne course attend votre réponse. Ouvrez SILGAPP rapidement.`;
    }
    if (type === 'batterie_faible') {
      return `🔋 *Batterie faible signalée*\nVotre signalement a bien été reçu par l'équipe SILGAPP.`;
    }
    // Fallback livreur
    return `📦 *SILGAPP – Notification*\nOuvrez l'application pour consulter les détails.`;
  }

  // Messages pour CLIENT
  if (type === 'nouvelle_course' || type === 'course_assignee') {
    return `🚚 *SILGAPP*\nVotre demande de livraison a été prise en compte.\nOuvrez SILGAPP pour suivre votre course en temps réel.`;
  }
  if (type === 'livreur_en_route') {
    return `🛵 *Votre livreur est en route !*\nOuvrez SILGAPP pour suivre la livraison en temps réel.`;
  }
  if (type === 'course_livree') {
    return `✅ *Votre livraison a été finalisée.*\nMerci d'avoir utilisé SILGAPP.`;
  }
  if (type === 'course_annulee') {
    return `❌ *La course a été annulée.*\nConsultez SILGAPP pour plus d'informations.`;
  }
  // Fallback client
  return `🚚 *SILGAPP – Notification*\nOuvrez l'application pour consulter les détails de votre livraison.`;
}

function normaliserTelephone(tel) {
  if (!tel) return null;
  let t = tel.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (t.startsWith('+')) return t;
  if (t.startsWith('226')) return '+' + t;
  if (t.startsWith('0') && t.length <= 9) return '+226' + t.slice(1);
  if (t.length === 8) return '+226' + t;
  return '+226' + t;
}


async function envoyerWhatsApp(telephone, accountSid, authToken, fromNumber, message) {
  const to = `whatsapp:${telephone}`;
  const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = btoa(`${accountSid}:${authToken}`);

  const formData = new URLSearchParams();
  formData.append('From', from);
  formData.append('To', to);
  formData.append('Body', message);

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

/**
 * Envoi SMS via Twilio (fallback si WhatsApp échoue)
 */
async function envoyerSMS(telephone, accountSid, authToken, fromNumber, message) {
  // Nettoyer le formatage WhatsApp pour SMS
  const messageSMS = message.replace(/[*_`]/g, '').replace(/\n/g, ' ');
  const from = fromNumber.startsWith('whatsapp:') ? fromNumber.replace('whatsapp:', '') : fromNumber;

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = btoa(`${accountSid}:${authToken}`);

  const formData = new URLSearchParams();
  formData.append('From', from);
  formData.append('To', telephone.startsWith('+') ? telephone : `+${telephone}`);
  formData.append('Body', messageSMS);

  const resp = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData.toString()
  });

  const data = await resp.json();
  return { ok: resp.ok, data, to: telephone };
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
      const courseId = notification.course_id || 'inconnu';

      console.log(`\n[WhatsApp] === DÉBUT CHECK Course ${courseId} Livreur ${livreur.id} ===`);
      console.log(`[WhatsApp] app_active=${livreur.app_active}, last_seen_at=${livreur.last_seen_at}, whatsapp_opt_in=${livreur.whatsapp_opt_in}`);

      // 🛡️ VÉRIFICATION OPT-IN SANDBOX
      // On ne bloque QUE si opt_in=false ET whatsapp_opt_in_date est null (jamais inscrit)
      // Si le livreur s'est inscrit récemment (même si une erreur 63015 a remis le flag à false),
      // on tente quand même — c'est Twilio qui fait foi.
      const jamaisInscrit = livreur.whatsapp_opt_in === false && !livreur.whatsapp_opt_in_date;
      if (jamaisInscrit) {
        console.log(`[WhatsApp] Livreur ${livreur.nom} — jamais inscrit au Sandbox → SKIP`);
        return Response.json({ skipped: true, reason: 'livreur_jamais_optin_sandbox', livreur_id: livreur.id });
      }
      if (livreur.whatsapp_opt_in === false) {
        console.log(`[WhatsApp] Livreur ${livreur.nom} — opt_in=false mais inscrit le ${livreur.whatsapp_opt_in_date} → tentative Twilio quand même`);
      }

      if (!livreur.telephone) {
        console.log(`[WhatsApp] Course ${courseId} Livreur ${livreur.id}: telephone manquant → SKIP`);
        return Response.json({ skipped: true, reason: 'livreur_no_telephone' });
      }

      // 🎯 STRATÉGIE : WhatsApp uniquement si heartbeat >= 2 min (app fermée/inactive)
      const heartbeatAgeMin = livreur.last_seen_at 
        ? (Date.now() - new Date(livreur.last_seen_at).getTime()) / 60000 
        : null;
      
      console.log(`[STRATÉGIE] Livreur ${livreur.nom} — Heartbeat: ${heartbeatAgeMin?.toFixed(1) || 'N/A'} min, App active: ${livreur.app_active}`);
      
      // CAS 1: Heartbeat récent (< 2 min) → SILGAPP uniquement (app ouverte)
      if (heartbeatAgeMin !== null && heartbeatAgeMin < 2) {
        console.log(`[STRATÉGIE] ✅ Heartbeat récent (${heartbeatAgeMin.toFixed(1)} min) → SILGAPP uniquement (gratuit)\n`);
        return Response.json({ 
          success: true, 
          type: 'livreur', 
          canal: 'silgapp',
          heartbeat_recent: true,
          message: 'App ouverte — SILGAPP uniquement'
        });
      }
      
      // CAS 2: Heartbeat >= 2 min → WhatsApp
      console.log(`[STRATÉGIE] ⏳ Heartbeat ancien (${heartbeatAgeMin?.toFixed(1) || 'N/A'} min) → Tentative WhatsApp`);

      const telephone = normaliserTelephone(livreur.telephone);
      if (!telephone) {
        console.log(`[WhatsApp] Course ${courseId} Livreur ${livreur.id}: téléphone invalide "${livreur.telephone}" → SKIP\n`);
        return Response.json({ skipped: true, reason: 'telephone_invalide' });
      }

      // 🔍 LOG COMPLET AVANT ENVOI
      console.log(`\n[WhatsApp] 🚀 TENTATIVE ENVOI LIVREUR`);
      console.log(`   Course: ${courseId}`);
      console.log(`   Livreur: ${livreur.nom} (${livreur.id})`);
      console.log(`   Email: ${destinataireEmail}`);
      console.log(`   Téléphone BRUT: "${livreur.telephone}"`);
      console.log(`   Téléphone NORMALISÉ: "${telephone}"`);
      console.log(`   To: "whatsapp:${telephone}"`);
      console.log(`   From: "${fromNumber}"`);
      console.log(`   Type: "nouvelle_course"`);
      console.log(`   Notification ID: ${notification.id || 'N/A'}\n`);

      // Vérifier anti-doublon WhatsApp pour cette course
      const alertesCourse = await base44.asServiceRole.entities.WhatsAppAlerte.filter({ 
        livreur_id: livreur.id,
        notification_id: notification.id || '',
        statut: 'sent'
      });
      
      if (alertesCourse.length > 0) {
        console.log(`[WhatsApp] Course ${courseId}: WhatsApp DÉJÀ ENVOYÉ → SKIP\n`);
        return Response.json({ skipped: true, reason: 'whatsapp_deja_envoye_course' });
      }
      
      const alerte = await base44.asServiceRole.entities.WhatsAppAlerte.create({
        livreur_id: livreur.id,
        livreur_telephone: telephone,
        notification_id: notification.id || '',
        statut: 'pending'
      });

      const messageLivreur = getMessageWhatsApp(notification.type, 'livreur');
      const { ok, data, to } = await envoyerWhatsApp(telephone, accountSid, authToken, fromNumber, messageLivreur);

      if (ok && data.sid) {
        await base44.asServiceRole.entities.WhatsAppAlerte.update(alerte.id, {
          statut: 'sent',
          twilio_sid: data.sid,
          heure_envoi: new Date().toISOString(),
          canal: 'whatsapp'
        });
        // ✅ Confirmer opt-in actif
        await base44.asServiceRole.entities.Livreur.update(livreur.id, {
          whatsapp_opt_in: true,
          whatsapp_opt_in_date: new Date().toISOString(),
          whatsapp_opt_in_expire_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          whatsapp_derniere_erreur: null,
        });
        console.log(`[WhatsApp] ✅ SUCCÈS LIVREUR: SID=${data.sid}, To=${to}, Canal: WhatsApp\n`);
        return Response.json({ 
          success: true, 
          type: 'livreur', 
          twilio_sid: data.sid, 
          to,
          course_id: courseId,
          livreur_id: livreur.id,
          canal: 'whatsapp',
          push_echec: true
        });
      } else {
        // 🔄 FALLBACK SMS — Dernier recours
        console.log(`[WhatsApp] ⚠️ Échec WhatsApp (Code=${data.code}) → tentative SMS`);

        // Marquer opt-in expiré si erreur 63015
        if (data.code === 63015) {
          await base44.asServiceRole.entities.Livreur.update(livreur.id, {
            whatsapp_opt_in: false,
            whatsapp_derniere_erreur: '63015',
            whatsapp_derniere_erreur_date: new Date().toISOString(),
          });
          console.log(`[WhatsApp] ⚠️ Livreur ${livreur.id} — whatsapp_opt_in=false (63015 avant SMS fallback)`);
        }

        const messageSMS = messageLivreur.replace(/[*_`]/g, '').replace(/\n/g, ' ');
        const smsResult = await envoyerSMS(telephone, accountSid, authToken, fromNumber, messageSMS);
        
        if (smsResult.ok && smsResult.data.sid) {
          await base44.asServiceRole.entities.WhatsAppAlerte.update(alerte.id, {
            statut: 'sent',
            twilio_sid: smsResult.data.sid,
            heure_envoi: new Date().toISOString(),
            canal: 'sms'
          });
          console.log(`[SMS] ✅ SUCCÈS LIVREUR: SID=${smsResult.data.sid}, To=${smsResult.to}, Canal: SMS (fallback)\n`);
          return Response.json({ 
            success: true, 
            type: 'livreur', 
            twilio_sid: smsResult.data.sid, 
            to: smsResult.to,
            course_id: courseId,
            livreur_id: livreur.id,
            canal: 'sms',
            whatsapp_echec: true,
            push_echec: true
          });
        } else {
          const erreur = `[${data.code || ''}] ${data.message || ''} raw:${JSON.stringify(data)}`.slice(0, 500);
          await base44.asServiceRole.entities.WhatsAppAlerte.update(alerte.id, { statut: 'failed', erreur, canal: 'whatsapp+sms' });
          // 🔄 Mise à jour opt-in si erreur 63015
          if (data.code === 63015) {
            await base44.asServiceRole.entities.Livreur.update(livreur.id, {
              whatsapp_opt_in: false,
              whatsapp_derniere_erreur: '63015',
              whatsapp_derniere_erreur_date: new Date().toISOString(),
            });
            console.log(`[WhatsApp] ⚠️ Livreur ${livreur.id} — whatsapp_opt_in mis à false (63015)`);
          }
          console.error(`[WhatsApp/SMS] ❌ ÉCHEC DOUBLE: WhatsApp Code=${data.code}, SMS=${smsResult.data?.message || 'non tenté'}\n`);
          return Response.json({ success: false, type: 'livreur', erreur, course_id: courseId, canal: 'failed' });
        }
      }
    }

    // ── 2. Chercher si c'est un CLIENT EXTERNE ────────────────────────────────
    const clients = await base44.asServiceRole.entities.ClientExterne.filter({
      user_email: destinataireEmail,
      actif: true
    });

    if (clients && clients.length > 0) {
      const client = clients[0];
      const courseId = notification.course_id || 'inconnu';

      console.log(`\n[WhatsApp] === DÉBUT CHECK Client ${client.id} Course ${courseId} ===`);
      console.log(`[WhatsApp] app_active=${client.app_active}, last_seen_at=${client.last_seen_at}`);

      if (!client.telephone) {
        console.log(`[WhatsApp] Course ${courseId} Client ${client.id}: telephone manquant → SKIP`);
        return Response.json({ skipped: true, reason: 'client_no_telephone' });
      }

      // 🎯 STRATÉGIE : WhatsApp uniquement si heartbeat >= 2 min (app fermée/inactive)
      const heartbeatAgeMinClient = client.last_seen_at 
        ? (Date.now() - new Date(client.last_seen_at).getTime()) / 60000 
        : null;
      
      console.log(`[STRATÉGIE CLIENT] ${client.nom} — Heartbeat: ${heartbeatAgeMinClient?.toFixed(1) || 'N/A'} min, App active: ${client.app_active}`);
      
      // CAS 1: Heartbeat récent (< 2 min) → SILGAPP uniquement (app ouverte)
      if (heartbeatAgeMinClient !== null && heartbeatAgeMinClient < 2) {
        console.log(`[STRATÉGIE CLIENT] ✅ Heartbeat récent → SILGAPP uniquement (gratuit)\n`);
        return Response.json({ 
          success: true, 
          type: 'client', 
          canal: 'silgapp',
          heartbeat_recent: true,
          message: 'App ouverte — SILGAPP uniquement'
        });
      }
      
      // CAS 2: Heartbeat >= 2 min → WhatsApp
      console.log(`[STRATÉGIE CLIENT] ⏳ Heartbeat ancien (${heartbeatAgeMinClient?.toFixed(1) || 'N/A'} min) → Tentative WhatsApp`);

      // Vérifier si WhatsApp déjà envoyé pour cette course
      const alertesCourse = await base44.asServiceRole.entities.WhatsAppAlerte.filter({ 
        livreur_telephone: normaliserTelephone(client.telephone),
        notification_id: notification.id || '',
        statut: 'sent'
      });
      
      if (alertesCourse.length > 0) {
        console.log(`[WhatsApp] Course ${courseId} Client ${client.id}: WhatsApp DÉJÀ ENVOYÉ → SKIP\n`);
        return Response.json({ skipped: true, reason: 'whatsapp_deja_envoye_client' });
      }

      // Anti-doublon global
      const [alertesExistantes, notifsNonLues] = await Promise.all([
        base44.asServiceRole.entities.WhatsAppAlerte.filter({ livreur_telephone: normaliserTelephone(client.telephone), statut: 'sent' }),
        base44.asServiceRole.entities.Notification.filter({ destinataire_email: destinataireEmail, lue: false })
      ]);

      if (alertesExistantes.length > 0 && notifsNonLues.length > 1) {
        console.log(`[WhatsApp] Course ${courseId} Client ${client.id}: alerte déjà envoyée → SKIP\n`);
        return Response.json({ skipped: true, reason: 'alerte_deja_envoyee_client' });
      }

      const telephone = normaliserTelephone(client.telephone);
      if (!telephone) {
        console.log(`[WhatsApp] Course ${courseId} Client ${client.id}: téléphone invalide "${client.telephone}" → SKIP\n`);
        return Response.json({ skipped: true, reason: 'telephone_invalide_client' });
      }

      // 🔍 LOG COMPLET AVANT ENVOI
      console.log(`\n[WhatsApp] 🚀 TENTATIVE ENVOI CLIENT`);
      console.log(`   Course: ${courseId}`);
      console.log(`   Client: ${client.nom} (${client.id})`);
      console.log(`   Email: ${destinataireEmail}`);
      console.log(`   Téléphone BRUT: "${client.telephone}"`);
      console.log(`   Téléphone NORMALISÉ: "${telephone}"`);
      console.log(`   To: "whatsapp:${telephone}"`);
      console.log(`   From: "${fromNumber}"`);
      console.log(`   Type: "nouvelle_course"`);
      console.log(`   Notification ID: ${notification.id || 'N/A'}\n`);

      const alerte = await base44.asServiceRole.entities.WhatsAppAlerte.create({
        livreur_id: client.id,
        livreur_telephone: telephone,
        notification_id: notification.id || '',
        statut: 'pending'
      });

      const messageClient = getMessageWhatsApp(notification.type, 'client');
      const { ok, data, to } = await envoyerWhatsApp(telephone, accountSid, authToken, fromNumber, messageClient);

      if (ok && data.sid) {
        await base44.asServiceRole.entities.WhatsAppAlerte.update(alerte.id, {
          statut: 'sent',
          twilio_sid: data.sid,
          heure_envoi: new Date().toISOString(),
          canal: 'whatsapp'
        });
        console.log(`[WhatsApp] ✅ SUCCÈS CLIENT: SID=${data.sid}, To=${to}\n`);
        return Response.json({ 
          success: true, 
          type: 'client', 
          twilio_sid: data.sid, 
          to,
          course_id: courseId,
          client_id: client.id,
          canal: 'whatsapp'
        });
      } else {
        // 🔄 FALLBACK SMS — Si WhatsApp échoue (erreur 63015 ou autre)
        console.log(`[WhatsApp] ⚠️ Échec WhatsApp (Code=${data.code}) → tentative SMS pour ${telephone}`);
        
        const messageSMS = messageClient.replace(/[*_`]/g, '').replace(/\n/g, ' ');
        const smsResult = await envoyerSMS(telephone, accountSid, authToken, fromNumber, messageSMS);
        
        if (smsResult.ok && smsResult.data.sid) {
          await base44.asServiceRole.entities.WhatsAppAlerte.update(alerte.id, {
            statut: 'sent',
            twilio_sid: smsResult.data.sid,
            heure_envoi: new Date().toISOString(),
            canal: 'sms'
          });
          console.log(`[SMS] ✅ SUCCÈS CLIENT: SID=${smsResult.data.sid}, To=${smsResult.to}\n`);
          return Response.json({ 
            success: true, 
            type: 'client', 
            twilio_sid: smsResult.data.sid, 
            to: smsResult.to,
            course_id: courseId,
            client_id: client.id,
            canal: 'sms',
            whatsapp_echec: true
          });
        } else {
          const erreur = `[${data.code || ''}] ${data.message || ''} raw:${JSON.stringify(data)}`.slice(0, 500);
          await base44.asServiceRole.entities.WhatsAppAlerte.update(alerte.id, { statut: 'failed', erreur, canal: 'whatsapp+sms' });
          console.error(`[WhatsApp/SMS] ❌ ÉCHEC DOUBLE: WhatsApp Code=${data.code}, SMS=${smsResult.data?.message || 'non tenté'}\n`);
          return Response.json({ success: false, type: 'client', erreur, course_id: courseId, canal: 'failed' });
        }
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