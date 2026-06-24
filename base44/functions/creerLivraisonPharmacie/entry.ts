import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function generateToken() {
  return crypto.randomUUID().replace(/-/g, '');
}

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function sendPush(base44, payload) {
  try {
    await base44.functions.invoke('envoiNotificationPush', payload);
    console.log(`[creerLivraisonPharmacie] push envoye: ${payload.type} -> ${payload.destinataire_email}`);
  } catch (error) {
    console.error(`[creerLivraisonPharmacie] erreur push: ${error?.message || error}`);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { pharmacie_id, client_id, conversation_id } = body;
    if (!pharmacie_id || !client_id) {
      return Response.json({ error: 'pharmacie_id et client_id requis' }, { status: 400 });
    }

    const asService = base44.asServiceRole;
    const pharmacie = await asService.entities.Pharmacie.get(pharmacie_id);
    if (!pharmacie) return Response.json({ error: 'Pharmacie introuvable' }, { status: 404 });

    if (pharmacie.user_email !== user.email && pharmacie.partenaire_id !== user.id) {
      return Response.json({ error: "Vous n'etes pas proprietaire de cette pharmacie" }, { status: 403 });
    }
    if (!pharmacie.latitude || !pharmacie.longitude) {
      return Response.json({ error: "La pharmacie n'a pas de position GPS enregistree" }, { status: 400 });
    }

    const client = await asService.entities.ClientExterne.get(client_id);
    if (!client) return Response.json({ error: 'Client introuvable' }, { status: 404 });
    if (!client.latitude || !client.longitude) {
      return Response.json({ error: "Le client n'a pas de position GPS. Demandez-lui d'ouvrir l'application." }, { status: 400 });
    }

    const clientName = `${client.prenom || ''} ${client.nom || ''}`.trim() || client.telephone || 'Client';
    const pickupToken = generateToken();
    let deliveryToken = generateToken();
    while (deliveryToken === pickupToken) deliveryToken = generateToken();
    const pickupPin = generatePin();
    let deliveryPin = generatePin();
    while (deliveryPin === pickupPin) deliveryPin = generatePin();

    const course = await asService.entities.CourseExterne.create({
      country_code: pharmacie.pays_code,
      source: 'client',
      type_course: 'expedier',
      client_nom: clientName,
      client_telephone: client.telephone || '',
      expediteur_nom: pharmacie.nom,
      expediteur_telephone: pharmacie.telephone || '',
      destinataire_nom: clientName,
      destinataire_telephone: client.telephone || '',
      destinataire_client_id: client.id,
      recipient_has_app: true,
      adresse_depart: pharmacie.adresse || pharmacie.quartier || pharmacie.nom,
      adresse_arrivee: client.quartier || client.ville || 'Position client',
      quartier_depart: pharmacie.quartier || '',
      quartier_arrivee: client.quartier || '',
      ville_depart: pharmacie.ville || '',
      ville_arrivee: client.ville || '',
      gps_depart_lat: pharmacie.latitude,
      gps_depart_lng: pharmacie.longitude,
      gps_arrivee_lat: client.latitude,
      gps_arrivee_lng: client.longitude,
      latitude_livraison: client.latitude,
      longitude_livraison: client.longitude,
      type_colis: 'autre',
      notes: `Livraison pharmacie ${pharmacie.nom || ''} vers ${clientName}${conversation_id ? ` - conversation ${conversation_id}` : ''}`,
      devise: 'FCFA',
      statut: 'nouvelle',
      dispatch_status: 'en_attente',
      pricing_mode: 'manual',
      pharmacie_id,
      conversation_id: conversation_id || '',
      pickup_qr_token: pickupToken,
      pickup_code_4_digits: pickupPin,
      delivery_qr_token: deliveryToken,
      delivery_code_4_digits: deliveryPin,
      pickup_confirmed_at: null,
      delivery_confirmed_at: null,
    });

    await sendPush(base44, {
      titre: 'Livraison pharmacie creee',
      message: `${pharmacie.nom} a cree une livraison pour vous. Recherche d'un livreur en cours.`,
      type: 'livraison_pharmacie_creee',
      destinataire_email: client.user_email,
      user_type: 'client',
      client_id: client.id,
      course_id: course.id,
    });

    await sendPush(base44, {
      titre: 'Livraison creee',
      message: `La livraison vers ${clientName} est creee. QR/PIN de recuperation disponibles.`,
      type: 'livraison_pharmacie_creee',
      destinataire_email: pharmacie.user_email,
      user_type: 'partenaire',
      course_id: course.id,
    });

    try {
      await base44.functions.invoke('dispatchExterneAuto', {
        action: 'lancer_recherche_auto',
        course_id: course.id,
      });
      console.log(`[creerLivraisonPharmacie] dispatch lance pour course ${course.id}`);
    } catch (dispatchError) {
      console.error(`[creerLivraisonPharmacie] erreur dispatch: ${dispatchError?.message || dispatchError}`);
    }

    return Response.json({ success: true, course });
  } catch (error) {
    console.error('[creerLivraisonPharmacie] erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
