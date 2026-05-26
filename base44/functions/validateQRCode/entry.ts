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
      const updateData = {
        statut: 'livree',
        heure_livraison: new Date().toISOString(),
        latitude_livraison: latitude || null,
        longitude_livraison: longitude || null,
        delivery_confirmed_by: method,
        delivery_confirmed_at: new Date().toISOString(),
      };

      // Calcul prix final si GPS disponible
      if (course.latitude_recuperation && course.longitude_recuperation && latitude && longitude) {
        const dist = haversine(course.latitude_recuperation, course.longitude_recuperation, latitude, longitude);
        const distSafe = Number(dist || 0);
        const prixFinal = Math.round(distSafe * 100);
        const commission = Math.round(prixFinal * 0.3);
        updateData.distance_reelle_km = distSafe;
        updateData.prix_final = prixFinal;
        updateData.commission_silga = commission;
        updateData.montant_livreur = prixFinal - commission;
      }

      await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);

      // Mettre à jour montant_du_silga du livreur
      if (course.livreur_id && updateData.commission_silga) {
        const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id);
        if (livreur) {
          await base44.asServiceRole.entities.Livreur.update(course.livreur_id, {
            statut: 'disponible',
            montant_du_silga: (Number(livreur.montant_du_silga) || 0) + updateData.commission_silga,
          });
        }
      }

      return Response.json({
        success: true,
        message: 'Livraison confirmée !',
        prix_final: updateData.prix_final || null,
        distance_km: updateData.distance_reelle_km || null,
        course: { statut: 'livree', prix_final: updateData.prix_final },
      });
    }

    return Response.json({ error: 'Paramètres invalides' }, { status: 400 });
  } catch (error) {
    console.error('[validateQRCode]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});