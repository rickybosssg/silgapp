// ── Handlers de courses VENUS (déterministes, 0 crédit LLM) ──────────────────
// Extrait de webhookWhatsAppVenus — aucune logique métier modifiée.
// Gère: consultation, localisation, redispatch, contact livreur, annulation, prix manuel, modification.

import { detecterPaysDepuisTelephone } from './venusPrompt.ts';
import { genererReferenceCourse } from './venusCourseReference.ts';
import {
  detecterIntentionModification,
  extraireChampEtValeur,
  appliquerModification,
  getChampLabel,
  getChampsModifiables,
  STATUTS_NON_MODIFIABLES,
  genererRecapModification,
} from './venusCourseModifierEngine.ts';
import { trouverCourseActive } from './venusReasoningEngine.ts';
import { envoyerWhatsAppRaw } from './twilioWhatsApp.ts';

export async function handleConsultationCourse(base44, telephone, userMessage, profileName) {
  const telDigits = telephone.replace(/\D/g, '');

  let courses = await base44.asServiceRole.entities.CourseExterne.filter(
    { client_telephone: telephone },
    '-created_date', 5
  );

  if (!courses || courses.length === 0) {
    courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { expediteur_telephone: telephone },
      '-created_date', 5
    );
  }

  if (!courses || courses.length === 0) {
    const countryCode = detecterPaysDepuisTelephone(telephone);
    const allRecent = await base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: countryCode },
      '-created_date', 50
    );
    courses = allRecent.filter(c => {
      const ct = (c.client_telephone || '').replace(/\D/g, '');
      const et = (c.expediteur_telephone || '').replace(/\D/g, '');
      return ct.endsWith(telDigits.slice(-8)) || et.endsWith(telDigits.slice(-8));
    }).slice(0, 5);
  }

  if (!courses || courses.length === 0) {
    return `Bonjour ${profileName || ''}, je n'ai trouve aucune course associee a votre numero ${telephone}. Si vous souhaitez creer une nouvelle course, dites-le moi ! Pour toute question, contactez le support au +226 66 92 51 90.`;
  }

  const STATUTS_ACTIFS = ['nouvelle', 'programmee', 'recherche_livreur', 'livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque', 'pris_en_charge', 'en_livraison', 'arrivee'];
  const courseActive = courses.find(c => STATUTS_ACTIFS.includes(c.statut)) || courses[0];

  const ref = courseActive.id?.slice(-6) || 'N/A';
  const statut = courseActive.statut || 'inconnu';
  const livreurNom = courseActive.livreur_nom || '';
  const livreurTel = courseActive.livreur_telephone || '';
  const adresseDepart = courseActive.adresse_depart || 'Non precise';
  const adresseArrivee = courseActive.adresse_arrivee || 'Non precise';
  const trackingLink = courseActive.tracking_link || '';
  const prix = courseActive.prix_final || (courseActive.manual_price_status === 'accepted' ? courseActive.manual_price : null) || courseActive.prix_estimate;

  const STATUT_LABELS = {
    nouvelle: "Votre course vient d'etre creee. Nous recherchons un livreur.",
    programmee: "Votre course est programmee.",
    recherche_livreur: "Nous recherchons actuellement un livreur pour votre course.",
    livreur_en_route: "Votre livreur est en route vers le point de prise en charge.",
    arrive_prise_en_charge: "Votre livreur est arrive au point de prise en charge.",
    colis_recupere: "Votre colis a ete recupere. Livraison en cours.",
    pris_en_charge: "Votre colis a ete recupere. Livraison en cours.",
    passager_embarque: "Votre passager a ete pris en charge.",
    en_livraison: "Votre colis est en cours de livraison.",
    arrivee: "Votre livreur est arrive a destination.",
    livree: "Votre colis a ete livre avec succes !",
    annulee: "Votre course a ete annulee.",
  };

  let message = `COURSE SILGAPP #${ref}\n\n`;
  message += `${STATUT_LABELS[statut] || "Statut: " + statut}\n\n`;
  message += `Depart: ${adresseDepart}\n`;
  message += `Arrivee: ${adresseArrivee}\n`;

  if (livreurNom) {
    message += `\nLivreur: ${livreurNom}`;
    if (livreurTel) message += ` (${livreurTel})`;
  }

  if (prix) {
    message += `\nPrix: ${prix.toLocaleString()} ${courseActive.devise || 'FCFA'}`;
  }

  if (trackingLink && STATUTS_ACTIFS.includes(statut)) {
    message += `\n\nSuivez votre livreur en temps reel:`;
    message += `\n${trackingLink}`;
  }

  if (statut === 'livree') {
    message += `\n\nMerci d'utiliser SILGAPP !`;
  }

  return message;
}

