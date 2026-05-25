import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { course_id, action, code } = await req.json();

    if (!course_id || !action) {
      return Response.json({ error: 'course_id et action requis' }, { status: 400 });
    }

    const course = await base44.entities.CourseExterne.get(course_id);
    if (!course) {
      return Response.json({ error: 'Course non trouvée' }, { status: 404 });
    }

    // Générer codes QR et manuels
    if (action === 'generate_codes') {
      const pickupQrToken = crypto.randomUUID();
      const deliveryQrToken = crypto.randomUUID();
      const pickupCode4 = Math.floor(1000 + Math.random() * 9000).toString();
      const deliveryCode4 = Math.floor(1000 + Math.random() * 9000).toString();

      await base44.entities.CourseExterne.update(course_id, {
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

    // Valider récupération par QR
    if (action === 'validate_pickup_qr') {
      const { qr_token, livreur_id, latitude, longitude } = await req.json();
      
      if (!qr_token || qr_token !== course.pickup_qr_token) {
        return Response.json({ 
          error: 'Code QR invalide pour cette course',
          valid: false 
        }, { status: 400 });
      }

      // Vérifier si déjà utilisé
      if (course.pickup_confirmed_at) {
        return Response.json({ 
          error: 'Ce code QR a déjà été utilisé',
          valid: false 
        }, { status: 400 });
      }

      // Valider récupération
      await base44.entities.CourseExterne.update(course_id, {
        statut: 'en_livraison',
        heure_recuperation: new Date().toISOString(),
        latitude_recuperation: latitude || null,
        longitude_recuperation: longitude || null,
        pickup_confirmed_by: 'qr',
        pickup_confirmed_at: new Date().toISOString(),
      });

      return Response.json({ 
        success: true, 
        message: 'Colis récupéré confirmé',
        validated_by: 'qr'
      });
    }

    // Valider récupération par code manuel
    if (action === 'validate_pickup_manual') {
      const { code_4_digits, livreur_id, latitude, longitude } = await req.json();
      
      if (!code_4_digits || code_4_digits !== course.pickup_code_4_digits) {
        return Response.json({ 
          error: 'Code à 4 chiffres invalide',
          valid: false 
        }, { status: 400 });
      }

      // Vérifier si déjà utilisé
      if (course.pickup_confirmed_at) {
        return Response.json({ 
          error: 'Ce code a déjà été utilisé',
          valid: false 
        }, { status: 400 });
      }

      // Valider récupération
      await base44.entities.CourseExterne.update(course_id, {
        statut: 'en_livraison',
        heure_recuperation: new Date().toISOString(),
        latitude_recuperation: latitude || null,
        longitude_recuperation: longitude || null,
        pickup_confirmed_by: 'manual_code',
        pickup_confirmed_at: new Date().toISOString(),
      });

      return Response.json({ 
        success: true, 
        message: 'Colis récupéré confirmé',
        validated_by: 'manual_code'
      });
    }

    // Valider livraison par QR
    if (action === 'validate_delivery_qr') {
      const { qr_token, livreur_id, latitude, longitude } = await req.json();
      
      if (!qr_token || qr_token !== course.delivery_qr_token) {
        return Response.json({ 
          error: 'Code QR invalide pour cette course',
          valid: false 
        }, { status: 400 });
      }

      // Vérifier si déjà utilisé
      if (course.delivery_confirmed_at) {
        return Response.json({ 
          error: 'Ce code QR a déjà été utilisé',
          valid: false 
        }, { status: 400 });
      }

      // Valider livraison
      const livraisonData = {
        statut: 'livree',
        heure_livraison: new Date().toISOString(),
        latitude_livraison: latitude || null,
        longitude_livraison: longitude || null,
        delivery_confirmed_by: 'qr',
        delivery_confirmed_at: new Date().toISOString(),
      };

      // Calcul distance réelle si GPS disponible
      if (course.latitude_recuperation && latitude && course.longitude_recuperation && longitude) {
        const R = 6371;
        const dLat = ((latitude - course.latitude_recuperation) * Math.PI) / 180;
        const dLon = ((longitude - course.longitude_recuperation) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((course.latitude_recuperation * Math.PI) / 180) *
          Math.cos((latitude * Math.PI) / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distanceReelle = R * c;
        livraisonData.distance_reelle_km = distanceReelle;
        livraisonData.prix_final = Math.round(distanceReelle * 100);
        livraisonData.commission_silga = Math.round(livraisonData.prix_final * 0.3);
        livraisonData.montant_livreur = livraisonData.prix_final - livraisonData.commission_silga;
      }

      await base44.entities.CourseExterne.update(course_id, livraisonData);

      return Response.json({ 
        success: true, 
        message: 'Livraison confirmée',
        validated_by: 'qr',
        prix_final: livraisonData.prix_final
      });
    }

    // Valider livraison par code manuel
    if (action === 'validate_delivery_manual') {
      const { code_4_digits, livreur_id, latitude, longitude } = await req.json();
      
      if (!code_4_digits || code_4_digits !== course.delivery_code_4_digits) {
        return Response.json({ 
          error: 'Code à 4 chiffres invalide',
          valid: false 
        }, { status: 400 });
      }

      // Vérifier si déjà utilisé
      if (course.delivery_confirmed_at) {
        return Response.json({ 
          error: 'Ce code a déjà été utilisé',
          valid: false 
        }, { status: 400 });
      }

      // Valider livraison
      const livraisonData = {
        statut: 'livree',
        heure_livraison: new Date().toISOString(),
        latitude_livraison: latitude || null,
        longitude_livraison: longitude || null,
        delivery_confirmed_by: 'manual_code',
        delivery_confirmed_at: new Date().toISOString(),
      };

      // Calcul distance réelle si GPS disponible
      if (course.latitude_recuperation && latitude && course.longitude_recuperation && longitude) {
        const R = 6371;
        const dLat = ((latitude - course.latitude_recuperation) * Math.PI) / 180;
        const dLon = ((longitude - course.longitude_recuperation) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((course.latitude_recuperation * Math.PI) / 180) *
          Math.cos((latitude * Math.PI) / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distanceReelle = R * c;
        livraisonData.distance_reelle_km = distanceReelle;
        livraisonData.prix_final = Math.round(distanceReelle * 100);
        livraisonData.commission_silga = Math.round(livraisonData.prix_final * 0.3);
        livraisonData.montant_livreur = livraisonData.prix_final - livraisonData.commission_silga;
      }

      await base44.entities.CourseExterne.update(course_id, livraisonData);

      return Response.json({ 
        success: true, 
        message: 'Livraison confirmée',
        validated_by: 'manual_code',
        prix_final: livraisonData.prix_final
      });
    }

    return Response.json({ error: 'Action non reconnue' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});