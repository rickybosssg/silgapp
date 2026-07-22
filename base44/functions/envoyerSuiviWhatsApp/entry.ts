import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { genererReferenceCourse } from '../../shared/venusCourseReference.ts';
import { normalizePhone } from '../../shared/phoneUtils.ts';

/**
 * Envoie une notification WhatsApp de suivi de course au client.
 *
 * Phase 9 — Suivi automatique :
 * Quand le statut d'une course change, cette fonction envoie un message
 * WhatsApp au client (expéditeur ou destinataire selon le type de course)
 * avec les informations pertinentes (livreur assigné, en route, livré, etc.)
 *
 * Phase QR/PIN — Envoi automatique du QR Code + Code PIN :
 * Quand un livreur est assigné (evenement: "livreur_assigne"), VENUS envoie
 * automatiquement le QR Code officiel (image) et le Code PIN générés par SILGAPP.
 * En cas de réaffectation, précise que les anciens codes sont toujours valables
 * (ou invalidés si de nouveaux ont été générés).
 *
 * Payload:
 *   - course_id: ID de la course
 *   - evenement: "livreur_assigne" | "arrive_prise_en_charge" | "pris_en_charge" | "livre" | "annule"
 *   - is_redispatch: (optionnel) true si réaffectation après annulation livreur
 */

const STATUT_LABELS = {
  recherche_livreur: '🚚 Recherche d\'un livreur en cours',
  livreur_en_route: '🚗 Votre livreur est en route vers vous',
  arrive_prise_en_charge: '📍 Votre livreur est arrivé sur place',
  colis_recupere: '📦 Votre colis a été récupéré',
  pris_en_charge: '📦 Votre colis a été récupéré',
  en_livraison: '🚚 Votre colis est en cours de livraison',
  livree: '✅ Votre colis a été livré',
  annulee: '❌ Votre course a été annulée',
};

// genererReference est maintenant importé depuis venusCourseReference.ts