export async function handleLocationAssignment(base44, conversation, userMessage) {
  let pendingCourse: any = null;
  try {
    pendingCourse = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : null;
  } catch { pendingCourse = null; }

  if (!pendingCourse || pendingCourse.pending_location_lat == null) {
    return null;
  }

  const msgLower = userMessage.toLowerCase();
  const isPickup = ['recuperation', 'récupération', 'recuperer', 'récupérer', 'depart', 'départ', 'prise en charge', 'recupere', 'récupère'].some(kw => msgLower.includes(kw));
  const isDelivery = ['livraison', 'livrer', 'arrivee', 'arrivée', 'destination', 'arriver'].some(kw => msgLower.includes(kw));

  if (!isPickup && !isDelivery) {
    return null;
  }

  if (isPickup && pendingCourse.gps_depart_lat != null) {
    return "J'ai deja enregistre votre lieu de recuperation. Veuillez m'envoyer la localisation du lieu de livraison, ou indiquez-moi le quartier de livraison.";
  }
  if (isDelivery && pendingCourse.gps_arrivee_lat != null) {
    return "J'ai deja enregistre votre lieu de livraison. Veuillez m'envoyer la localisation du lieu de recuperation, ou indiquez-moi le quartier de depart.";
  }

  if (isPickup) {
    pendingCourse.gps_depart_lat = pendingCourse.pending_location_lat;
    pendingCourse.gps_depart_lng = pendingCourse.pending_location_lng;
    pendingCourse.adresse_depart = 'Localisation GPS partagee';
    delete pendingCourse.pending_location_lat;
    delete pendingCourse.pending_location_lng;

    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      venus_pending_course: JSON.stringify(pendingCourse),
    });

    console.log(`[WebhookVenus] 📍 Localisation assignee au DEPART pour ${conversation.id}`);

    if (pendingCourse.gps_arrivee_lat == null && !pendingCourse.adresse_arrivee) {
      return "Merci. J'ai bien enregistre votre lieu de recuperation. Veuillez maintenant m'envoyer la localisation du lieu de livraison, ou si vous ne l'avez pas, indiquez-moi le quartier de livraison.";
    } else if (!pendingCourse.type_course) {
      return "Merci. J'ai bien enregistre votre lieu de recuperation. Quel type de course souhaitez-vous ? (envoyer un colis, recevoir un colis, ou vous deplacer)";
    } else {
      return "Merci. J'ai bien enregistre votre lieu de recuperation. Votre demande est prete. Souhaitez-vous confirmer la creation de cette course ? Repondez 'oui' pour confirmer.";
    }
  }

  if (isDelivery) {
    pendingCourse.gps_arrivee_lat = pendingCourse.pending_location_lat;
    pendingCourse.gps_arrivee_lng = pendingCourse.pending_location_lng;
    pendingCourse.adresse_arrivee = 'Localisation GPS partagee';
    delete pendingCourse.pending_location_lat;
    delete pendingCourse.pending_location_lng;

    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      venus_pending_course: JSON.stringify(pendingCourse),
    });

    console.log(`[WebhookVenus] 📍 Localisation assignee a l'ARRIVEE pour ${conversation.id}`);

    if (pendingCourse.gps_depart_lat == null && !pendingCourse.adresse_depart) {
      return "Merci. J'ai bien enregistre votre lieu de livraison. Veuillez maintenant m'envoyer la localisation du lieu de recuperation, ou si vous ne l'avez pas, indiquez-moi le quartier de depart.";
    } else if (!pendingCourse.type_course) {
      return "Merci. J'ai bien enregistre votre lieu de livraison. Quel type de course souhaitez-vous ? (envoyer un colis, recevoir un colis, ou vous deplacer)";
    } else {
      return "Merci. J'ai bien enregistre votre lieu de livraison. Votre demande est prete. Souhaitez-vous confirmer la creation de cette course ? Repondez 'oui' pour confirmer.";
    }
  }

  return null;
}

