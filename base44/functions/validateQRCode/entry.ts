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

      // ── GPS OBLIGATOIRE — bloquer si coordonnées absentes ou invalides ──
      const latOk = latitude && !isNaN(Number(latitude)) && Number(latitude) !== 0;
      const lngOk = longitude && !isNaN(Number(longitude)) && Number(longitude) !== 0;
      if (!latOk || !lngOk) {
        return Response.json({ success: false, error: 'GPS requis pour valider cette étape — coordonnées manquantes' });
      }

      // ── PIN SECOURS 0000 (livraison uniquement) ──────────────────────
      const isBackupPin = !isPickup && method === 'manual_code' && value === '0000';
      
      // Vérifier la valeur (sauf PIN secours qui bypass)
      const isValid = isBackupPin || (method === 'qr' ? value === expectedQR : value === expectedPIN);
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

      // 🏛️ COURSE ADMIN : pas de calcul de prix automatique
      // Le prix est saisi par le livreur dans l'app après scan/PIN livraison.
      // Ne PAS mettre le livreur disponible — il doit d'abord saisir le montant.
      if (course.pricing_mode === "admin_manuel" || course.source === "admin") {
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          statut: 'livree',
          heure_livraison: now,
          latitude_livraison: latitude || null,
          longitude_livraison: longitude || null,
          delivery_confirmed_by: isBackupPin ? 'pin_secours' : method,
          delivery_confirmed_at: now,
          latitude_arrivee_livraison: latitude || null,
          longitude_arrivee_livraison: longitude || null,
          colis_livre_at: now,
          // PRIX NON CALCULÉ — saisi par le livreur côté app
        });

        return Response.json({
          success: true,
          message: 'Livraison confirmée — saisir le montant payé par le client',
          course: {
            statut: 'livree',
            heure_livraison: now,
            latitude_livraison: latitude || null,
            longitude_livraison: longitude || null,
          },
        });
      }

      const updateData = {
        statut: 'livree',
        heure_livraison: now,
        latitude_livraison: latitude || null,
        longitude_livraison: longitude || null,
        delivery_confirmed_by: isBackupPin ? 'pin_secours' : method,
        delivery_confirmed_at: now,
        latitude_arrivee_livraison: latitude || null,
        longitude_arrivee_livraison: longitude || null,
        colis_livre_at: now,
      };

      // ── Calcul prix final ──────────────────────────────────────────────────
      // Règle métier SILGAPP : prix basé sur distance GPS expéditeur → destinataire
      // (gps_depart → gps_arrivee de la course), jamais sur la distance livreur.
      // Distance réelle parcourue = GPS récupération → GPS livraison (pour stats).
      
      // ⚠️ CORRECTION PRIX MANUEL : Si la course utilise un prix manuel accepté,
      // ce montant devient le prix officiel. Ne JAMAIS recalculer.
      const isPrixManuel = course.pricing_mode === "manual" && course.manual_price_status === "accepted" && Number(course.manual_price) > 0;
      
      const latRecup = course.latitude_recuperation;
      const lngRecup = course.longitude_recuperation;
      const latLivr = latitude;
      const lngLivr = longitude;

      // Distance réelle livreur (pour stats uniquement)
      const distReelle = (latRecup && lngRecup && latLivr && lngLivr)
        ? haversine(latRecup, lngRecup, latLivr, lngLivr)
        : null;

      // Distance tarifaire = GPS départ course → GPS arrivée course (expéditeur → destinataire)
      const latDepart = course.gps_depart_lat;
      const lngDepart = course.gps_depart_lng;
      const latArrivee = course.gps_arrivee_lat;
      const lngArrivee = course.gps_arrivee_lng;

      const distTarifaire = (latDepart && lngDepart && latArrivee && lngArrivee)
        ? haversine(latDepart, lngDepart, latArrivee, lngArrivee)
        : null;

      // Récupérer le tarif du pays depuis la DB (pour mode automatique uniquement)
      const countryCode = course.country_code || "BF";
      let prixParKm = 100;
      let prixMinimumPays = 500;
      let commissionPct = 30;
      try {
        const countriesDB = await base44.asServiceRole.entities.Country.filter({ code: countryCode, actif: true });
        if (countriesDB?.[0]) {
          prixParKm    = countriesDB[0].prix_par_km    || 100;
          prixMinimumPays = countriesDB[0].prix_minimum || 500;
          commissionPct   = countriesDB[0].commission_pct || 30;
        }
      } catch (_) {}

      const PRIX_MINIMUM_GLOBAL = 1000;

      if (isPrixManuel) {
        // ── MODE PRIX MANUEL : utiliser le prix accepté par le client ──
        const prixFinal = Number(course.manual_price);
        const commission = Math.round(prixFinal * (commissionPct / 100));
        const montantLivreur = prixFinal - commission;
        
        updateData.prix_final = prixFinal;
        updateData.commission_silga = commission;
        updateData.montant_livreur = montantLivreur;
        
        // Distance réelle pour stats uniquement (pas pour le calcul du prix)
        if (distReelle != null) {
          updateData.distance_reelle_km = Math.max(Number(distReelle) || 0, 0.01);
        } else if (latDepart && lngDepart && latArrivee && lngArrivee) {
          const dist = haversine(latDepart, lngDepart, latArrivee, lngArrivee);
          updateData.distance_reelle_km = Math.max(Number(dist) || 0, 0.01);
        }
        
        updateData.latitude_arrivee_livraison = latitude;
        updateData.longitude_arrivee_livraison = longitude;
      } else if (latDepart && lngDepart && latArrivee && lngArrivee) {
        // ── MODE PRIX AUTOMATIQUE : calcul basé sur la distance ──
        const dist = haversine(latDepart, lngDepart, latArrivee, lngArrivee);
        const distArrondie = Math.max(Number(dist) || 0, 0.01);

        // Règle SILGAPP : ≤10km = 1000 F minimum, >10km = distance × 100 F (minimum 1000 F)
        let prixBrut = distArrondie * prixParKm;
        // Si distance ≤ 10km, appliquer le minimum de 1000 F
        if (distArrondie <= 10) {
          prixBrut = Math.max(prixBrut, PRIX_MINIMUM_GLOBAL);
        }
        const prixFinal = Math.max(Math.round(prixBrut), prixMinimumPays, PRIX_MINIMUM_GLOBAL);

        const commission = Math.round(prixFinal * (commissionPct / 100));
        const montantLivreur = prixFinal - commission;
        // distance_reelle_km = trajet réel livreur (stats), ou distance course si pas de GPS récup
        updateData.distance_reelle_km = distReelle != null ? Math.max(Number(distReelle) || 0, 0.01) : distArrondie;
        updateData.prix_final = prixFinal;
        updateData.commission_silga = commission;
        updateData.montant_livreur = montantLivreur;
        updateData.latitude_arrivee_livraison = latitude;
        updateData.longitude_arrivee_livraison = longitude;
      } else {
        // GPS course (départ/arrivée) manquants → appliquer le minimum SILGAPP
        updateData.prix_final = PRIX_MINIMUM_GLOBAL;
        updateData.commission_silga = Math.round(PRIX_MINIMUM_GLOBAL * 0.3);
        updateData.montant_livreur = PRIX_MINIMUM_GLOBAL - Math.round(PRIX_MINIMUM_GLOBAL * 0.3);
        if (distReelle != null) updateData.distance_reelle_km = Math.max(Number(distReelle) || 0, 0.01);
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

      // Construire la réponse sans relecture DB supplémentaire
      const courseFinale = { ...course, ...updateData, id: course_id };

      return Response.json({
        success: true,
        message: 'Livraison confirmée !',
        prix_final: courseFinale.prix_final || null,
        distance_km: courseFinale.distance_reelle_km || null,
        montant_livreur: courseFinale.montant_livreur || null,
        commission_silga: courseFinale.commission_silga || null,
        course: {
          // Champs financiers
          statut: 'livree',
          prix_final: courseFinale.prix_final || null,
          distance_reelle_km: courseFinale.distance_reelle_km || null,
          montant_livreur: courseFinale.montant_livreur || null,
          commission_silga: courseFinale.commission_silga || null,
          // Champs timestamps — nécessaires pour calcul durée dans LivraisonRecapitulatif
          heure_livraison: courseFinale.heure_livraison || null,
          heure_recuperation: courseFinale.heure_recuperation || null,
          heure_acceptation: courseFinale.heure_acceptation || null,
          colis_livre_at: courseFinale.colis_livre_at || null,
          // Champs GPS livraison
          latitude_livraison: courseFinale.latitude_livraison || null,
          longitude_livraison: courseFinale.longitude_livraison || null,
        },
      });
    }

    return Response.json({ error: 'Paramètres invalides' }, { status: 400 });
  } catch (error) {
    console.error('[validateQRCode]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});