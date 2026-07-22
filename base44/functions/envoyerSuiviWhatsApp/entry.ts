import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { genererReferenceCourse } from '../../shared/venusCourseReference.ts';

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

    if (!course_id || !evenement) {
      return Response.json({ error: 'course_id et evenement requis' }, { status: 400 });
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

    // Normaliser le numéro
    const INDICATIFS = { BF: '+226', CI: '+225', TG: '+228', BJ: '+229', SN: '+221', ML: '+223', GN: '+224', NE: '+227', GH: '+233' };
    const indicatif = INDICATIFS[course.country_code] || '+226';
    let numero = telephone.replace(/\D/g, '');
    if (!numero.startsWith('+')) {
      // Si le numéro ne commence pas par l'indicatif pays, l'ajouter
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
        const convs = await base44.asServiceRole.entities.Conversation.filter({ whatsapp_phone: telephone });
        const conv = convs?.[0];
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