export async function handleRedispatchDecision(base44: any, conversation: any, userMessage: string) {
  let pendingCourse: any = null;
  try {
    pendingCourse = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : null;
  } catch { pendingCourse = null; }

  if (!pendingCourse?.redispatch_pending || !pendingCourse?.redispatch_course_id) {
    return null;
  }

  const courseId = pendingCourse.redispatch_course_id;
  const msgLower = userMessage.toLowerCase().trim();

  const OUI_KEYWORDS = [
    'oui', 'ok', "d'accord", 'd accord', 'ouai', 'ouais', 'volontiers', 'bien sur',
    "c'est bon", 'cest bon', 'go', 'confirme', 'valider', 'valide', 'oui je veux',
    'rechercher', 'relancer', 'encore', 'pourquoi pas', 'cest ok', "c'est ok",
  ];
  const NON_KEYWORDS = [
    'non', 'annuler', 'annule', 'je refuse', 'non merci', 'pas besoin',
    'plus besoin', 'laisse', 'laisser', 'stop', 'rien', 'non plus', 'c bon', 'cest bon',
  ];

  const isOui = OUI_KEYWORDS.some(kw => msgLower === kw || msgLower.startsWith(kw + ' ') || msgLower.startsWith(kw + '.') || msgLower.startsWith(kw + '!'));
  const isNon = NON_KEYWORDS.some(kw => msgLower === kw || msgLower.startsWith(kw + ' ') || msgLower.startsWith(kw + '.') || msgLower.startsWith(kw + '!'));

  if (!isOui && !isNon) {
    return "Je n'ai pas bien compris votre réponse. Voulez-vous que je recherche un autre livreur pour votre course ? Répondez 'oui' pour relancer la recherche ou 'non' pour annuler définitivement.";
  }

  delete pendingCourse.redispatch_pending;
  delete pendingCourse.redispatch_course_id;
  delete pendingCourse.redispatch_motif;
  await base44.asServiceRole.entities.Conversation.update(conversation.id, {
    venus_pending_course: JSON.stringify(pendingCourse),
  });

  if (isOui) {
    const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
    if (!course || course.statut === 'annulee' || course.statut === 'livree') {
      return "Cette course n'est plus disponible. N'hésitez pas à me solliciter si vous avez besoin d'une nouvelle course.";
    }

    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      dispatch_status: 'en_attente',
      dispatch_wave: 0,
      dispatch_notified_ids: '[]',
      dispatch_wave_notified_ids: '[]',
      timeout_expires_at: null,
    });

    base44.asServiceRole.functions.invoke('dispatchExterneAuto', {
      action: 'lancer_recherche_auto',
      course_id: courseId,
    }).catch((err: any) => {
      console.error('[WebhookVenus] ❌ Erreur relance dispatch:', err?.message || err);
    });

    console.log(`[WebhookVenus] ✅ Client a accepté redispatch pour course ${courseId}`);
    return "Parfait ! Je lance immédiatement la recherche d'un nouveau livreur pour votre course. Je vous informerai dès qu'un livreur aura accepté. Le livreur vous contactera ensuite pour confirmer les derniers détails.";
  } else {
    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      statut: 'annulee',
      dispatch_status: 'expire',
    });

    console.log(`[WebhookVenus] ❌ Client a refusé redispatch pour course ${courseId} — annulation définitive`);
    return "D'accord, j'annule définitivement votre course. N'hésitez pas à me solliciter si vous avez besoin d'autre chose. Merci d'utiliser SILGAPP !";
  }
}

