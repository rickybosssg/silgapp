import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { calculerDistance } from '../../shared/dispatchConstants.ts';

function generateToken() { return crypto.randomUUID().replace(/-/g, ''); }
function generatePIN() { return String(Math.floor(1000 + Math.random() * 9000)); }

/**
 * Gère toutes les transitions de statut d'une commande partenaire.
 * Actions: verifier_paiement, valider_paiement, refuser_paiement, commencer_preparation, prete_recuperation, annuler
 *
 * Au passage à prete_recuperation:
 *   - Crée une CourseExterne (anti-double-création via course_id)
 *   - Lance le dispatch SILGAPP existant (dispatchExterneAuto)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { commande_id, type, action } = body;

    if (!commande_id || !type || !action) {
      return Response.json({ error: 'commande_id, type, action requis' }, { status: 400 });
    }
    if (!['boutique', 'restaurant'].includes(type)) {
      return Response.json({ error: 'type invalide' }, { status: 400 });
    }

    const isRestaurant = type === 'restaurant';
    const idField = isRestaurant ? 'restaurant_id' : 'boutique_id';
    const commandeEntity = isRestaurant ? 'CommandeRestaurant' : 'CommandeBoutique';
    const etablissementEntity = isRestaurant ? 'Restaurant' : 'Boutique';
    const asService = base44.asServiceRole;

    // ── Récupérer la commande ───────────────────────────────────────────
    const commande = await asService.entities[commandeEntity].get(commande_id);
    if (!commande) return Response.json({ error: 'Commande introuvable' }, { status: 404 });

    // ── Vérifier ownership (partenaire propriétaire OU admin) ──────────
    const etablissementId = commande[idField];
    const etablissement = await asService.entities[etablissementEntity].get(etablissementId);
    if (!etablissement) return Response.json({ error: 'Établissement introuvable' }, { status: 404 });

    const isAdmin = user.role === 'admin';
    if (!isAdmin && etablissement.partenaire_id !== user.id) {
      return Response.json({ error: 'Non autorisé' }, { status: 403 });
    }

    // ── Récupérer l'email du client pour les notifications ──────────────
    let clientEmail = '';
    try {
      const clientProfile = await asService.entities.ClientExterne.get(commande.client_id);
      clientEmail = clientProfile?.user_email || '';
    } catch (_) {}

    // ── Helper: envoyer notification push au client ──────────────────────
    async function notifierClient(titre, message, typeNotif, courseId) {
      if (!clientEmail) return;
      try {
        await base44.functions.invoke('envoiNotificationPush', {
          titre, message, type: typeNotif,
          destinataire_email: clientEmail,
          user_type: 'client',
          client_id: commande.client_id,
          course_id: courseId || '',
        });
        console.log(`[changerStatutCommande]  Client notifié: ${titre}`);
      } catch (err) {
        console.error(`[changerStatutCommande]  Erreur notif client: ${err.message}`);
      }
    }

    // ── Helper: envoyer notification push au partenaire ──────────────────
    async function notifierPartenaire(titre, message, typeNotif) {
      if (!etablissement.user_email) return;
      try {
        await base44.functions.invoke('envoiNotificationPush', {
          titre, message, type: typeNotif,
          destinataire_email: etablissement.user_email,
          user_type: 'partenaire',
        });
        console.log(`[changerStatutCommande]  Partenaire notifié: ${titre}`);
      } catch (err) {
        console.error(`[changerStatutCommande]  Erreur notif partenaire: ${err.message}`);
      }
    }

    // ── Anti-double-action: vérifier le statut actuel ───────────────────
    const ACTIONS = {
      verifier_paiement: { from: 'commande_envoyee', to: 'paiement_verification' },
      valider_paiement: { from: 'paiement_verification', to: 'paiement_valide' },
      refuser_paiement: { from: 'paiement_verification', to: 'paiement_refuse' },
      commencer_preparation: { from: 'paiement_valide', to: 'en_preparation' },
      prete_recuperation: { from: 'en_preparation', to: 'prete_recuperation' },
      annuler: { to: 'annulee' },
    };

    const transition = ACTIONS[action];
    if (!transition) return Response.json({ error: 'Action inconnue' }, { status: 400 });

    // Anti-double-validation
    if (transition.from && commande.statut !== transition.from) {
      return Response.json({ success: false, error: `Action impossible: statut actuel = ${commande.statut}`, current_statut: commande.statut });
    }

    // ── Cas spécial: commencer_preparation avec temps estimé (restaurants uniquement) ──
    // Crée la CourseExterne en avance avec dispatch_status = en_attente.
    // Le dispatch réel sera déclenché par l'automation dispatchAnticipeRestaurant
    // quand now >= dispatch_at, ou par le bouton "Prête" si le restaurant termine avant.
    if (action === 'commencer_preparation' && isRestaurant && body.preparation_time_minutes) {
      const preparationTimeMin = Number(body.preparation_time_minutes);
      if (![5, 10, 15, 20, 30].includes(preparationTimeMin)) {
        return Response.json({ error: 'preparation_time_minutes invalide (5, 10, 15, 20 ou 30)' }, { status: 400 });
      }

      // Anti-double-création
      if (commande.course_id) {
        console.log(`[changerStatutCommande] Course déjà créée pour commande ${commande_id}: ${commande.course_id}`);
        return Response.json({ success: true, message: 'Course déjà créée', course_id: commande.course_id, already_exists: true });
      }

      // Mettre à jour le statut
      await asService.entities[commandeEntity].update(commande_id, { statut: 'en_preparation' });

      // ── Calculer estimated_ready_at ──
      const now = new Date();
      const estimatedReadyAt = new Date(now.getTime() + preparationTimeMin * 60000);

      // ── Calculer ETA du livreur le plus proche vers le restaurant ──
      let etaMin = 10; // défaut si aucun livreur disponible
      try {
        const livreursDispo = await asService.entities.Livreur.filter({
          type_livreur: 'externe',
          validation: 'valide',
          actif: true,
          statut: 'disponible',
          country_code: commande.pays_code,
          bloque_encours: false,
          manual_hors_ligne: { $ne: true },
          admin_hors_ligne: { $ne: true },
        }, '-last_seen_at', 50).catch(() => []);

        if (livreursDispo && livreursDispo.length > 0 && etablissement.latitude && etablissement.longitude) {
          let minDist = null;
          for (const l of livreursDispo) {
            if (!l.latitude || !l.longitude) continue;
            const d = calculerDistance(etablissement.latitude, etablissement.longitude, l.latitude, l.longitude);
            if (d !== null && (minDist === null || d < minDist)) minDist = d;
          }
          if (minDist !== null) {
            // 25 km/h moyenne ville → 2.4 min/km, min 2, max 20
            etaMin = Math.min(20, Math.max(2, Math.round(minDist * 2.4)));
          }
        }
      } catch (e) {
        console.warn(`[changerStatutCommande] Erreur calcul ETA: ${e?.message}`);
      }

      // ── Marge configurable (default 2 min) ──
      let marginMin = 2;
      try {
        const marginConfig = await asService.entities.AppConfig.filter({ cle: 'RESTAURANT_DISPATCH_MARGIN_MIN' }).catch(() => []);
        if (marginConfig?.[0]?.valeur) marginMin = Number(marginConfig[0].valeur) || 2;
      } catch (_) {}

      // ── Calculer dispatch_at = estimated_ready_at - ETA - marge ──
      const dispatchAt = new Date(estimatedReadyAt.getTime() - (etaMin + marginMin) * 60000);

      // ── Créer la CourseExterne (en_attente — non visible par les livreurs) ──
      const trackingToken = generateToken();
      const pickupToken = generateToken();
      let deliveryToken = generateToken();
      while (deliveryToken === pickupToken) deliveryToken = generateToken();
      const pickupPIN = generatePIN();
      let deliveryPIN = generatePIN();
      while (deliveryPIN === pickupPIN) deliveryPIN = generatePIN();

      const appBaseUrl = Deno.env.get('VITE_BASE44_APP_BASE_URL') || '';
      const trackingLink = appBaseUrl ? `${appBaseUrl}/suivi-public/${trackingToken}` : '';

      const itemsSummary = (() => {
        try {
          const items = JSON.parse(commande.items || '[]');
          return items.map(i => `${i.nom} x${i.quantite}`).join(', ');
        } catch { return ''; }
      })();

      const course = await asService.entities.CourseExterne.create({
        country_code: commande.pays_code,
        source: 'client',
        type_course: 'expedier',
        client_nom: commande.client_nom,
        client_telephone: commande.client_telephone,
        expediteur_nom: etablissement.nom,
        expediteur_telephone: etablissement.telephone || '',
        destinataire_nom: commande.client_nom,
        destinataire_telephone: commande.client_telephone,
        destinataire_client_id: commande.client_id,
        recipient_has_app: true,
        adresse_depart: `${etablissement.quartier || ''} ${etablissement.ville || ''}`.trim() || etablissement.nom,
        adresse_arrivee: commande.adresse_livraison || commande.quartier_livraison || '',
        quartier_depart: etablissement.quartier || '',
        quartier_arrivee: commande.quartier_livraison || '',
        ville_depart: etablissement.ville || '',
        gps_depart_lat: etablissement.latitude || null,
        gps_depart_lng: etablissement.longitude || null,
        gps_arrivee_lat: commande.gps_lat || null,
        gps_arrivee_lng: commande.gps_lng || null,
        latitude_livraison: commande.gps_lat || null,
        longitude_livraison: commande.gps_lng || null,
        latitude_arrivee_livraison: commande.gps_lat || null,
        longitude_arrivee_livraison: commande.gps_lng || null,
        notes: `Commande restaurant #${commande_id.slice(-6)} - ${commande.client_nom} - ${(commande.total || 0).toLocaleString()} FCFA${itemsSummary ? ' - ' + itemsSummary : ''}`,
        prix_estimate: 0,
        devise: 'FCFA',
        statut: 'nouvelle',
        dispatch_status: 'en_attente',
        pricing_mode: 'manual',
        tracking_token: trackingToken,
        tracking_link: trackingLink,
        pickup_qr_token: pickupToken,
        pickup_code_4_digits: pickupPIN,
        delivery_qr_token: deliveryToken,
        delivery_code_4_digits: deliveryPIN,
        commande_restaurant_id: commande_id,
      });

      // Lier la course à la commande + stocker les timestamps
      await asService.entities.CommandeRestaurant.update(commande_id, {
        course_id: course.id,
        preparation_time_minutes: preparationTimeMin,
        estimated_ready_at: estimatedReadyAt.toISOString(),
        dispatch_at: dispatchAt.toISOString(),
      });

      console.log(`[changerStatutCommande] Course ${course.id} créée en en_attente pour commande ${commande_id} — dispatch_at=${dispatchAt.toISOString()}`);

      // ── Notifications ──
      await notifierClient(
        'Commande en préparation',
        `Votre commande chez ${etablissement.nom} est en préparation. Temps estimé : ${preparationTimeMin} min. Un livreur sera recherché automatiquement.`,
        'en_preparation', course.id
      );

      return Response.json({
        success: true,
        course_id: course.id,
        dispatch_at: dispatchAt.toISOString(),
        estimated_ready_at: estimatedReadyAt.toISOString(),
        message: 'Course créée en attente — dispatch programmé',
      });
    }

    // ── Cas spécial: prete_recuperation → créer course + dispatch ──────
    if (action === 'prete_recuperation') {
      // Anti-double-création de course
      if (commande.course_id) {
        console.log(`[changerStatutCommande]  Course déjà créée pour commande ${commande_id}: ${commande.course_id}`);
        // ── Course créée pendant la préparation (dispatch anticipé) ──
        // Si la course n'est pas encore dispatchée, déclencher le dispatch maintenant.
        const existingCourse = await asService.entities.CourseExterne.get(commande.course_id).catch(() => null);
        if (existingCourse && !['disponible_push', 'accepte', 'propose'].includes(existingCourse.dispatch_status)) {
          await asService.entities[commandeEntity].update(commande_id, { statut: 'prete_recuperation' });
          try {
            await base44.functions.invoke('dispatchExterneAuto', {
              action: 'lancer_recherche_auto',
              course_id: existingCourse.id,
            });
            console.log(`[changerStatutCommande]  Dispatch anticipé déclenché pour course ${existingCourse.id} (bouton Prête)`);
          } catch (err) {
            console.error(`[changerStatutCommande]  Erreur dispatch anticipé: ${err.message}`);
          }
          await notifierClient(
            'Commande prête — livraison en cours',
            `Votre commande chez ${etablissement.nom} est prête. Recherche d'un livreur en cours...`,
            'commande_prete', existingCourse.id
          );
          await notifierPartenaire(
            'Livraison déclenchée',
            `Recherche d'un livreur pour la commande de ${commande.client_nom}`,
            'livraison_declenchee'
          );
          return Response.json({ success: true, course_id: existingCourse.id, message: 'Dispatch déclenché — recherche livreur en cours' });
        }
        // Course déjà dispatchée ou assignée — juste mettre à jour le statut
        await asService.entities[commandeEntity].update(commande_id, { statut: 'prete_recuperation' });
        return Response.json({ success: true, message: 'Course déjà créée', course_id: commande.course_id, already_exists: true });
      }

      // Mettre à jour le statut
      await asService.entities[commandeEntity].update(commande_id, { statut: 'prete_recuperation' });

      // ── Créer la CourseExterne ──────────────────────────────────────
      const trackingToken = generateToken();
      const pickupToken = generateToken();
      let deliveryToken = generateToken();
      while (deliveryToken === pickupToken) deliveryToken = generateToken();
      const pickupPIN = generatePIN();
      let deliveryPIN = generatePIN();
      while (deliveryPIN === pickupPIN) deliveryPIN = generatePIN();

      const appBaseUrl = Deno.env.get('VITE_BASE44_APP_BASE_URL') || '';
      const trackingLink = appBaseUrl ? `${appBaseUrl}/suivi-public/${trackingToken}` : '';

      const itemsSummary = (() => {
        try {
          const items = JSON.parse(commande.items || '[]');
          return items.map(i => `${i.nom} x${i.quantite}`).join(', ');
        } catch { return ''; }
      })();

      const course = await asService.entities.CourseExterne.create({
        country_code: commande.pays_code,
        source: 'client',
        type_course: 'expedier',
        client_nom: commande.client_nom,
        client_telephone: commande.client_telephone,
        expediteur_nom: etablissement.nom,
        expediteur_telephone: etablissement.telephone || '',
        destinataire_nom: commande.client_nom,
        destinataire_telephone: commande.client_telephone,
        destinataire_client_id: commande.client_id,
        recipient_has_app: true,
        adresse_depart: `${etablissement.quartier || ''} ${etablissement.ville || ''}`.trim() || etablissement.nom,
        adresse_arrivee: commande.adresse_livraison || commande.quartier_livraison || '',
        quartier_depart: etablissement.quartier || '',
        quartier_arrivee: commande.quartier_livraison || '',
        ville_depart: etablissement.ville || '',
        gps_depart_lat: etablissement.latitude || null,
        gps_depart_lng: etablissement.longitude || null,
        gps_arrivee_lat: commande.gps_lat || null,
        gps_arrivee_lng: commande.gps_lng || null,
        latitude_livraison: commande.gps_lat || null,
        longitude_livraison: commande.gps_lng || null,
        latitude_arrivee_livraison: commande.gps_lat || null,
        longitude_arrivee_livraison: commande.gps_lng || null,
        notes: `Commande ${type} #${commande_id.slice(-6)} - ${commande.client_nom} - ${(commande.total || 0).toLocaleString()} FCFA${itemsSummary ? ' - ' + itemsSummary : ''}`,
        prix_estimate: 0,
        devise: 'FCFA',
        statut: 'nouvelle',
        dispatch_status: 'en_attente',
        pricing_mode: 'manual',
        tracking_token: trackingToken,
        tracking_link: trackingLink,
        pickup_qr_token: pickupToken,
        pickup_code_4_digits: pickupPIN,
        delivery_qr_token: deliveryToken,
        delivery_code_4_digits: deliveryPIN,
        commande_boutique_id: !isRestaurant ? commande_id : '',
        commande_restaurant_id: isRestaurant ? commande_id : '',
      });

      // Lier la course à la commande
      await asService.entities[commandeEntity].update(commande_id, { course_id: course.id });

      console.log(`[changerStatutCommande]  Course ${course.id} créée pour commande ${commande_id}`);

      // ── Lancer le dispatch SILGAPP existant ─────────────────────────
      try {
        await base44.functions.invoke('dispatchExterneAuto', {
          action: 'lancer_recherche_auto',
          course_id: course.id,
        });
        console.log(`[changerStatutCommande]  Dispatch lancé pour course ${course.id}`);
      } catch (err) {
        console.error(`[changerStatutCommande]  Erreur dispatch: ${err.message}`);
      }

      // ── Notifications push ────────────────────────────────────────────
      await notifierClient(
        'Commande prête — livraison en cours',
        `Votre commande chez ${etablissement.nom} est prête. Recherche d'un livreur en cours...`,
        'commande_prete', course.id
      );
      await notifierPartenaire(
        'Livraison déclenchée',
        `Recherche d'un livreur pour la commande de ${commande.client_nom}`,
        'livraison_declenchee'
      );

      return Response.json({ success: true, course_id: course.id, message: 'Livraison déclenchée — recherche livreur en cours' });
      }

    // ── Cas spécial: annulation → annuler aussi la course si elle existe ─
    if (action === 'annuler') {
      const motif = body.motif || 'Annulée par le partenaire';
      await asService.entities[commandeEntity].update(commande_id, {
        statut: 'annulee',
        motif_annulation: motif,
      });

      // Annuler la course liée si elle existe et n'est pas encore livrée
      if (commande.course_id) {
        try {
          const course = await asService.entities.CourseExterne.get(commande.course_id);
          if (course && !['livree', 'annulee'].includes(course.statut)) {
            await base44.functions.invoke('annulerCourseExterne', {
              course_id: commande.course_id,
              motif: `Commande annulée par le partenaire: ${motif}`,
              source: 'admin',
            });
            console.log(`[changerStatutCommande]  Course ${commande.course_id} annulée suite à annulation commande`);
          }
        } catch (err) {
          console.error(`[changerStatutCommande]  Erreur annulation course: ${err.message}`);
        }
      }

      await notifierClient(
        'Commande annulée',
        `Votre commande chez ${etablissement.nom} a été annulée. ${motif}`,
        'commande_annulee', commande.course_id || ''
      );
      return Response.json({ success: true, message: 'Commande annulée' });
    }

    // ── Cas spécial: refuser_paiement ────────────────────────────────────
    if (action === 'refuser_paiement') {
      await asService.entities[commandeEntity].update(commande_id, {
        statut: 'paiement_refuse',
        motif_annulation: 'Paiement refusé par le partenaire',
      });
      await notifierClient(
        'Paiement refusé',
        `Le paiement pour votre commande chez ${etablissement.nom} a été refusé. Contactez l'établissement.`,
        'paiement_refuse', ''
      );
      return Response.json({ success: true, message: 'Paiement refusé' });
    }

    // ── Actions simples (vérifier, valider, commencer) ──────────────────
    await asService.entities[commandeEntity].update(commande_id, { statut: transition.to });

    // ── Notifications selon l'action ───────────────────────────────────
    const NOTIFS = {
      verifier_paiement: { titre: 'Paiement en vérification', msg: `Le paiement de votre commande chez ${etablissement.nom} est en cours de vérification.`, type: 'paiement_verification' },
      valider_paiement: { titre: 'Paiement validé ', msg: `Le paiement de votre commande chez ${etablissement.nom} a été validé. Préparation en cours...`, type: 'paiement_valide' },
      commencer_preparation: { titre: 'Commande en préparation', msg: `Votre commande chez ${etablissement.nom} est en cours de préparation.`, type: 'en_preparation' },
    };
    if (NOTIFS[action]) {
      await notifierClient(NOTIFS[action].titre, NOTIFS[action].msg, NOTIFS[action].type, '');
    }

    console.log(`[changerStatutCommande]  Commande ${commande_id} → ${transition.to}`);

    return Response.json({ success: true, nouveau_statut: transition.to });
  } catch (error) {
    console.error('[changerStatutCommande] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});