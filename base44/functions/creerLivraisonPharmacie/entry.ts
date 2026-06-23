import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Crée une livraison SILGAPP depuis une pharmacie.
 * - Authentifie le partenaire (pharmacien)
 * - Vérifie qu'il est propriétaire de la pharmacie
 * - Récupère le client destinataire
 * - Crée une CourseExterne:
 *     • Départ = pharmacie (GPS fixe)
 *     • Arrivée = client (GPS actuel)
 * - Génère QR Code + PIN Code (récupération + livraison)
 * - Déclenche le dispatch automatique
 * - Envoie notifications push au client + pharmacie
 */
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

    // ── Vérifier la pharmacie ──
    const pharmacie = await asService.entities.Pharmacie.get(pharmacie_id);
    if (!pharmacie) return Response.json({ error: 'Pharmacie introuvable' }, { status: 404 });
    if (pharmacie.user_email !== user.email && pharmacie.partenaire_id !== user.id) {
      return Response.json({ error: 'Vous n\'êtes pas propriétaire de cette pharmacie' }, { status: 403 });
    }
    if (!pharmacie.latitude || !pharmacie.longitude) {
      return Response.json({ error: 'La pharmacie n\'a pas de position GPS enregistrée' }, { status: 400 });
    }

    // ── Récupérer le client ──
    const client = await asService.entities.ClientExterne.get(client_id);
    if (!client) return Response.json({ error: 'Client introuvable' }, { status: 404 });
    if (!client.latitude || !client.longitude) {
      return Response.json({ error: 'Le client n\'a pas de position GPS. Demandez-lui d\'ouvrir l\'application.' }, { status: 400 });
    }

    const clientName = `${client.prenom || ''} ${client.nom || ''}`.trim() || client.telephone || 'Client';

    // ── Générer QR + PIN ──
    const pickupQrToken = crypto.randomUUID().replace(/-/g, '');
    const deliveryQrToken = crypto.randomUUID().replace(/-/g, '');
    const pickupCode4 = String(Math.floor(1000 + Math.random() * 9000));
    const deliveryCode4 = String(Math.floor(1000 + Math.random() * 9000));

    // ── Créer la CourseExterne ──
    const course = await asService.entities.CourseExterne.create({
      country_code: pharmacie.pays_code,
      source: 'client',
      client_nom: clientName,
      client_telephone: client.telephone,
      type_course: 'expedier',
      expediteur_nom: pharmacie.nom,
      expediteur_telephone: pharmacie.telephone,
      destinataire_nom: clientName,
      destinataire_telephone: client.telephone,
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
      type_colis: 'nourriture',
      devise: 'FCFA',
      statut: 'nouvelle',
      dispatch_status: 'en_attente',
      pickup_qr_token: pickupQrToken,
      pickup_code_4_digits: pickupCode4,
      delivery_qr_token: deliveryQrToken,
      delivery_code_4_digits: deliveryCode4,
      pickup_confirmed_at: null,
      delivery_confirmed_at: null,
    });

    console.log(`[creerLivraisonPharmacie] ✅ Course créée: ${course.id} (pharmacie → client)`);

    // ── Notification push au client ──
    try {
      if (client.user_email) {
        await base44.functions.invoke('envoiNotificationPush', {
          titre: 'Livraison pharmacie créée 🚚',
          message: `${pharmacie.nom} a créé une livraison pour vous. Recherche d'un livreur en cours...`,
          type: 'livraison_pharmacie_creee',
          destinataire_email: client.user_email,
          user_type: 'client',
          client_id: client.id,
          course_id: course.id,
        });
      }
    } catch (notifErr) {
      console.error(`[creerLivraisonPharmacie] ⚠️ Erreur notif client: ${notifErr.message}`);
    }

    // ── Déclencher le dispatch ──
    try {
      await base44.functions.invoke('dispatchExterneAuto', {
        action: 'lancer_recherche_auto',
        course_id: course.id,
      });
      console.log(`[creerLivraisonPharmacie] 🚀 Dispatch lancé pour course ${course.id}`);
    } catch (dispatchErr) {
      console.error(`[creerLivraisonPharmacie] ⚠️ Erreur dispatch: ${dispatchErr.message}`);
    }

    return Response.json({ success: true, course });
  } catch (error) {
    console.error('[creerLivraisonPharmacie] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});