export async function handleContactLivreur(base44: any, conversation: any, userMessage: string, telephone: string, profileName: string) {
  let pendingCourse: any = null;
  try {
    pendingCourse = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : null;
  } catch { pendingCourse = null; }

  const STATUTS_ACTIFS = ['livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque', 'pris_en_charge', 'en_livraison', 'arrivee'];

  if (pendingCourse?.contact_livreur_mode === true && pendingCourse?.contact_livreur_course_id) {
    const exitKeywords = ['merci', 'au revoir', 'aurevoir', 'fin', 'annuler', 'quitter', 'stop', 'plus besoin', "c'est bon", 'cest bon', 'terminer', 'c bon', 'cest fini'];
    const msgLower = userMessage.toLowerCase().trim();
    if (exitKeywords.some(kw => msgLower === kw || msgLower.startsWith(kw + ' ') || msgLower.startsWith(kw + '.') || msgLower.startsWith(kw + '!'))) {
      delete pendingCourse.contact_livreur_mode;
      delete pendingCourse.contact_livreur_course_id;
      delete pendingCourse.contact_livreur_livreur_id;
      delete pendingCourse.contact_livreur_livreur_tel;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, {
        venus_pending_course: JSON.stringify(pendingCourse),
      });
      return "D'accord, j'ai mis fin à la conversation avec le livreur. N'hésitez pas si vous avez besoin d'autre chose.";
    }

    const courseId = pendingCourse.contact_livreur_course_id;
    const livreurId = pendingCourse.contact_livreur_livreur_id;
    const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);

    if (!course) {
      delete pendingCourse.contact_livreur_mode;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(pendingCourse) });
      return "Cette course n'est plus disponible. Pour toute question, contactez le support au +226 66 92 51 90.";
    }

    if (!STATUTS_ACTIFS.includes(course.statut)) {
      delete pendingCourse.contact_livreur_mode;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(pendingCourse) });
      const statutLabel = course.statut === 'livree' ? 'livrée' : course.statut === 'annulee' ? 'annulée' : 'terminée';
      return `Votre course est désormais ${statutLabel}. Le contact avec le livreur n'est plus disponible. Merci d'utiliser SILGAPP !`;
    }

    const livreurTel = course.livreur_telephone;
    const livreurNom = course.livreur_nom || 'votre livreur';

    if (!livreurTel) {
      delete pendingCourse.contact_livreur_mode;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(pendingCourse) });
      return "Je ne parviens pas à joindre votre livreur. Pour toute question, contactez le support au +226 66 92 51 90.";
    }

    let pushSent = false;
    try {
      const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId);
      if (livreur?.user_email) {
        await base44.asServiceRole.entities.Notification.create({
          titre: `💬 Message de votre client ${profileName || telephone}`,
          message: userMessage.substring(0, 200),
          type: 'message_client',
          course_id: courseId,
          destinataire_email: livreur.user_email,
          lue: false,
        });
        pushSent = true;
        base44.asServiceRole.functions.invoke('envoiNotificationPush', {
          destinataire_email: livreur.user_email,
          livreur_id: livreurId,
          titre: '💬 Message de votre client',
          message: userMessage.substring(0, 100),
          type: 'message_client',
          course_id: courseId,
        }).catch((err: any) => console.error('[WebhookVenus] ❌ Push livreur:', err.message));
      }
    } catch (e) { console.error('[WebhookVenus] Erreur notif livreur:', e.message); }

    let whatsappSent = false;
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';

    if (accountSid && authToken) {
      const INDICATIFS: any = { BF: '+226', CI: '+225', TG: '+228', BJ: '+229', SN: '+221', ML: '+223', GN: '+224', NE: '+227', GH: '+233' };
      const indicatif = INDICATIFS[course.country_code] || '+226';
      let tel = livreurTel.replace(/\s+/g, '').replace(/[^\d+]/g, '');
      if (!tel.startsWith('+')) tel = indicatif + tel;
      try {
        const result = await envoyerWhatsAppRaw(tel, `💬 *Message de votre client ${profileName || telephone}:*\n\n${userMessage}\n\n_Répondez ici ou dans l'application SILGAPP_`);
        whatsappSent = result.success;
      } catch (e) { console.error('[WebhookVenus] Erreur WhatsApp livreur:', e.message); }
    }

    return `✅ Votre message a été transmis au livreur ${livreurNom} :\n\n"${userMessage}"\n\n${whatsappSent ? "Il vous répondra dès que possible via WhatsApp." : pushSent ? "Il a été notifié dans l'application SILGAPP." : "Vous pouvez l'appeler directement."}\n\nÉcrivez un autre message ou dites "fin" pour terminer.`;
  }

  const contactKeywords = [
    'parler au livreur', 'parler a mon livreur', 'parler avec le livreur',
    'contacter le livreur', 'contacter mon livreur', 'contacter livreur',
    'appeler le livreur', 'appeler mon livreur', 'appeler livreur',
    'ecrire au livreur', 'écrire au livreur',
    'envoyer un message au livreur', 'message au livreur',
    'joindre le livreur', 'joindre mon livreur',
    'numero du livreur', 'numéro du livreur', 'numero de mon livreur',
    'telephone du livreur', 'téléphone du livreur', 'tel du livreur',
    'le contact du livreur', 'contact du livreur', 'contact livreur',
    'communiquer avec le livreur',
    'le numero de mon livreur', 'le telephone du livreur',
  ];
  const msgLower = userMessage.toLowerCase();
  const isContactIntent = contactKeywords.some(kw => msgLower.includes(kw));
  if (!isContactIntent) return null;

  let courses = await base44.asServiceRole.entities.CourseExterne.filter(
    { client_telephone: telephone }, '-created_date', 10
  );
  if (!courses || courses.length === 0) {
    courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { expediteur_telephone: telephone }, '-created_date', 10
    );
  }
  if (!courses || courses.length === 0) {
    const cc = detecterPaysDepuisTelephone(telephone);
    const allRecent = await base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: cc }, '-created_date', 50
    );
    const telDigits = telephone.replace(/\D/g, '');
    courses = allRecent.filter(c => {
      const ct = (c.client_telephone || '').replace(/\D/g, '');
      const et = (c.expediteur_telephone || '').replace(/\D/g, '');
      return ct.endsWith(telDigits.slice(-8)) || et.endsWith(telDigits.slice(-8));
    }).slice(0, 10);
  }

  const courseActive = courses.find(c => STATUTS_ACTIFS.includes(c.statut) && c.livreur_telephone);
  if (!courseActive) {
    return "Je ne trouve pas de course active avec un livreur assigné pour le moment. Si vous souhaitez créer une nouvelle course ou suivre une course, dites-le moi ! Pour toute question, contactez le support au +226 66 92 51 90.";
  }

  pendingCourse = pendingCourse || {};
  pendingCourse.contact_livreur_mode = true;
  pendingCourse.contact_livreur_course_id = courseActive.id;
  pendingCourse.contact_livreur_livreur_id = courseActive.livreur_id;
  pendingCourse.contact_livreur_livreur_tel = courseActive.livreur_telephone;
  await base44.asServiceRole.entities.Conversation.update(conversation.id, {
    venus_pending_course: JSON.stringify(pendingCourse),
  });

  const livreurNom = courseActive.livreur_nom || 'votre livreur';
  const livreurTel = courseActive.livreur_telephone;
  const trackingLink = courseActive.tracking_link || '';

  let response = `🧑‍✈️ Votre livreur : ${livreurNom}\n\n`;
  response += `📞 Pour l'appeler : ${livreurTel}\n\n`;
  response += `Vous pouvez :\n`;
  response += `1. Appeler le livreur au numéro ci-dessus\n`;
  response += `2. Écrire un message ici — je le transmettrai immédiatement au livreur\n`;
  if (trackingLink) {
    response += `3. Suivre la position du livreur : ${trackingLink}\n`;
  }
  response += `\nÉcrivez votre message ou dites "fin" pour terminer.`;
  return response;
}

