import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { currentGpsFix, currentDriverGpsCity, gpsFixTime } from '../../shared/currentGpsCity.js';

/**
 * Heartbeat automatique - appelé toutes les 30s par les apps
 * Met à jour : last_seen, GPS, app_active, session
 * Vérifie la validité de la session unique (session_id)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const {
      user_type,
      latitude,
      longitude,
      accuracy,
      gps_timestamp,
      app_active = true,
      background_active = false,
      device_id,
      session_id, // NEW : ID de session unique
    } = payload;

    const now = new Date().toISOString();
    // ✅ Validation numérique complète — ne pas traiter 0,0 ou valeurs non-finies comme GPS valide
    const latNum = Number(latitude);
    const lngNum = Number(longitude);
    const hasGps = latitude != null && longitude != null && latitude !== '' && longitude !== '' && Number.isFinite(latNum) && Number.isFinite(lngNum) &&
      latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180;

    // --- VÉRIFICATION SESSION UNIQUE POUR LES LIVREURS ---
    if (user_type === "livreur" && session_id) {
      const livreurs = await base44.asServiceRole.entities.Livreur.filter({ user_email: user.email });
      if (livreurs && livreurs.length > 0) {
        const livreur = livreurs[0];
        if (livreur.session_active_id && livreur.session_active_id !== session_id) {
          console.log('[heartbeatAuto] Session livreur expirée', {
            livreur_id: livreur.id,
            session_attendue: livreur.session_active_id,
            session_recue: session_id,
          });
          return Response.json({
            success: false,
            error: 'session_expired',
            message: 'Vous avez été déconnecté car une autre session a été ouverte sur un autre appareil.',
            force_hors_ligne: true,
          }, { status: 409 });
        }
      }
    }

    // --- VÉRIFICATION SESSION UNIQUE POUR LES CLIENTS ---
    if (user_type === "client" && session_id) {
      const clients = await base44.asServiceRole.entities.ClientExterne.filter({ user_email: user.email });
      if (clients && clients.length > 0) {
        const client = clients[0];
        if (client.session_active_id && client.session_active_id !== session_id) {
          console.log('[heartbeatAuto] Session client expirée', {
            client_id: client.id,
            session_attendue: client.session_active_id,
            session_recue: session_id,
          });
          return Response.json({
            success: false,
            error: 'session_expired',
            message: 'Vous avez été déconnecté car une autre session a été ouverte sur un autre appareil.',
          }, { status: 409 });
        }
      }
    }

    // 1. Mettre à jour la session device
    if (device_id) {
      const sessions = await base44.asServiceRole.entities.DeviceSession.filter({
        user_email: user.email,
        device_id: device_id,
        session_actif: true
      });

      if (sessions && sessions.length > 0) {
        await base44.asServiceRole.entities.DeviceSession.update(sessions[0].id, {
          last_seen_at: now,
          app_active: app_active,
          derniere_position_lat: hasGps ? latitude : sessions[0].derniere_position_lat,
          derniere_position_lng: hasGps ? longitude : sessions[0].derniere_position_lng,
          derniere_sync_date: hasGps ? now : sessions[0].derniere_sync_date,
          gps_actif: hasGps,
        });
      }
    }

    // 2. Mettre à jour le profil (Client ou Livreur)
    if (user_type === "client") {
      const clients = await base44.asServiceRole.entities.ClientExterne.filter({ user_email: user.email });
      if (clients && clients.length > 0) {
        const client = clients[0];
        await base44.asServiceRole.entities.ClientExterne.update(client.id, {
          latitude: latitude || client.latitude,
          longitude: longitude || client.longitude,
          last_seen_at: now,
          app_active: app_active,
        });
      }
    } else if (user_type === "livreur") {
      const livreurs = await base44.asServiceRole.entities.Livreur.filter({ user_email: user.email });
      if (livreurs && livreurs.length > 0) {
        const livreur = livreurs[0];
        const updateData: Record<string, unknown> = {
          last_seen_at: now,
          app_active: app_active,
          background_active: background_active,
        };
        const receivedGps = latitude !== undefined || longitude !== undefined || gps_timestamp !== undefined;
        if (receivedGps && !hasGps) {
          updateData.gps_fix_valid = false;
          updateData.gps_fix_date = null;
          updateData.gps_operational_city = null;
        }

        // 📍 Ne mettre à jour le GPS que si des coordonnées valides sont reçues.
        // Cela garantit que derniere_position_date reflète le VRAI moment de réception GPS,
        // et non un heartbeat sans coordonnées (app en arrière-plan sans GPS).
        if (hasGps) {
          updateData.latitude = latNum;
          updateData.longitude = lngNum;
          updateData.derniere_position_date = now;
          if (accuracy !== undefined && accuracy !== null && Number.isFinite(Number(accuracy))) {
            updateData.gps_accuracy = Number(accuracy);
          }

          // Keep acquisition time distinct from heartbeat receipt time. A bad
          // new fix invalidates city eligibility rather than reusing old proof.
          const currentFixDriver = { ...livreur, latitude: latNum, longitude: lngNum,
            gps_accuracy: accuracy == null ? undefined : Number(accuracy),
            gps_fix_date: gps_timestamp, gps_fix_valid: true };
          const currentFix = currentGpsFix(currentFixDriver);
          updateData.gps_fix_valid = Boolean(currentFix);
          updateData.gps_fix_date = currentFix ? new Date(currentFix.time).toISOString() : null;
          updateData.gps_operational_city = null;
          if (currentFix) {
            try {
              const { loadOperationalCities } = await import('../../shared/operationalZones.ts');
              const { loadQuartiersForCountry } = await import('../../shared/cityResolution.ts');
              const cities = await loadOperationalCities(base44, livreur.country_code);
              if (cities.some((city: any) => city.actif === true)) {
                updateData.gps_operational_city = currentDriverGpsCity(currentFixDriver, cities,
                  await loadQuartiersForCountry(base44, livreur.country_code));
              }
            } catch (error: any) {
              console.error('[heartbeatAuto] GPS city unavailable:', error?.message || String(error));
            }
          }

          // [OPERATIONAL ZONES] Détection automatique de la zone opérationnelle du livreur.
          // Utilise shouldUpdateDriverOperationalCity qui encapsule toutes les règles :
          // - Pas de changement pendant une mission (statut = en_course)
          // - GPS avec précision > 100m ignoré
          // - Hystérésis anti-flicker (5km) aux limites de zones
          // - Utilise ville_operationnelle des quartiers (ex: Saaba → ouagadougou)
          // - Ne jamais effacer une ville existante par une position incertaine
          // Aucune API externe — utilise le cache des quartiers (TTL 10 min).
          try {
            const { isCityDispatchEnabled } = await import('../../shared/cityResolution.ts');
            const { shouldUpdateDriverOperationalCity } = await import('../../shared/operationalZones.ts');
            const cityEnabled = await isCityDispatchEnabled(base44, livreur.country_code);
            const fixTime = gpsFixTime(gps_timestamp);
            const fixAge = Date.now() - fixTime;
            // Only a timestamped fix can change the operational city. Old APKs keep their stored city.
            if (cityEnabled && Number.isFinite(fixAge) && fixAge >= 0 && fixAge <= 120000) {
              const accuracyVal = accuracy !== undefined && accuracy !== null ? Number(accuracy) : undefined;
              const cityUpdate = await shouldUpdateDriverOperationalCity(base44, livreur, latNum, lngNum, accuracyVal);
              if (cityUpdate.shouldUpdate && cityUpdate.newCity) {
                updateData.ville = cityUpdate.newCity;
                console.log('[heartbeatAuto] 🏙️ Ville livreur mise à jour', {
                  livreur_id: livreur.id,
                  ancienne_ville: livreur.ville || '(vide)',
                  nouvelle_ville: cityUpdate.newCity,
                  raison: cityUpdate.reason,
                });
              }

            }
          } catch (cityError: any) {
            // Non-bloquant : la détection de ville est une optimisation, pas une obligation.
            console.error('[heartbeatAuto] ⚠️ Operational zone resolution failed:', cityError?.message || String(cityError));
          }
        }

        // 🔄 Remontée automatique : si le livreur est hors_ligne (mais pas désactivé par admin,
        // ni mis hors ligne manuellement, ni en course), un heartbeat récent prouve qu'il est
        // actif → repasser en disponible. Le livreur reste en ligne tant qu'il ne se met pas
        // hors ligne lui-même manuellement.
        if (livreur.statut === 'hors_ligne' && livreur.admin_hors_ligne !== true && livreur.manual_hors_ligne !== true) {
          updateData.statut = 'disponible';
          console.log('[heartbeatAuto] 🔄 Remontée hors_ligne → disponible', {
            livreur_id: livreur.id,
            nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(),
          });
        }

        await base44.asServiceRole.entities.Livreur.update(livreur.id, updateData);

        // ── Alerte GPS stale : si le livreur est disponible mais n'envoie pas
        //    de GPS valide depuis >5 min, lui envoyer une push notification pour
        //    lui demander de rouvrir l'app. Évite les "ghost livreurs" visibles
        //    en admin mais invisibles au dispatch (GPS expiré). ──
        if (livreur.statut === 'disponible' && !hasGps && livreur.user_email) {
          const lastGpsDate = livreur.derniere_position_date || livreur.last_seen_at;
          if (lastGpsDate) {
            const gpsAgeMin = (Date.now() - new Date(lastGpsDate).getTime()) / 60000;
            if (gpsAgeMin >= 5 && gpsAgeMin < 60) {
              // Une seule alerte par 10 min (éviter le spam)
              const lastAlert = livreur.encours_alerte_at ? new Date(livreur.encours_alerte_at).getTime() : 0;
              if (Date.now() - lastAlert > 600000) {
                await base44.asServiceRole.entities.Livreur.update(livreur.id, {
                  encours_alerte_at: now,
                }).catch(() => null);
                base44.asServiceRole.functions.invoke('envoiNotificationPush', {
                  destinataire_email: livreur.user_email,
                  livreur_id: livreur.id,
                  titre: '📍 GPS indisponible',
                  message: 'Votre position GPS n\'est plus à jour. Rouvrez l\'application SILGAPP pour rester visible et recevoir des courses.',
                  type: 'livreur_hors_ligne',
                }).catch((err) => console.error('[heartbeatAuto] ❌ Push GPS alert:', err.message));
                console.log(`[heartbeatAuto] 📍 Alerte GPS stale envoyée à ${livreur.prenom || ''} ${livreur.nom || ''} (GPS: ${Math.round(gpsAgeMin)}min)`);
              }
            }
          }
        }
      }
    }

    return Response.json({
      success: true,
      timestamp: now,
      gps_sync: hasGps,
    });
  } catch (error) {
    console.error('[heartbeatAuto] Erreur:', error);
    return Response.json({ error: error instanceof Error ? error.message : 'heartbeat_failed' }, { status: 500 });
  }
});