function construireMessage(course, evenement, body = {}) {
  const ref = genererReferenceCourse(course);
  const livreurNom = course.livreur_nom || 'votre livreur';
  const livreurVehicule = course.livreur_vehicule || 'moto';
  const livreurTel = course.livreur_telephone || '';
  const trackingLink = course.tracking_link || '';
  const devise = course.devise || 'FCFA';

  switch (evenement) {
    case 'livreur_assigne':
      return [
        `✅ Livreur trouvé !`,
        ``,
        `📝 Référence : ${ref}`,
        `👤 Livreur : ${livreurNom}`,
        `🚗 Véhicule : ${livreurVehicule}`,
        livreurTel ? `📞 Téléphone : ${livreurTel}` : '',
        ``,
        `📍 Votre livreur est en route vers le point de récupération.`,
        `⏱️ Arrivée estimée : moins de 5 minutes`,
        ``,
        trackingLink ? `🔗 Suivez votre livreur en temps réel :` : '',
        trackingLink || '',
      ].filter(l => l !== '').join('\n');

    case 'livreur_assigne_qr':
      const isRedispatch = body.is_redispatch === true;
      const pin = course.pickup_code_4_digits || '';
      return [
        isRedispatch
          ? `✅ Un nouveau livreur a accepté votre course !`
          : `✅ Livreur trouvé !`,
        ``,
        `📝 Référence : ${ref}`,
        `👤 Livreur : ${livreurNom}`,
        livreurTel ? `📞 Téléphone : ${livreurTel}` : '',
        ``,
        `Voici votre QR Code et votre Code PIN de récupération.`,
        ``,
        `🔐 Code PIN : ${pin}`,
        trackingLink ? `` : '',
        trackingLink ? `🔗 Suivez votre livreur en temps réel :` : '',
        trackingLink || '',
        ``,
        isRedispatch
          ? `⚠️ Les anciens codes ne sont plus valables. Utilisez uniquement ce nouveau QR Code et ce Code PIN.`
          : `🔒 Ne communiquez le QR Code et le Code PIN au livreur qu'au moment où il récupère effectivement votre colis. Pour votre sécurité, ne les partagez jamais avant son arrivée.`,
      ].filter(l => l !== '').join('\n');

    case 'prix_manuel_propose':
      const prixManuel = Number(course.manual_price || body.manual_price || 0);
      return [
        `💰 Prix proposé par votre livreur`,
        ``,
        `📝 Référence : ${ref}`,
        `👤 Livreur : ${livreurNom}`,
        `💰 Prix : ${prixManuel.toLocaleString()} ${devise}`,
        ``,
        `Répondez "oui" pour accepter ce prix ou "non" pour refuser.`,
        ``,
        `En cas de refus, je rechercherai un autre livreur pour vous.`,
      ].filter(l => l !== '').join('\n');

    case 'arrive_prise_en_charge':
      return [
        `📍 Votre livreur est arrivé sur place`,
        ``,
        `📝 Référence : ${ref}`,
        `👤 ${livreurNom} est arrivé au point de prise en charge.`,
        livreurTel ? `📞 Vous pouvez le contacter au ${livreurTel}.` : '',
      ].filter(l => l !== '').join('\n');

    case 'pris_en_charge':
      return [
        `📦 Votre colis a été récupéré par le livreur`,
        ``,
        `📝 Référence : ${ref}`,
        `👤 Récupéré par : ${livreurNom}`,
        ``,
        `🚚 Votre colis est maintenant en route vers sa destination.`,
        trackingLink ? `🔗 Suivez l'acheminement : ${trackingLink}` : '',
      ].filter(l => l !== '').join('\n');

    case 'livre':
      const prix = course.prix_final || (course.manual_price_status === 'accepted' ? course.manual_price : null) || course.prix_estimate;
      return [
        `✅ Colis livré avec succès !`,
        ``,
        `📝 Référence : ${ref}`,
        `👤 Livré par : ${livreurNom}`,
        prix ? `💰 Montant : ${prix.toLocaleString()} ${devise}` : '',
        ``,
        `Merci d'avoir choisi SILGAPP ! 🎉`,
      ].filter(l => l !== '').join('\n');

    case 'annule':
      return [
        `❌ Course annulée`,
        ``,
        `📝 Référence : ${ref}`,
        `Votre course a été annulée.`,
        course.notes ? `Motif : ${course.notes}` : '',
        ``,
        `Pour toute question, contactez le support au +226 66 92 51 90.`,
      ].filter(l => l !== '').join('\n');

    default:
      const label = STATUT_LABELS[course.statut] || `Statut : ${course.statut}`;
      return `📝 Référence : ${ref}\n\n${label}.`;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: admin ou service-role (appel depuis d'autres fonctions)
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      isAdmin = user?.role === 'admin';
    } catch { /* appel interne depuis dispatchExterneAuto */ }

    const body = await req.json();
    const { course_id, evenement, is_redispatch } = body;

    if (!evenement) {
      return Response.json({ error: 'evenement requis' }, { status: 400 });
    }

    // ── Événement spécial : inviter un destinataire non inscrit ──
    // Pas de course_id requis : on envoie directement les infos + lien téléchargement
    if (evenement === 'inviter_destinataire') {
      const tel = body.telephone || '';
      const countryCode = body.country_code || 'BF';
      const clientNom = body.client_nom || 'un client';
      const typeCourse = body.type_course || 'expedier';

      if (!tel) {
        return Response.json({ success: false, skipped: 'no_phone' });
      }

      const INDICATIFS2 = { BF: '+226', CI: '+225', TG: '+228', BJ: '+229', SN: '+221', ML: '+223', GN: '+224', NE: '+227', GH: '+233' };
      const ind2 = INDICATIFS2[countryCode] || '+226';
      let num2 = tel.replace(/\D/g, '');
      if (!num2.startsWith(ind2.replace('+', ''))) {
        num2 = ind2.replace('+', '') + num2;
      }

      const msgInvite = typeCourse === 'recevoir'
        ? [
            `📦 Bonjour !`,
            ``,
            `${clientNom} souhaite vous envoyer un colis via SILGAPP, le service de livraison à moto.`,
            ``,
            `Pour suivre l'acheminement de votre colis en temps réel et recevoir les notifications de livraison, téléchargez l'application SILGAPP :`,
            ``,
            `📱 Téléchargez SILGAPP gratuitement :`,
            `https://silgapp.base44.app/telecharger`,
            ``,
            `Une fois installée, créez votre compte et vous pourrez suivre toutes vos livraisons en direct !`,
            ``,
            `Pour toute question, contactez le support au +226 66 92 51 90.`,
          ].join('\n')
        : [
            `📦 Bonjour !`,
            ``,
            `${clientNom} a programmé une livraison vers vous via SILGAPP, le service de livraison à moto.`,
            ``,
            `Pour suivre l'arrivée de votre colis en temps réel et recevoir les notifications de livraison, téléchargez l'application SILGAPP :`,
            ``,
            `📱 Téléchargez SILGAPP gratuitement :`,
            `https://silgapp.base44.app/telecharger`,
            ``,
            `Une fois installée, créez votre compte et vous pourrez suivre toutes vos livraisons en direct !`,
            ``,
            `Pour toute question, contactez le support au +226 66 92 51 90.`,
          ].join('\n');

      const twilioSid2 = Deno.env.get('TWILIO_ACCOUNT_SID');
      const twilioToken2 = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twilioFrom2 = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';

      if (!twilioSid2 || !twilioToken2) {
        return Response.json({ success: false, error: 'Configuration Twilio manquante' }, { status: 500 });
      }

      const twilioUrl2 = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid2}/Messages.json`;
      const auth2 = btoa(`${twilioSid2}:${twilioToken2}`);
      const formData2 = new URLSearchParams();
      formData2.append('From', twilioFrom2);
      formData2.append('To', `whatsapp:+${num2}`);
      formData2.append('Body', msgInvite);

      const twilioRes2 = await fetch(twilioUrl2, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth2}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData2.toString(),
      });

      const twilioData2 = await twilioRes2.json();

      if (twilioRes2.ok) {
        console.log(`[SuiviWhatsApp] Invitation destinataire envoyée à +${num2}`);
        return Response.json({ success: true, sid: twilioData2.sid, type: 'invitation_destinataire' });
      } else {
        console.error('[SuiviWhatsApp] Erreur Twilio invitation:', twilioData2.message || twilioData2);
        return Response.json({ success: false, error: twilioData2.message || 'Erreur Twilio' });
      }
    }

    if (!course_id) {
      return Response.json({ error: 'course_id requis' }, { status: 400 });
    }

    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
    if (!course) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }

    // Déterminer le numéro WhatsApp du client à notifier
    // Pour "expedier" et "deplacement" : notifier l'expéditeur/client
    // Pour "recevoir" : notifier le destinataire (qui reçoit le colis)
    let telephone = '';
    if (course.type_course === 'recevoir') {
      telephone = course.destinataire_telephone || course.client_telephone || '';
    } else {
      telephone = course.client_telephone || course.expediteur_telephone || '';
    }

    if (!telephone) {
      return Response.json({ success: false, skipped: 'no_phone' });
    }

    // Normaliser le numéro au format canonique DB (226XXXXXXXX sans +)
    const INDICATIFS = { BF: '+226', CI: '+225', TG: '+228', BJ: '+229', SN: '+221', ML: '+223', GN: '+224', NE: '+227', GH: '+233' };
    const indicatif = INDICATIFS[course.country_code] || '+226';
    let numero = normalizePhone(telephone, course.country_code) || telephone.replace(/\D/g, '');
    // Garde anti-régression : si normalizePhone n'a pas pu normaliser, appliquer l'ancienne logique
    if (!numero || numero.length < 8) {
      numero = telephone.replace(/\D/g, '');
      if (!numero.startsWith(indicatif.replace('+', ''))) {
        numero = indicatif.replace('+', '') + numero;
      }
    }

    // ── Phase QR/PIN : générer et envoyer le QR Code + PIN ──
    // Le QR Code est généré à partir du token officiel SILGAPP (pickup_qr_token).
    // L'URL publique du QR Code est passée directement à Twilio comme MediaUrl.
    let qrImageUrl: string | null = null;
    let messageEvenement = evenement;

    if (evenement === 'livreur_assigne' && course.pickup_qr_token && course.pickup_code_4_digits) {
      // URL publique du QR Code générée depuis le token officiel SILGAPP
      // Twilio téléchargera cette image automatiquement lors de l'envoi
      qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=2&color=000000&bgcolor=ffffff&data=${encodeURIComponent(course.pickup_qr_token)}`;
      messageEvenement = 'livreur_assigne_qr';
      console.log(`[SuiviWhatsApp] 📱 QR Code URL: ${qrImageUrl.substring(0, 80)}...`);
    }

    // Construire le message (avec PIN si livreur_assigne_qr)
    const message = construireMessage(course, messageEvenement, { is_redispatch });

    // Envoyer via Twilio
    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFrom = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';

    if (!twilioSid || !twilioToken) {
      console.error('[SuiviWhatsApp] Secrets Twilio manquants');
      return Response.json({ success: false, error: 'Configuration Twilio manquante' }, { status: 500 });
    }

    // ── Helper : rechercher une conversation par numéro (gère + et sans +, legacy) ──
    async function trouverConversationParNumero(num: string): Promise<any | null> {
      const normalized = normalizePhone(num) || num.replace(/\D/g, '');
      // 1. Format canonique (sans +) — format futur
      let convs = await base44.asServiceRole.entities.Conversation.filter({ whatsapp_phone: normalized });
      if (convs?.[0]) return convs[0];
      // 2. Format legacy avec + (anciennes conversations Twilio brut)
      convs = await base44.asServiceRole.entities.Conversation.filter({ whatsapp_phone: `+${normalized}` });
      if (convs?.[0]) return convs[0];
      // 3. Fallback : chercher par derniers chiffres (pour données mal formées)
      const last8 = normalized.slice(-8);
      const all = await base44.asServiceRole.entities.Conversation.filter({ source: 'whatsapp' }, '-last_message_date', 200);
      const match = (all || []).find(c => {
        const cd = (c.whatsapp_phone || '').replace(/\D/g, '');
        return cd.endsWith(last8);
      });
      return match || null;
    }

    // ── Garde anti-doublon : vérifier qu'un message identique n'a pas été envoyé
    // dans les 2 dernières minutes à ce même numéro pour cette même course ──
    try {
      const conv = await trouverConversationParNumero(numero);
      const convId = conv?.id;
      if (convId) {
        const recentMsgs = await base44.asServiceRole.entities.Message.filter({
          sender_id: 'venus',
          conversation_id: convId,
        }, '-created_date', 5);
        const deuxMinAgo = Date.now() - 2 * 60 * 1000;
        const isDuplicate = (recentMsgs || []).some(m =>
          m.content === message && new Date(m.created_date).getTime() > deuxMinAgo
        );
        if (isDuplicate) {
          console.log(`[SuiviWhatsApp] ⏭️ Doublon détecté — message identique envoyé il y a < 2min, skip`);
          return Response.json({ success: true, skipped: 'duplicate', sid: 'skipped' });
        }
      }
    } catch (dedupErr) {
      console.warn(`[SuiviWhatsApp] Garde anti-doublon échouée (non bloquant):`, dedupErr?.message);
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const auth = btoa(`${twilioSid}:${twilioToken}`);
    const formData = new URLSearchParams();
    formData.append('From', twilioFrom);
    formData.append('To', `whatsapp:+${numero}`);
    formData.append('Body', message);
    if (qrImageUrl) {
      formData.append('MediaUrl', qrImageUrl);
    }

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const twilioData = await twilioRes.json();

    if (twilioRes.ok) {
      console.log(`[SuiviWhatsApp] Message envoyé à +${numero} pour course ${course_id} (${messageEvenement}${qrImageUrl ? ' + QR' : ''})`);

      // ── Stocker le message dans la DB pour l'historique et la détection contextuelle ──
      // Sans cela, handlePrixManuelResponse ne peut pas détecter que le dernier message
      // VENUS était une proposition de prix (le "Oui" du client tombe alors dans le LLM)
      try {
        const conv = await trouverConversationParNumero(numero);
        if (conv) {
          await base44.asServiceRole.entities.Message.create({
            conversation_id: conv.id,
            sender_type: 'admin',
            sender_id: 'venus',
            sender_name: 'VENUS',
            message_type: 'text',
            content: message,
            source: 'whatsapp',
          });
          await base44.asServiceRole.entities.Conversation.update(conv.id, {
            last_message: message.slice(0, 80),
            last_message_date: new Date().toISOString(),
            last_sender_name: 'VENUS',
            last_sender_type: 'admin',
          });
        }
      } catch (storeErr) {
        console.warn(`[SuiviWhatsApp] Stockage message DB échoué (non bloquant):`, storeErr.message);
      }

      return Response.json({ success: true, sid: twilioData.sid, qr_sent: !!qrImageUrl });
    } else {
      console.error('[SuiviWhatsApp] Erreur Twilio:', twilioData.message || twilioData);
      return Response.json({ success: false, error: twilioData.message || 'Erreur Twilio' });
    }
  } catch (error) {
    console.error('[SuiviWhatsApp] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});