export async function handleAnnulationCourse(base44: any, conversation: any, userMessage: string, telephone: string, profileName: string, countryCode: string): Promise<string | null> {
  const msgLower = userMessage.toLowerCase().trim();

  const ANNUL_KEYWORDS = [
    'annule', 'annuler', 'annulation', 'annulez',
    'anule', 'anuler', 'anulation', 'anulez',
    'supprime', 'supprimer', 'supprimez',
    'stoppe', 'stopper', 'arrete', 'arrêter', 'arrête',
    'je veux annuler', 'annule la course', 'annule ma course',
    'anule la course', 'anule ma course',
    'annule cette course', 'anule cette course',
    'plus besoin de la course',
  ];
  const isNegative = msgLower.includes('ne veux pas') || msgLower.includes('ne pas annuler') || msgLower.includes('garde') || msgLower.includes('annule pas');
  const isDirectAnnulation = !isNegative && ANNUL_KEYWORDS.some(kw => msgLower.includes(kw));

  const CONFIRM_KW = ['oui', 'ok', "d'accord", 'd accord', 'confirme', 'valider', 'valide', 'go', 'ouais', 'volontiers', 'correct', 'daco', 'je confirme'];
  const isConfirmation = msgLower.length <= 30 && CONFIRM_KW.some(kw => msgLower === kw || msgLower.startsWith(kw + ' ') || msgLower.startsWith(kw + '.') || msgLower.startsWith(kw + '!'));

  let shouldCancel = isDirectAnnulation;
  let isConfirmationTrigger = false;

  if (!shouldCancel && isConfirmation) {
    try {
      const recentMessages = await base44.asServiceRole.entities.Message.filter(
        { conversation_id: conversation.id, sender_type: 'admin', source: 'whatsapp' },
        '-created_date', 3
      ).catch(() => []);
      const lastVenusMsg = (recentMessages?.[0]?.content || '').toLowerCase();
      if (lastVenusMsg.includes('annul')) {
        shouldCancel = true;
        isConfirmationTrigger = true;
        console.log('[WebhookVenus] 🗑️ Confirmation d\'annulation détectée (VENUS avait demandé confirmation)');
      }
    } catch {}
  }

  if (!shouldCancel) return null;

  const STATUTS_ACTIFS = ['nouvelle', 'programmee', 'recherche_livreur', 'livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque', 'pris_en_charge', 'en_livraison', 'arrivee'];

  let courses = await base44.asServiceRole.entities.CourseExterne.filter(
    { client_telephone: telephone }, '-created_date', 10
  );
  if (!courses || courses.length === 0) {
    courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { expediteur_telephone: telephone }, '-created_date', 10
    );
  }
  if (!courses || courses.length === 0) {
    const allRecent = await base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: countryCode }, '-created_date', 50
    );
    const telDigits = telephone.replace(/\D/g, '');
    courses = (allRecent || []).filter(c => {
      const ct = (c.client_telephone || '').replace(/\D/g, '');
      const et = (c.expediteur_telephone || '').replace(/\D/g, '');
      return ct.endsWith(telDigits.slice(-8)) || et.endsWith(telDigits.slice(-8));
    }).slice(0, 10);
  }

  const courseActive = courses?.find(c => STATUTS_ACTIFS.includes(c.statut));
  if (!courseActive) {
    if (isConfirmationTrigger) {
      console.log('[WebhookVenus] 🗑️ Confirmation d\'annulation mais aucune course active trouvée — passage au moteur de raisonnement');
      return null;
    }
    return "Je ne trouve aucune course active à annuler. Si vous souhaitez créer une nouvelle course, dites-le moi ! Pour toute question, contactez le support au +226 66 92 51 90.";
  }

  try {
    console.log(`[WebhookVenus] 🗑️ Annulation demandée pour course ${courseActive.id} (statut actuel: ${courseActive.statut})`);

    await base44.asServiceRole.functions.invoke('annulerCourseExterne', {
      course_id: courseActive.id,
      motif: 'client_change_avis',
      source: 'admin',
    });

    const courseVerifiee = await base44.asServiceRole.entities.CourseExterne.get(courseActive.id);

    if (courseVerifiee && courseVerifiee.statut === 'annulee') {
      const notifsActives = await base44.asServiceRole.entities.Notification.filter({
        course_id: courseActive.id, lue: false,
      }).catch(() => []);
      for (const n of notifsActives) {
        await base44.asServiceRole.entities.Notification.update(n.id, { lue: true }).catch(() => null);
      }

      console.log(`[WebhookVenus] ✅ Annulation CONFIRMÉE en DB pour course ${courseActive.id} | dispatch: ${courseVerifiee.dispatch_status} | ${notifsActives.length} notifications stoppées`);

      return `✅ Votre course a été annulée avec succès.\n\n📝 Référence : ${genererReferenceCourse(courseActive)}\n\nSi vous souhaitez créer une nouvelle course, je suis à votre disposition.`;
    } else {
      console.error(`[WebhookVenus] ❌ Annulation ÉCHOUÉE pour course ${courseActive.id} — statut DB: ${courseVerifiee?.statut || 'introuvable'}`);
      return "⚠️ Je n'ai pas pu annuler votre course. Une erreur technique est survenue. Veuillez réessayer ou contacter le support au +226 66 92 51 90.";
    }
  } catch (e: any) {
    console.error(`[WebhookVenus] ❌ Erreur annulation course ${courseActive.id}:`, e.message);
    return "⚠️ Je n'ai pas pu annuler votre course pour le moment. Veuillez réessayer ou contacter le support au +226 66 92 51 90.";
  }
}

