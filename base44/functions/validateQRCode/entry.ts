import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { haversineKm } from '../../shared/geoUtils.ts';

function normalizeCommissionPct(value) {
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return pct;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { course_id, action, type, value, method, latitude, longitude } = body;

    if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });

    let course;
    try {
      course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
    } catch (_) {
      // get() lance une erreur si l'enregistrement n'existe pas → retourner 404, pas 500
      return Response.json({ error: 'Course non trouvée' }, { status: 404 });
    }
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
      if (!['pickup', 'delivery'].includes(type)) {
        return Response.json({ success: false, error: 'Type de validation invalide' });
      }

      const isPickup = type === 'pickup';
      const isPartnerCourse = !!(
        course.commande_boutique_id ||
        course.commande_restaurant_id ||
        course.pharmacie_id
      );
      const rawScannedValue = String(value ?? '').trim();
      const scannedValue = method === 'manual_code'
        ? rawScannedValue.normalize('NFKC').replace(/\D/g, '').slice(0, 4)
        : rawScannedValue;

      // Vérifier que les codes existent
      const expectedQR = isPickup ? course.pickup_qr_token : course.delivery_qr_token;
      const expectedPIN = isPickup ? course.pickup_code_4_digits : course.delivery_code_4_digits;
      const oppositeQR = isPickup ? course.delivery_qr_token : course.pickup_qr_token;
      const oppositePIN = isPickup ? course.delivery_code_4_digits : course.pickup_code_4_digits;

      if (!expectedQR || !expectedPIN) {
        return Response.json({ success: false, error: 'Codes non générés pour cette course' });
      }

      // Refuser explicitement les codes de l'autre etape.
      // Critique pour les commandes partenaires: le QR/PIN partenaire ne doit jamais livrer chez le client.
      if (method === 'qr' && oppositeQR && scannedValue === String(oppositeQR).trim()) {
        return Response.json({
          success: false,
          error: isPickup
            ? 'Code client detecte: utilisez le QR/PIN partenaire pour recuperer.'
            : 'Code partenaire detecte: utilisez le QR/PIN client pour livrer.',
          blocked_reason: 'wrong_step_code',
        });
      }
      const normalizedExpectedPIN = String(expectedPIN ?? '').normalize('NFKC').replace(/\D/g, '').slice(0, 4);
      const normalizedOppositePIN = String(oppositePIN ?? '').normalize('NFKC').replace(/\D/g, '').slice(0, 4);
      if (method === 'manual_code' && scannedValue.length !== 4) {
        return Response.json({ success: false, error: 'Le PIN doit contenir exactement 4 chiffres' });
      }
      if (method === 'manual_code' && normalizedOppositePIN && scannedValue === normalizedOppositePIN) {
        return Response.json({
          success: false,
          error: isPickup
            ? 'PIN client detecte: utilisez le PIN partenaire pour recuperer.'
            : 'PIN partenaire detecte: utilisez le PIN client pour livrer.',
          blocked_reason: 'wrong_step_pin',
        });
      }

      // Une commande partenaire ne peut pas etre livree avant validation de recuperation chez le partenaire.
      if (isPartnerCourse && !isPickup) {
        const pickupDone = !!course.pickup_confirmed_at || ['colis_recupere', 'en_livraison'].includes(course.statut);
        if (!pickupDone) {
          return Response.json({
            success: false,
            error: "Validez d'abord la recuperation chez le partenaire.",
            blocked_reason: 'partner_pickup_required',
          });
        }
      }

      // ── PIN SECOURS 0000 (livraison uniquement) ──────────────────────
      const isBackupPin = !isPickup && method === 'manual_code' && scannedValue === '0000';

      // Vérifier la valeur (sauf PIN secours qui bypass)
      const isValid = isBackupPin || (method === 'qr' ? scannedValue === String(expectedQR).trim() : scannedValue === normalizedExpectedPIN);
      if (!isValid) {
        return Response.json({ success: false, error: 'Code invalide' });
      }

      // Une réponse réseau peut être perdue après une validation réussie. Un nouvel essai
      // avec le même code doit confirmer l'état existant au lieu d'afficher un faux échec.
      const alreadyConfirmed = isPickup ? course.pickup_confirmed_at : course.delivery_confirmed_at;
      if (alreadyConfirmed) {
        return Response.json({
          success: true,
          already_confirmed: true,
          message: isPickup ? 'Récupération déjà confirmée.' : 'Livraison déjà confirmée.',
          course: {
            statut: course.statut,
            heure_recuperation: course.heure_recuperation || null,
            heure_livraison: course.heure_livraison || null,
            prix_final: course.prix_final || null,
            distance_reelle_km: course.distance_reelle_km || null,
            montant_livreur: course.montant_livreur || null,
            commission_silga: course.commission_silga || null,
          },
        });
      }

      // ── GPS optionnel : utiliser les coordonnées fournies ou fallback sur le GPS de destination ──
      // Le PIN code est la preuve de livraison. Le GPS est utilisé pour les stats uniquement.
      let gpsLat = (latitude != null && !isNaN(Number(latitude)) && Number(latitude) !== 0) ? Number(latitude) : null;
      let gpsLng = (longitude != null && !isNaN(Number(longitude)) && Number(longitude) !== 0) ? Number(longitude) : null;
      // Fallback : GPS de destination de la course (le livreur est censé être à l'adresse d'arrivée)
      if (gpsLat === null && course.gps_arrivee_lat) gpsLat = Number(course.gps_arrivee_lat);
      if (gpsLng === null && course.gps_arrivee_lng) gpsLng = Number(course.gps_arrivee_lng);
      if (gpsLat === null && course.latitude_recuperation) gpsLat = Number(course.latitude_recuperation);
      if (gpsLng === null && course.longitude_recuperation) gpsLng = Number(course.longitude_recuperation);

      // ── PICKUP validé ──
      if (isPickup) {
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          statut: 'colis_recupere',
          heure_recuperation: new Date().toISOString(),
          latitude_recuperation: gpsLat || null,
          longitude_recuperation: gpsLng || null,
          pickup_confirmed_by: method,
          pickup_confirmed_at: new Date().toISOString(),
        });
        return Response.json({
          success: true,
          message: isPartnerCourse ? 'Commande recuperee chez le partenaire.' : 'Colis recupere !',
          next_step: 'delivery_client',
          course: {
            statut: 'colis_recupere',
            prochaine_etape: isPartnerCourse ? 'scanner_qr_pin_client' : 'livraison',
          },
        });
      }

      // ── DELIVERY validé ──
      const now = new Date().toISOString();

      // COURSE ADMIN : pas de calcul de prix automatique
      // Le prix est saisi par le livreur dans l'app après scan/PIN livraison.
      // Ne PAS mettre le livreur disponible — il doit d'abord saisir le montant.
      if (course.pricing_mode === "admin_manuel" || course.source === "admin") {
        // ── Calculer la distance réelle pour les courses admin aussi ──
        // Privilégier la distance tarifaire (adresse) car le GPS livreur peut ne pas avoir bougé
        const latRecupAdmin = course.latitude_recuperation;
        const lngRecupAdmin = course.longitude_recuperation;
        let distAdmin = null;
        if (course.gps_depart_lat && course.gps_depart_lng && course.gps_arrivee_lat && course.gps_arrivee_lng) {
          distAdmin = haversineKm(course.gps_depart_lat, course.gps_depart_lng, course.gps_arrivee_lat, course.gps_arrivee_lng);
        } else if (latRecupAdmin && lngRecupAdmin && gpsLat && gpsLng) {
          distAdmin = haversineKm(latRecupAdmin, lngRecupAdmin, gpsLat, gpsLng);
        }

        // ── RÈGLE MÉTIER : prix_propose_admin est la source de vérité ──
        // Écrit atomiquement prix_final, commission_silga, montant_livreur
        // au moment de la validation de livraison. Aucun fallback frontend.
        const prixFinalAdmin = Number(course.prix_propose_admin) || 0;
        if (prixFinalAdmin <= 0) {
          return Response.json({
            success: false,
            error: 'prix_propose_admin manquant pour cette course admin — impossible de finaliser la livraison',
            blocked_reason: 'missing_admin_price',
          }, { status: 400 });
        }

        // Charger la commission du pays
        let adminCommissionPct = null;
        try {
          const countriesDB = await base44.asServiceRole.entities.Country.filter({ code: course.country_code, actif: true });
          if (countriesDB?.[0]) {
            adminCommissionPct = normalizeCommissionPct(countriesDB[0].commission_pct);
          }
        } catch (_) {}

        if (adminCommissionPct === null) {
          return Response.json({
            success: false,
            error: `Commission non configurée pour le pays ${course.country_code}`,
            blocked_reason: 'missing_country_commission_pct',
          }, { status: 400 });
        }

        const adminCommission = Math.round(prixFinalAdmin * (adminCommissionPct / 100));
        const adminMontantLivreur = prixFinalAdmin - adminCommission;

        const adminUpdateData = {
          statut: 'livree',
          heure_livraison: now,
          latitude_livraison: gpsLat || null,
          longitude_livraison: gpsLng || null,
          delivery_confirmed_by: isBackupPin ? 'pin_secours' : method,
          delivery_confirmed_at: now,
          latitude_arrivee_livraison: gpsLat || null,
          longitude_arrivee_livraison: gpsLng || null,
          colis_livre_at: now,
          prix_final: prixFinalAdmin,
          commission_silga: adminCommission,
          montant_livreur: adminMontantLivreur,
        };
        if (distAdmin != null) {
          adminUpdateData.distance_reelle_km = Math.max(Number(distAdmin) || 0, 0.01);
        }

        await base44.asServiceRole.entities.CourseExterne.update(course_id, adminUpdateData);

        return Response.json({
          success: true,
          message: 'Livraison confirmée',
          course: {
            statut: 'livree',
            heure_livraison: now,
            latitude_livraison: gpsLat || null,
            longitude_livraison: gpsLng || null,
            distance_reelle_km: adminUpdateData.distance_reelle_km || null,
            prix_final: prixFinalAdmin,
            commission_silga: adminCommission,
            montant_livreur: adminMontantLivreur,
          },
        });
      }

      const updateData = {
        statut: 'livree',
        heure_livraison: now,
        latitude_livraison: gpsLat || null,
        longitude_livraison: gpsLng || null,
        delivery_confirmed_by: isBackupPin ? 'pin_secours' : method,
        delivery_confirmed_at: now,
        latitude_arrivee_livraison: gpsLat || null,
        longitude_arrivee_livraison: gpsLng || null,
        colis_livre_at: now,
      };

      // ── Calcul prix final ──────────────────────────────────────────────────
      // Règle métier SILGAPP : prix basé sur distance GPS expéditeur → destinataire
      // (gps_depart → gps_arrivee de la course), jamais sur la distance livreur.
      // Distance réelle parcourue = GPS récupération → GPS livraison (pour stats).

      // CORRECTION PRIX MANUEL : Si la course utilise un prix manuel accepté,
      // ce montant devient le prix officiel. Ne JAMAIS recalculer.
      const isPrixManuel = course.pricing_mode === "manual" && course.manual_price_status === "accepted" && Number(course.manual_price) > 0;

      const latRecup = course.latitude_recuperation;
      const lngRecup = course.longitude_recuperation;
      const latLivr = gpsLat;
      const lngLivr = gpsLng;

      // Distance réelle livreur (pour stats uniquement)
      // Si le trajet livreur est < 0.1 km (GPS n'a pas bougé, ex: PIN secours),
      // on retombe sur la distance tarifaire (adresse départ → arrivée)
      let distReelle = (latRecup && lngRecup && latLivr && lngLivr)
        ? haversineKm(latRecup, lngRecup, latLivr, lngLivr)
        : null;
      if (distReelle !== null && distReelle < 0.1) {
        distReelle = null; // trop petit → fallback sur distTarifaire
      }

      // Distance tarifaire = GPS départ course → GPS arrivée course (expéditeur → destinataire)
      const latDepart = course.gps_depart_lat;
      const lngDepart = course.gps_depart_lng;
      const latArrivee = course.gps_arrivee_lat;
      const lngArrivee = course.gps_arrivee_lng;

      const distTarifaire = (latDepart && lngDepart && latArrivee && lngArrivee)
        ? haversineKm(latDepart, lngDepart, latArrivee, lngArrivee)
        : null;

      // Récupérer le tarif du pays depuis la DB (pour mode automatique uniquement)
      const countryCode = course.country_code;
      if (!countryCode) {
        console.error('[validateQRCode][COUNTRY_REQUIRED]', { course_id });
        return Response.json({
          success: false,
          error: 'COUNTRY_REQUIRED',
          message: "Impossible de déterminer le pays de cette course.",
          blocked_reason: 'missing_country_code',
        }, { status: 400 });
      }
      let prixParKm = 100;
      let prixMinimumPays = 500;
      let commissionPct = null;
      try {
        const countriesDB = await base44.asServiceRole.entities.Country.filter({ code: countryCode, actif: true });
        if (countriesDB?.[0]) {
          prixParKm = countriesDB[0].prix_par_km || 100;
          prixMinimumPays = countriesDB[0].prix_minimum || 500;
          commissionPct = normalizeCommissionPct(countriesDB[0].commission_pct);
        }
      } catch (_) {}

      if (commissionPct === null) {
        console.error('[validateQRCode][COMMISSION_CONFIG_MISSING]', { course_id, countryCode });
        return Response.json({
          success: false,
          error: `Commission pays non configurée pour ${countryCode}`,
          blocked_reason: 'missing_country_commission_pct',
        }, { status: 400 });
      }

      const PRIX_MINIMUM_GLOBAL = 1000;

      if (isPrixManuel) {
        // ── MODE PRIX MANUEL : utiliser le prix accepté par le client ──
        const prixFinal = Number(course.manual_price);
        const commission = Math.round(prixFinal * (commissionPct / 100));
        const montantLivreur = prixFinal - commission;

        updateData.prix_final = prixFinal;
        updateData.commission_silga = commission;
        updateData.montant_livreur = montantLivreur;

        // Distance réelle pour stats — privilégier distTarifaire (adresse) si distReelle indispo
        if (distTarifaire != null) {
          updateData.distance_reelle_km = Math.max(Number(distTarifaire) || 0, 0.01);
        } else if (distReelle != null) {
          updateData.distance_reelle_km = Math.max(Number(distReelle) || 0, 0.01);
        }

        updateData.latitude_arrivee_livraison = gpsLat || null;
        updateData.longitude_arrivee_livraison = gpsLng || null;
      } else if (latDepart && lngDepart && latArrivee && lngArrivee) {
        // ── MODE PRIX AUTOMATIQUE : calcul basé sur la distance ──
        const dist = haversineKm(latDepart, lngDepart, latArrivee, lngArrivee);
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
        // Privilégier distTarifaire (adresse) si distReelle trop petit ou null
        updateData.distance_reelle_km = distTarifaire != null ? Math.max(Number(distTarifaire) || 0, 0.01)
          : (distReelle != null ? Math.max(Number(distReelle) || 0, 0.01) : distArrondie);
        updateData.prix_final = prixFinal;
        updateData.commission_silga = commission;
        updateData.montant_livreur = montantLivreur;
        updateData.latitude_arrivee_livraison = gpsLat || null;
        updateData.longitude_arrivee_livraison = gpsLng || null;
      } else {
        // GPS course (départ/arrivée) manquants → appliquer le minimum SILGAPP
        updateData.prix_final = PRIX_MINIMUM_GLOBAL;
        updateData.commission_silga = Math.round(PRIX_MINIMUM_GLOBAL * (commissionPct / 100));
        updateData.montant_livreur = PRIX_MINIMUM_GLOBAL - updateData.commission_silga;
        if (distTarifaire != null) {
          updateData.distance_reelle_km = Math.max(Number(distTarifaire) || 0, 0.01);
        } else if (distReelle != null) {
          updateData.distance_reelle_km = Math.max(Number(distReelle) || 0, 0.01);
        }
      }

      await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);

      // Mettre à jour le livreur : courses_du_jour + statut
      // ⚠️ montant_du_silga est géré par verifierEncoursLivreur (source unique, idempotente)
      //    NE JAMAIS incrémenter montant_du_silga directement ici.
      if (course.livreur_id) {
        try {
          const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id);
          if (livreur) {
            const livreurUpdate = {
              statut: livreur.bloque_encours ? 'hors_ligne' : 'disponible',
              ...(livreur.bloque_encours ? { admin_hors_ligne: true } : {}),
              courses_du_jour: (Number(livreur.courses_du_jour) || 0) + 1,
            };
            await base44.asServiceRole.entities.Livreur.update(course.livreur_id, livreurUpdate);
          }
        } catch (livreurError) {
          // La course est déjà validée : ne jamais transformer ce succès en faux échec PIN.
          console.error('[validateQRCode][UPDATE_LIVREUR_AFTER_DELIVERY]', livreurError?.message || livreurError);
        }
      }

      try {
        await base44.functions.invoke('verifierEncoursLivreur', { course_id });
      } catch (encoursError) {
        console.error('[validateQRCode][verifierEncoursLivreur]', encoursError?.message || encoursError);
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