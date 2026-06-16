import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    const body = await req.json();
    const { course_id, type_destinataire } = body;

    if (!course_id || !type_destinataire) {
      return Response.json({ error: 'course_id et type_destinataire requis' }, { status: 400 });
    }

    if (!['expediteur', 'destinataire'].includes(type_destinataire)) {
      return Response.json({ error: 'type_destinataire doit etre expediteur ou destinataire' }, { status: 400 });
    }

    const courses = await base44.entities.CourseExterne.filter({ id: course_id });
    const course = courses?.[0];
    if (!course) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }

    // Déterminer le destinataire WhatsApp
    let telephone, nom, statutField, erreurField;
    let message = '';

    const pickupCode = course.pickup_code_4_digits || 'N/A';
    const deliveryCode = course.delivery_code_4_digits || 'N/A';
    const ref = course.id?.slice(-6) || 'N/A';

    if (type_destinataire === 'expediteur') {
      telephone = course.expediteur_telephone || course.client_telephone;
      nom = course.expediteur_nom || course.client_nom || 'Client';
      statutField = 'whatsapp_expediteur_statut';
      erreurField = 'whatsapp_expediteur_erreur';

      const lieuDepart = course.adresse_depart || 'Non precise';
      const lieuArrivee = course.adresse_arrivee || 'Non precise';

      const isDeplacement = course.type_course === 'deplacement';
      const trackingLink = course.tracking_link || 'https://silgapp.com/suivi';

      if (isDeplacement) {
        message = [
          `*SILGAPP - Votre deplacement #${ref}*\n`,
          `Bonjour ${nom},`,
          `Votre deplacement SILGAPP a ete cree.\n`,
          `*Details :*`,
          `🚗 Type : Deplacement`,
          `📍 Depart : ${lieuDepart}`,
          `📍 Destination : ${lieuArrivee}`,
          ``,
          `📲 *Suivez votre livreur en temps reel :*`,
          `${trackingLink}`,
          ``,
          `📲 *Telechargez SILGAPP* : https://silgapp.com/telecharger`,
        ].join('\n');
      } else {
        message = [
          `*SILGAPP - Votre course #${ref}*\n`,
          `Bonjour ${nom},`,
          `Votre course a ete creee avec succes.\n`,
          `*Details :*`,
          `📦 Type : ${course.type_course === 'expedier' ? 'Expedition' : 'Reception'}`,
          `📍 Depart : ${lieuDepart}`,
          `📍 Arrivee : ${lieuArrivee}`,
          ``,
          `*Code de recuperation :*`,
          `🔢 PIN : *${pickupCode}*`,
          ``,
          `Montrez ce code au livreur lors de la recuperation.`,
          ``,
          `📲 *Telechargez SILGAPP* pour suivre votre course : https://silgapp.com/telecharger`,
        ].join('\n');
      }
    } else {
      telephone = course.destinataire_telephone;
      nom = course.destinataire_nom || 'Destinataire';
      statutField = 'whatsapp_destinataire_statut';
      erreurField = 'whatsapp_destinataire_erreur';

      const lieuArrivee = course.adresse_arrivee || 'Non precise';

      message = [
        `*SILGAPP - Colis en route #${ref}*\n`,
        `Bonjour ${nom},`,
        `Un colis est en route pour vous.\n`,
        `*Details :*`,
        `📍 Livraison : ${lieuArrivee}`,
        ``,
        `*Code de livraison :*`,
        `🔢 PIN : *${deliveryCode}*`,
        ``,
        `Montrez ce code au livreur a la livraison.`,
        ``,
        `📲 *Telechargez SILGAPP* : https://silgapp.com/telecharger`,
      ].join('\n');
    }

    if (!telephone || telephone.trim() === '') {
      await base44.asServiceRole.entities.CourseExterne.update(course_id, {
        [statutField]: 'non_envoye',
        [erreurField]: 'Aucun numero de telephone renseigne',
      });
      return Response.json({ success: false, error: 'Aucun numero de telephone' });
    }

    // Nettoyer le numéro (garder uniquement les chiffres)
    let numero = telephone.replace(/\D/g, '');

    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFrom = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';

    if (!twilioSid || !twilioToken) {
      await base44.asServiceRole.entities.CourseExterne.update(course_id, {
        [statutField]: 'echec',
        [erreurField]: 'Configuration Twilio manquante (secrets)',
      });
      return Response.json({ success: false, error: 'Configuration Twilio manquante' });
    }

    // Envoyer via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const auth = btoa(`${twilioSid}:${twilioToken}`);

    try {
      const formData = new URLSearchParams();
      formData.append('From', twilioFrom);
      formData.append('To', `whatsapp:+${numero}`);
      formData.append('Body', message);

      const twilioRes = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const twilioData = await twilioRes.json();

      if (twilioRes.ok) {
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          [statutField]: 'envoye',
          [erreurField]: null,
        });
        return Response.json({ success: true, sid: twilioData.sid });
      } else {
        const erreurMsg = twilioData.message || 'Erreur Twilio inconnue';
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          [statutField]: 'echec',
          [erreurField]: erreurMsg,
        });
        return Response.json({ success: false, error: erreurMsg });
      }
    } catch (twilioError) {
      await base44.asServiceRole.entities.CourseExterne.update(course_id, {
        [statutField]: 'echec',
        [erreurField]: twilioError.message || 'Erreur reseau Twilio',
      });
      return Response.json({ success: false, error: twilioError.message });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});