export async function handlePrixManuelResponse(base44: any, conversation: any, userMessage: string, telephone: string, countryCode: string): Promise<string | null> {
  const msgLower = userMessage.toLowerCase().trim();

  const OUI_KW = ['oui', 'ok', "d'accord", 'd accord', 'confirme', 'valider', 'valide', 'go', 'ouais', 'volontiers', 'accepte', 'accepter', "c'est bon", 'cest bon', 'correct', 'daco', 'je confirme'];
  const NON_KW = ['non', 'refuse', 'refuser', 'je refuse', 'non merci', 'pas ok', 'trop cher', 'c est trop', 'cest trop', 'no'];

  const isOui = msgLower.length <= 30 && OUI_KW.some(kw => msgLower === kw || msgLower.startsWith(kw + ' ') || msgLower.startsWith(kw + '.') || msgLower.startsWith(kw + '!'));
  const isNon = NON_KW.some(kw => msgLower === kw || msgLower.startsWith(kw + ' ') || msgLower.startsWith(kw + '.') || msgLower.startsWith(kw + '!'));
  if (!isOui && !isNon) return null;

  try {
    const recentMessages = await base44.asServiceRole.entities.Message.filter(
      { conversation_id: conversation.id, sender_type: 'admin', source: 'whatsapp' },
      '-created_date', 5
    ).catch(() => []);
    const hasPrixContext = (recentMessages || []).some(m =>
      (m.content || '').toLowerCase().includes('prix') && (m.content || '').toLowerCase().includes('livreur')
    );
    if (!hasPrixContext) return null;
  } catch { return null; }

  const STATUTS_RECHERCHE = ['recherche_livreur', 'nouvelle'];
  let courses = await base44.asServiceRole.entities.CourseExterne.filter(
    { client_telephone: telephone }, '-created_date', 10
  );
  if (!courses || courses.length === 0) {
    courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { expediteur_telephone: telephone }, '-created_date', 10
    );
  }
  if (!courses || courses.length === 0) {
    const allRecent = await base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: countryCode }, '-created_date', 50
    );
    const telDigits = telephone.replace(/\D/g, '');
    courses = (allRecent || []).filter(c => {
      const ct = (c.client_telephone || '').replace(/\D/g, '');
      const et = (c.expediteur_telephone || '').replace(/\D/g, '');
      return ct.endsWith(telDigits.slice(-8)) || et.endsWith(telDigits.slice(-8));
    }).slice(0, 10);
  }

  const courseEnAttente = courses?.find(c =>
    c.manual_price_status === 'pending_client_validation' &&
    STATUTS_RECHERCHE.includes(c.statut)
  );
  if (!courseEnAttente) return null;

  console.log(`[WebhookVenus] 💰 Réponse prix manuel détectée — course ${courseEnAttente.id} — client dit: ${isOui ? 'OUI' : 'NON'}`);

  try {
    const result = await base44.asServiceRole.functions.invoke('dispatchExterneAuto', {
      action: 'valider_prix_manuel',
      course_id: courseEnAttente.id,
      accepted: isOui,
    });

    if (isOui) {
      const prix = Number(courseEnAttente.manual_price || 0);
      const devise = courseEnAttente.devise || 'FCFA';
      console.log(`[WebhookVenus] 💰 ✅ Prix accepté pour course ${courseEnAttente.id}`);

      let trackingLink = courseEnAttente.tracking_link || '';
      if (!trackingLink) {
        try {
          const token = crypto.randomUUID();
          trackingLink = `https://silgapp.base44.app/suivi-public/${token}`;
          await base44.asServiceRole.entities.CourseExterne.update(courseEnAttente.id, {
            tracking_token: token, tracking_link: trackingLink, tracking_shared_at: new Date().toISOString(),
          });
        } catch (e) { console.warn(`[WebhookVenus] Generation tracking link échouée:`, e.message); }
      }

      try {
        await base44.asServiceRole.functions.invoke('envoyerSuiviWhatsApp', {
          course_id: courseEnAttente.id, evenement: 'livreur_assigne',
        });
      } catch (e) { console.warn(`[WebhookVenus] Envoi QR/PIN échoué:`, e.message); }

      const pin = courseEnAttente.pickup_code_4_digits || '';
      return `✅ Parfait ! Vous avez accepté le prix de ${prix.toLocaleString()} ${devise}.\n\n🚗 Votre livreur ${courseEnAttente.livreur_nom || ''} est maintenant en route vers le point de récupération.${pin ? `\n\n🔐 Votre code PIN de récupération : ${pin}` : ''}${trackingLink ? `\n\n🔗 Suivez votre livreur en temps réel :\n${trackingLink}` : ''}\n\n📱 Le QR Code de récupération vous a également été envoyé. Ne le partagez qu'au moment de la récupération du colis.`;
    } else {
      console.log(`[WebhookVenus] 💰 ❌ Prix refusé pour course ${courseEnAttente.id} — redispatch`);
      return `D'accord, j'ai bien noté votre refus. Je recherche immédiatement un autre livreur pour votre course. Je vous informerai dès qu'un nouveau livreur aura accepté.`;
    }
  } catch (e: any) {
    console.error(`[WebhookVenus] 💌 Erreur validation prix manuel: ${e.message}`);
    return null;
  }
}

