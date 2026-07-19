import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Envoie une notification WhatsApp de suivi de course au client.
 *
 * Phase 9 — Suivi automatique :
 * Quand le statut d'une course change, cette fonction envoie un message
 * WhatsApp au client (expéditeur ou destinataire selon le type de course)
 * avec les informations pertinentes (livreur assigné, en route, livré, etc.)
 *
 * Payload:
 *   - course_id: ID de la course
 *   - evenement: "livreur_assigne" | "arrive_prise_en_charge" | "pris_en_charge" | "livre" | "annule"
 */

const STATUT_LABELS = {
  livreur_en_route: 'Votre livreur est en route',
  arrive_prise_en_charge: 'Votre livreur est arrivé sur place',
  colis_recupere: 'Votre colis a été récupéré',
  pris_en_charge: 'Votre colis a été récupéré',
  en_livraison: 'Votre colis est en cours de livraison',
  livree: 'Votre colis a été livré',
  annulee: 'Votre course a été annulée',
};

function construireMessage(course, evenement) {
  const ref = course.id?.slice(-6) || 'N/A';
  const livreurNom = course.livreur_nom || 'votre livreur';
  const livreurVehicule = course.livreur_vehicule || 'moto';
  const livreurTel = course.livreur_telephone || '';
  const trackingLink = course.tracking_link || '';
  const devise = course.devise || 'FCFA';

  switch (evenement) {
    case 'livreur_assigne':
      return [
        `COURSE SILGAPP #${ref}`,
        ``,
        `Votre livreur a été assigné !`,
        `Nom : ${livreurNom}`,
        `Véhicule : ${livreurVehicule}`,
        livreurTel ? `Téléphone : ${livreurTel}` : '',
        ``,
        trackingLink ? `Suivez votre livreur en temps réel :` : '',
        trackingLink || '',
      ].filter(l => l !== '').join('\n');

    case 'arrive_prise_en_charge':
      return [
        `COURSE SILGAPP #${ref}`,
        ``,
        `${livreurNom} est arrivé au point de prise en charge.`,
        livreurTel ? `Vous pouvez le contacter au ${livreurTel}.` : '',
      ].filter(l => l !== '').join('\n');

    case 'pris_en_charge':
      return [
        `COURSE SILGAPP #${ref}`,
        ``,
        `Votre colis a été récupéré par ${livreurNom}.`,
        `Livraison en cours vers ${course.adresse_arrivee || 'la destination'}.`,
        trackingLink ? `Suivez l'acheminement : ${trackingLink}` : '',
      ].filter(l => l !== '').join('\n');

    case 'livre':
      const prix = course.prix_final || course.prix_estimate;
      return [
        `COURSE SILGAPP #${ref}`,
        ``,
        `Votre colis a été livré avec succès !`,
        `Livré par : ${livreurNom}`,
        prix ? `Montant : ${prix.toLocaleString()} ${devise}` : '',
        ``,
        `Merci d'utiliser SILGAPP.`,
      ].filter(l => l !== '').join('\n');

    case 'annule':
      return [
        `COURSE SILGAPP #${ref}`,
        ``,
        `Votre course a été annulée.`,
        course.notes ? `Motif : ${course.notes}` : '',
        ``,
        `Pour toute question, contactez le support au +226 66 92 51 90.`,
      ].filter(l => l !== '').join('\n');

    default:
      const label = STATUT_LABELS[course.statut] || `Statut: ${course.statut}`;
      return `COURSE SILGAPP #${ref}\n\n${label}.`;
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
    const { course_id, evenement } = body;

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

    const message = construireMessage(course, evenement);

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
      console.log(`[SuiviWhatsApp] Message envoyé à +${numero} pour course ${course_id} (${evenement})`);
      return Response.json({ success: true, sid: twilioData.sid });
    } else {
      console.error('[SuiviWhatsApp] Erreur Twilio:', twilioData.message || twilioData);
      return Response.json({ success: false, error: twilioData.message || 'Erreur Twilio' });
    }
  } catch (error) {
    console.error('[SuiviWhatsApp] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});