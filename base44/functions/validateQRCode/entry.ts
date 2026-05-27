import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { course_id, action, type, value, method, latitude, longitude } = body;

    if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });

    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
    if (!course) return Response.json({ error: 'Course non trouvée' }, { status: 404 });

    // ── Génération manuelle (legacy / admin) ────────────────────────────────
    if (action === 'generate_codes') {
      const pickupQrToken = crypto.randomUUID().replace(/-/g, '');
      const deliveryQrToken = crypto.randomUUID().replace(/-/g, '');
      const pickupCode4 = String(Math.floor(1000 + Math.random() * 9000));
      const deliveryCode4 = String(Math.floor(1000 + Math.random() * 9000));

      await base44.asServiceRole.entities.CourseExterne.update(course_id, {
        pickup_qr_token: pickupQrToken,
        pickup_code_4_digits: pickupCode4,
        delivery_qr_token: deliveryQrToken,
        delivery_code_4_digits: deliveryCode4,
      });

      return Response.json({
        pickup_qr_token: pickupQrToken,
        pickup_code_4_digits: pickupCode4,
        delivery_qr_token: deliveryQrToken,
        delivery_code_4_digits: deliveryCode4,
      });
    }

    // ── Validation unifiée (nouveau système QRScannerModal) ─────────────────
    // Appelée avec : { course_id, type: "pickup"|"delivery", value, method: "qr"|"manual_code" }
    if (type && value && method) {
      const isPickup = type === 'pickup';

      // Vérifier que les codes existent
      const expectedQR = isPickup ? course.pickup_qr_token : course.delivery_qr_token;
      const expectedPIN = isPickup ? course.pickup_code_4_digits : course.delivery_code_4_digits;

      if (!expectedQR || !expectedPIN) {
        return Response.json({ success: false, error: 'Codes non générés pour cette course' });
      }

      // Vérifier si déjà confirmé
      const alreadyConfirmed = isPickup ? course.pickup_confirmed_at : course.delivery_confirmed_at;
      if (alreadyConfirmed) {
        return Response.json({ success: false, error: 'Ce code a déjà été utilisé' });
      }

      // Vérifier la valeur
      const isValid = method === 'qr' ? value === expectedQR : value === expectedPIN;
      if (!isValid) {
        return Response.json({ success: false, error: 'Code invalide' });
      }

      // ── PICKUP validé ──
      if (isPickup) {
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          statut: 'colis_recupere',
          heure_recuperation: new Date().toISOString(),
          latitude_recuperation: latitude || null,
          longitude_recuperation: longitude || null,
          pickup_confirmed_by: method,
          pickup_confirmed_at: new Date().toISOString(),
        });
        return Response.json({ success: true, message: 'Colis récupéré !', course: { statut: 'colis_recupere' } });
      }

      // ── DELIVERY validé ──
      const now = new Date().toISOString();
      const updateData = {
        statut: 'livree',
        heure_livraison: now,
        latitude_livraison: latitude || null,
        longitude_livraison: longitude || null,
        delivery_confirmed_by: method,
        delivery_confirmed_at: now,
        // Sauvegarder aussi dans les champs standards de suivi
        latitude_arrivee_livraison: latitude || null,
        longitude_arrivee_livraison: longitude || null,
        colis_livre_at: now,
      };

      // Calcul prix final — cascade de fallbacks GPS
      const latRecup = course.latitude_recuperation || course.gps_depart_lat;
      const lngRecup = course.longitude_recuperation || course.gps_depart_lng;
      // Priorité : GPS livreur au moment livraison, puis GPS fixe arrivée, puis GPS destinataire
      const latLivr = latitude || course.gps_arrivee_lat || course.latitude_arrivee_livraison;
      const lngLivr = longitude || course.gps_arrivee_lng || course.longitude_arrivee_livraison;

      if (latRecup && lngRecup && latLivr && lngLivr) {
        const dist = haversine(latRecup, lngRecup, latLivr, lngLivr);
        const distSafe = Math.max(Number(dist || 0), 0.5); // minimum 0.5 km → 50 F
        const prixFinal = Math.round(distSafe * 100);
        const commission = Math.round(prixFinal * 0.3);
        const montantLivreur = prixFinal - commission;
        updateData.distance_reelle_km = distSafe;
        updateData.prix_final = prixFinal;
        updateData.commission_silga = commission;
        updateData.montant_livreur = montantLivreur;
        // Sauvegarder la destination finale GPS
        if (latitude && longitude) {
          updateData.gps_arrivee_lat = latitude;
          updateData.gps_arrivee_lng = longitude;
          updateData.latitude_arrivee_livraison = latitude;
          updateData.longitude_arrivee_livraison = longitude;
        }
      } else if (course.prix_estimate && course.prix_estimate > 0) {
        // Dernier recours : utiliser le prix estimé si aucun GPS disponible
        const prixFinal = course.prix_estimate;
        const distEstimee = prixFinal / 100;
        const commission = Math.round(prixFinal * 0.3);
        const montantLivreur = prixFinal - commission;
        updateData.distance_reelle_km = distEstimee;
        updateData.prix_final = prixFinal;
        updateData.commission_silga = commission;
        updateData.montant_livreur = montantLivreur;
      }

      await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);

      // Mettre à jour le livreur : montant_du_silga + courses_du_jour + statut
      if (course.livreur_id) {
        const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id);
        if (livreur) {
          const livreurUpdate = {
            statut: 'disponible',
          };
          if (updateData.commission_silga) {
            livreurUpdate.montant_du_silga = (Number(livreur.montant_du_silga) || 0) + updateData.commission_silga;
          }
          // Incrémenter courses_du_jour
          livreurUpdate.courses_du_jour = (Number(livreur.courses_du_jour) || 0) + 1;
          await base44.asServiceRole.entities.Livreur.update(course.livreur_id, livreurUpdate);
        }
      }

      return Response.json({
        success: true,
        message: 'Livraison confirmée !',
        prix_final: updateData.prix_final || null,
        distance_km: updateData.distance_reelle_km || null,
        montant_livreur: updateData.montant_livreur || null,
        commission_silga: updateData.commission_silga || null,
        course: {
          statut: 'livree',
          prix_final: updateData.prix_final || null,
          distance_reelle_km: updateData.distance_reelle_km || null,
          montant_livreur: updateData.montant_livreur || null,
          commission_silga: updateData.commission_silga || null,
        },
      });
    }

    return Response.json({ error: 'Paramètres invalides' }, { status: 400 });
  } catch (error) {
    console.error('[validateQRCode]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});