export async function handleModifierCourse(base44, conversation, userMessage, telephone, profileName, countryCode) {
  let pendingCourse: any = null;
  try { pendingCourse = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : null; } catch { pendingCourse = null; }
  if (!pendingCourse) pendingCourse = {};

  const msgLower = userMessage.toLowerCase().trim();
  const CONFIRM_KW_MOD = ['oui', 'ok', "d'accord", 'd accord', 'je confirme', 'valider', 'confirmer', 'confirme', "c'est bon", 'cest bon', 'go', "c'est ok", 'cest ok', 'parfait', 'exact', 'ouais', 'je valide', 'valide', 'correct', 'daco'];
  const REFUSE_KW_MOD = ['non', 'annuler', 'annule', 'je refuse', 'non merci', 'pas maintenant', 'finalement non', 'laisse tomber'];

  if (pendingCourse.modification_mode && pendingCourse.modification_statut === 'attente_confirmation') {
    const isRefuse = REFUSE_KW_MOD.some(kw => msgLower === kw || msgLower.startsWith(kw + ' ') || msgLower.startsWith(kw + '!'));
    const isConfirm = !isRefuse && msgLower.length <= 30 && CONFIRM_KW_MOD.some(kw => msgLower.includes(kw));

    if (isRefuse) {
      const cleared = { ...pendingCourse };
      delete cleared.modification_mode;
      delete cleared.modification_statut;
      delete cleared.modification_champ;
      delete cleared.modification_ancienne_valeur;
      delete cleared.modification_nouvelle_valeur;
      delete cleared.modification_recap_presente;
      delete cleared.modification_course_id;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, {
        venus_pending_course: JSON.stringify(cleared),
      });
      return "D'accord, modification annulée. N'hésitez pas si vous avez besoin d'autre chose.";
    }

    if (isConfirm) {
      const champ = pendingCourse.modification_champ;
      const courseId = pendingCourse.modification_course_id;
      const newValue = pendingCourse.modification_nouvelle_valeur;
      const champLabel = getChampLabel(champ);

      const result = await appliquerModification(base44, {
        course_id: courseId,
        modifications: { [champ]: newValue },
        auteur: telephone,
        canal: 'whatsapp',
      });

      const cleared = { ...pendingCourse };
      delete cleared.modification_mode;
      delete cleared.modification_statut;
      delete cleared.modification_champ;
      delete cleared.modification_ancienne_valeur;
      delete cleared.modification_nouvelle_valeur;
      delete cleared.modification_recap_presente;
      delete cleared.modification_course_id;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, {
        venus_pending_course: JSON.stringify(cleared),
      });

      if (result.success && result.changes?.length > 0 && result.changes[0].verifie) {
        const change = result.changes[0];
        let msg = `✅ Modification appliquée avec succès !\n\n${champLabel} :\n  Avant : ${change.ancienne_valeur || 'N/A'}\n  Après : ${change.valeur_reelle || 'N/A'}\n\nLa modification a bien été enregistrée dans le système.`;
        if (result.livreur_notifie) msg += '\n\n📢 Le livreur a été informé de cette modification.';
        if (result.prix_recalcule) msg += '\n💰 Le tarif a été recalculé en fonction de la nouvelle adresse.';
        return msg;
      } else {
        const errMsg = result.errors?.[0]?.error || 'Une erreur est survenue.';
        return `❌ La modification n'a pas pu être appliquée. ${errMsg} Veuillez réessayer ou contacter le support au +226 66 92 51 90.`;
      }
    }
  }

  if (pendingCourse.modification_mode && pendingCourse.modification_statut === 'attente_valeur') {
    const newValue = userMessage.trim();
    if (newValue.length < 2) {
      return `Je n'ai pas bien compris la nouvelle valeur. Pouvez-vous reformuler ? (ou répondez "annuler" pour abandonner)`;
    }

    const champ = pendingCourse.modification_champ;
    const ancienneValeur = pendingCourse.modification_ancienne_valeur;
    const champLabel = getChampLabel(champ);

    const course = await base44.asServiceRole.entities.CourseExterne.get(pendingCourse.modification_course_id);
    if (!course) {
      const cleared = { ...pendingCourse };
      delete cleared.modification_mode;
      delete cleared.modification_statut;
      delete cleared.modification_champ;
      delete cleared.modification_ancienne_valeur;
      delete cleared.modification_nouvelle_valeur;
      delete cleared.modification_recap_presente;
      delete cleared.modification_course_id;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(cleared) });
      return "Cette course n'existe plus. La modification ne peut pas être appliquée.";
    }

    if (STATUTS_NON_MODIFIABLES.includes(course.statut)) {
      const cleared = { ...pendingCourse };
      delete cleared.modification_mode;
      delete cleared.modification_statut;
      delete cleared.modification_champ;
      delete cleared.modification_ancienne_valeur;
      delete cleared.modification_nouvelle_valeur;
      delete cleared.modification_recap_presente;
      delete cleared.modification_course_id;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(cleared) });
      return `Cette course est maintenant au statut "${course.statut}" et ne peut plus être modifiée.`;
    }

    pendingCourse.modification_nouvelle_valeur = newValue;
    pendingCourse.modification_statut = 'attente_confirmation';
    pendingCourse.modification_recap_presente = true;
    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      venus_pending_course: JSON.stringify(pendingCourse),
    });

    return genererRecapModification(champ, ancienneValeur, newValue);
  }

  const isModificationIntent = detecterIntentionModification(userMessage);
  if (!isModificationIntent) return null;

  const courseActive = await trouverCourseActive(base44, telephone, countryCode);
  if (!courseActive) {
    return "Je ne trouve pas de course active à modifier. Si vous souhaitez créer une nouvelle course, dites-le moi simplement.";
  }

  if (STATUTS_NON_MODIFIABLES.includes(courseActive.statut)) {
    return `Cette course est au statut "${courseActive.statut}" et ne peut plus être modifiée. Si vous avez un problème avec cette course, n'hésitez pas à le décrire et je transmettrai à un responsable.`;
  }

  const extraction = await extraireChampEtValeur(base44, userMessage, courseActive);

  if (extraction.champ) {
    const allowed = getChampsModifiables(courseActive.statut);
    if (!allowed.includes(extraction.champ)) {
      return `Désolé, le champ "${getChampLabel(extraction.champ)}" ne peut plus être modifié à ce stade de la course (statut: ${courseActive.statut}). Les champs encore modifiables sont : ${allowed.map(c => getChampLabel(c)).join(', ')}.`;
    }
  }

  if (extraction.champ && extraction.valeur) {
    pendingCourse.modification_mode = true;
    pendingCourse.modification_course_id = courseActive.id;
    pendingCourse.modification_statut = 'attente_confirmation';
    pendingCourse.modification_champ = extraction.champ;
    pendingCourse.modification_ancienne_valeur = courseActive[extraction.champ] || 'N/A';
    pendingCourse.modification_nouvelle_valeur = extraction.valeur;
    pendingCourse.modification_recap_presente = true;
    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      venus_pending_course: JSON.stringify(pendingCourse),
    });

    return genererRecapModification(extraction.champ, courseActive[extraction.champ], extraction.valeur);
  }

  if (extraction.champ && !extraction.valeur) {
    pendingCourse.modification_mode = true;
    pendingCourse.modification_course_id = courseActive.id;
    pendingCourse.modification_statut = 'attente_valeur';
    pendingCourse.modification_champ = extraction.champ;
    pendingCourse.modification_ancienne_valeur = courseActive[extraction.champ] || 'N/A';
    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      venus_pending_course: JSON.stringify(pendingCourse),
    });

    return `Vous souhaitez modifier : ${getChampLabel(extraction.champ)}.\n\nActuellement : ${courseActive[extraction.champ] || 'N/A'}\n\nQuelle est la nouvelle valeur ? (ou répondez "annuler" pour abandonner)`;
  }

  if (extraction.question) {
    return extraction.question;
  }

  return "Que souhaitez-vous modifier sur votre course ? (adresse de récupération, adresse de livraison, destinataire, instructions, etc.)";
}