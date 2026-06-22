import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Quartiers de référence (Ouagadougou) ────────────────────────────────────
const QUARTIERS_REF = [
  { nom: "Ouaga 2000", lat: 12.3230, lng: -1.5325, rayon_km: 2.0 },
  { nom: "Pissy", lat: 12.3580, lng: -1.5780, rayon_km: 1.8 },
  { nom: "Gounghin", lat: 12.3590, lng: -1.5250, rayon_km: 1.5 },
  { nom: "Patte d'Oie", lat: 12.3720, lng: -1.5560, rayon_km: 1.5 },
  { nom: "Hamdalaye", lat: 12.3800, lng: -1.5200, rayon_km: 1.5 },
  { nom: "Zone du Bois", lat: 12.3660, lng: -1.5050, rayon_km: 1.5 },
  { nom: "Zogona", lat: 12.3900, lng: -1.5320, rayon_km: 1.5 },
  { nom: "Dapoya", lat: 12.3660, lng: -1.5280, rayon_km: 1.5 },
  { nom: "Ouaga centre", lat: 12.3648, lng: -1.5355, rayon_km: 2.5 },
  { nom: "Cissin", lat: 12.3480, lng: -1.5100, rayon_km: 1.5 },
  { nom: "Karpala", lat: 12.3350, lng: -1.5280, rayon_km: 1.5 },
  { nom: "Tampouy", lat: 12.3950, lng: -1.5500, rayon_km: 1.5 },
  { nom: "Wemtenga", lat: 12.3800, lng: -1.5070, rayon_km: 1.5 },
  { nom: "Nagrin", lat: 12.3700, lng: -1.4900, rayon_km: 1.5 },
  { nom: "Secteur 27", lat: 12.3400, lng: -1.5580, rayon_km: 2.0 },
  { nom: "Nioko", lat: 12.4100, lng: -1.5600, rayon_km: 1.8 },
  { nom: "Samandin", lat: 12.3560, lng: -1.5460, rayon_km: 1.5 },
  { nom: "Koulouba", lat: 12.3740, lng: -1.5430, rayon_km: 1.5 },
  { nom: "Saint-Léon", lat: 12.3770, lng: -1.5310, rayon_km: 1.5 },
  { nom: "Larlé", lat: 12.3630, lng: -1.4980, rayon_km: 1.5 },
];

// ─── Firebase FCM ─────────────────────────────────────────────────────────────
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function base64UrlEncode(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem) {
  const normalized = pem.replace(/\\n/g, '\n');
  const base64 = normalized.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwt(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iss: clientEmail, scope: FCM_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

async function getAccessToken(clientEmail, privateKey) {
  const assertion = await signJwt(clientEmail, privateKey);
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error_description || 'Unable to get Firebase access token');
  return result.access_token;
}

async function sendFcm(projectId, accessToken, fcmToken, titre, message) {
  const payload = {
    message: {
      token: fcmToken,
      notification: { title: titre, body: message },
      data: {
        type: 'zone_chaude',
        click_action: 'OPEN_SILGAPP',
      },
      android: {
        priority: 'HIGH',
        ttl: '3600s',
        notification: {
          channel_id: 'silgapp_default',
          sound: 'default',
          default_sound: true,
          default_vibrate_timings: true,
          notification_priority: 'PRIORITY_HIGH',
          visibility: 'PUBLIC',
          click_action: 'OPEN_SILGAPP',
        },
      },
    },
  };
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  return { ok: response.ok, status: response.status, result };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isRecentMin(dateStr, minutes) {
  if (!dateStr) return false;
  return (Date.now() - new Date(dateStr).getTime()) < minutes * 60 * 1000;
}

async function loadConfig(base44) {
  const defaults = {
    ZC_ACTIF: 'true', ZC_PUSH_ACTIF: 'true', ZC_INTERVALLE_MIN: '15',
    ZC_RAYON_KM: '3', ZC_MIN_COURSES: '3', ZC_MIN_LIVREURS: '1',
    ZC_SCORE_FAIBLE: '1.5', ZC_SCORE_MOYEN: '3', ZC_SCORE_ELEVE: '6', ZC_SCORE_TRES_ELEVE: '10',
    ZC_DELAI_MIN_ALERTES_MIN: '30', ZC_MAX_NOTIFS_HEURE: '2', ZC_DISTANCE_MAX_KM: '10',
  };
  const configs = await base44.asServiceRole.entities.AppConfig.filter({}).catch(() => []);
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const found = (configs || []).find(c => c.cle === key);
    if (found) result[key] = found.valeur;
  }
  return result;
}

function niveauFromScore(score, config) {
  const seuils = {
    tres_forte: parseFloat(config.ZC_SCORE_TRES_ELEVE) || 10,
    forte: parseFloat(config.ZC_SCORE_ELEVE) || 6,
    moyenne: parseFloat(config.ZC_SCORE_MOYEN) || 3,
    faible: parseFloat(config.ZC_SCORE_FAIBLE) || 1.5,
  };
  if (score >= seuils.tres_forte) return { niveau: "tres_forte", emoji: "", label: "Très forte demande" };
  if (score >= seuils.forte) return { niveau: "forte", emoji: "", label: "Forte demande" };
  if (score >= seuils.moyenne) return { niveau: "moyenne", emoji: "", label: "Demande moyenne" };
  return { niveau: "faible", emoji: "", label: "Faible demande" };
}

// ─── Main ────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = Date.now();
    const nowIso = new Date().toISOString();

    // Auth : automation ou admin
    let isAuthorized = false;
    try {
      const user = await base44.auth.me();
      if (user?.role === "admin") isAuthorized = true;
    } catch (_) {
      isAuthorized = true; // automation
    }
    if (!isAuthorized) {
      return Response.json({ error: "Accès refusé" }, { status: 403 });
    }

    // ── Charger la config ────────────────────────────────────────────────────
    const config = await loadConfig(base44);
    if (config.ZC_ACTIF !== 'true') {
      return Response.json({ success: true, message: "Zones chaudes désactivées via config administrateur", config_desactivee: true });
    }

    const rayonKm = parseFloat(config.ZC_RAYON_KM) || 3;
    const minCourses = parseInt(config.ZC_MIN_COURSES) || 3;
    const minLivreurs = parseInt(config.ZC_MIN_LIVREURS) || 1;
    const distanceMaxKm = parseFloat(config.ZC_DISTANCE_MAX_KM) || 10;
    const delaiMinAlertesMin = parseInt(config.ZC_DELAI_MIN_ALERTES_MIN) || 30;
    const maxNotifsHeure = parseInt(config.ZC_MAX_NOTIFS_HEURE) || 2;
    const pushActif = config.ZC_PUSH_ACTIF === 'true';

    // ── country_code depuis le body ──────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const countryCode = body.country_code || null;

    // ── Récupérer les données ────────────────────────────────────────────────
    const coursesFilter = countryCode ? { country_code: countryCode } : {};
    const livreursFilter = countryCode
      ? { actif: true, type_livreur: "externe", country_code: countryCode }
      : { actif: true, type_livreur: "externe" };

    const [courses, livreurs, paysData] = await Promise.all([
      base44.asServiceRole.entities.CourseExterne.filter(coursesFilter, "-created_date", 200).catch(() => []),
      base44.asServiceRole.entities.Livreur.filter(livreursFilter, "-updated_date", 500).catch(() => []),
      countryCode ? base44.asServiceRole.entities.Country.filter({ code: countryCode }).catch(() => []) : Promise.resolve([]),
    ]);

    // Courses en attente récentes (< 2h)
    const coursesRecentes = courses.filter(c => {
      return ["nouvelle", "recherche_livreur"].includes(c.statut) && isRecentMin(c.created_date, 120);
    });

    // Livreurs disponibles avec GPS récent (< 15 min)
    const livreursDispos = livreurs.filter(l => {
      return l.statut === "disponible" && isRecentMin(l.derniere_position_date || l.last_seen_at, 15) && l.latitude && l.longitude;
    });

    // ── Zones de référence ───────────────────────────────────────────────────
    let zonesRef = QUARTIERS_REF;
    const pays = paysData?.[0];
    if (pays?.latitude_centre && pays?.longitude_centre && countryCode && countryCode !== "BF") {
      const lat = pays.latitude_centre;
      const lng = pays.longitude_centre;
      const ville = pays.ville_principale || pays.nom || countryCode;
      zonesRef = [
        { nom: `${ville} Centre`, lat, lng, rayon_km: rayonKm * 1.0 },
        { nom: `${ville} Nord`, lat: lat + 0.05, lng, rayon_km: rayonKm * 0.67 },
        { nom: `${ville} Sud`, lat: lat - 0.05, lng, rayon_km: rayonKm * 0.67 },
        { nom: `${ville} Est`, lat, lng: lng + 0.05, rayon_km: rayonKm * 0.67 },
        { nom: `${ville} Ouest`, lat, lng: lng - 0.05, rayon_km: rayonKm * 0.67 },
        { nom: `${ville} Nord-Est`, lat: lat + 0.04, lng: lng + 0.04, rayon_km: rayonKm * 0.6 },
        { nom: `${ville} Sud-Ouest`,lat: lat - 0.04, lng: lng - 0.04, rayon_km: rayonKm * 0.6 },
        { nom: `${ville} Périphérie Nord`, lat: lat + 0.09, lng, rayon_km: rayonKm * 0.83 },
        { nom: `${ville} Périphérie Sud`, lat: lat - 0.09, lng, rayon_km: rayonKm * 0.83 },
      ];
    } else {
      // Appliquer le rayon configurable aux zones Ouaga
      zonesRef = QUARTIERS_REF.map(z => ({ ...z, rayon_km: rayonKm }));
    }

    // ── Analyse par quartier ─────────────────────────────────────────────────
    const zonesAnalyse = zonesRef.map(zone => {
      const coursesDansZone = coursesRecentes.filter(c => {
        if (!c.gps_depart_lat || !c.gps_depart_lng) {
          const adresse = (c.adresse_depart || "").toLowerCase();
          return adresse.includes(zone.nom.toLowerCase().split(" ")[0]);
        }
        return haversineKm(c.gps_depart_lat, c.gps_depart_lng, zone.lat, zone.lng) <= zone.rayon_km;
      });

      const livreursDansZone = livreursDispos.filter(l => {
        return haversineKm(l.latitude, l.longitude, zone.lat, zone.lng) <= zone.rayon_km * 1.5;
      });

      const tempsAttente = coursesDansZone.filter(c => c.created_date)
        .map(c => Math.round((now - new Date(c.created_date).getTime()) / 60000));
      const tempsAttenteMin = tempsAttente.length > 0 ? Math.round(tempsAttente.reduce((a, b) => a + b, 0) / tempsAttente.length) : 0;

      const score = coursesDansZone.length / Math.max(livreursDansZone.length, 0.5);
      const { niveau, emoji, label } = niveauFromScore(score, config);

      return {
        nom: zone.nom, lat: zone.lat, lng: zone.lng, rayon_km: zone.rayon_km,
        nb_courses: coursesDansZone.length, nb_livreurs: livreursDansZone.length,
        temps_attente_min: tempsAttenteMin, score: Math.round(score * 10) / 10,
        niveau, emoji, label,
      };
    });

    // ── Zones chaudes (forte ou très forte, au moins minCourses) ─────────────
    const zonesChaudes = zonesAnalyse
      .filter(z => (z.niveau === "forte" || z.niveau === "tres_forte") && z.nb_courses >= minCourses)
      .sort((a, b) => b.score - a.score);

    const zonesToutesActives = zonesAnalyse
      .filter(z => z.nb_courses >= 1 || z.nb_livreurs >= 1)
      .sort((a, b) => b.score - a.score);

    // ── Créer les alertes + envoyer les push + historique ────────────────────
    const alertesCreees = [];
    const pushesEnvoyes = [];
    const historiqueEntrees = [];

    // Initialiser Firebase si push actif
    let firebaseConfig = null;
    let accessToken = null;
    if (pushActif && zonesChaudes.length > 0) {
      try {
        const saJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
        if (saJson) {
          const sa = JSON.parse(saJson);
          firebaseConfig = { projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key };
        } else {
          firebaseConfig = {
            projectId: Deno.env.get('FIREBASE_PROJECT_ID'),
            clientEmail: Deno.env.get('FIREBASE_CLIENT_EMAIL'),
            privateKey: Deno.env.get('FIREBASE_PRIVATE_KEY'),
          };
        }
        if (firebaseConfig.projectId && firebaseConfig.clientEmail && firebaseConfig.privateKey) {
          accessToken = await getAccessToken(firebaseConfig.clientEmail, firebaseConfig.privateKey);
        }
      } catch (e) {
        console.error('[ZonesChaudes] Firebase init error:', e.message);
      }
    }

    // Récupérer tous les tokens FCM valides pour les livreurs
    let allTokens = [];
    if (accessToken) {
      allTokens = await base44.asServiceRole.entities.NotificationToken.filter({
        user_type: 'livreur', actif: true,
      }).catch(() => []);
    }

    for (const zone of zonesChaudes) {
      // 1. Vérifier doublon alerte récente (< 45 min) pour cette zone
      const alertesExistantes = await base44.asServiceRole.entities.AlerteLivreur.filter(
        { actif: true }, "-created_date", 50
      ).catch(() => []);

      const dejaAlerte = alertesExistantes.some(a =>
        isRecentMin(a.created_date, 45) && a.titre && a.titre.includes(zone.nom)
      );

      let alerteId = null;

      if (!dejaAlerte) {
        const nbCourses = zone.nb_courses;
        const nbLivreurs = zone.nb_livreurs;
        const attenteStr = zone.temps_attente_min > 0 ? `\nTemps d'attente moyen : ${zone.temps_attente_min} min.` : "";

        const alerte = await base44.asServiceRole.entities.AlerteLivreur.create({
          titre: ` Forte demande détectée à ${zone.nom}`,
          message: `${nbCourses} demande${nbCourses > 1 ? "s" : ""} de livraison en attente.\nSeulement ${nbLivreurs} livreur${nbLivreurs !== 1 ? "s" : ""} disponible${nbLivreurs !== 1 ? "s" : ""}.${attenteStr}\n\nRapprochez-vous de cette zone pour recevoir davantage de courses.`,
          niveau: zone.niveau === "tres_forte" ? "urgent" : "important",
          reseau: "externe",
          actif: true,
          delai_rappel_minutes: 30,
          cree_par: "moteur_zones_chaudes",
          nb_lectures: 0,
        }).catch(() => null);

        if (alerte) {
          alerteId = alerte.id;
          alertesCreees.push({ zone: zone.nom, alerte_id: alerte.id });
        }
      }

      // 2. Push FCM aux livreurs éligibles
      let notifsEnvoyees = 0;
      let notifsEchouees = 0;

      if (pushActif && accessToken && firebaseConfig) {
        // Livreurs éligibles pour cette zone
        const livreursEligibles = [];

        for (const livreur of livreurs) {
          // Filtres stricts
          if (!livreur.country_code && countryCode) continue; // skip si pas de country_code
          if (countryCode && livreur.country_code !== countryCode) continue; // pays différent
          if (livreur.statut !== "disponible") continue; // pas disponible
          if (livreur.actif !== true) continue; // inactif
          if (!isRecentMin(livreur.last_seen_at, 15)) continue; // heartbeat trop ancien
          if (!livreur.latitude || !livreur.longitude) continue; // pas de GPS
          if (!isRecentMin(livreur.derniere_position_date || livreur.last_seen_at, 15)) continue; // GPS trop ancien

          // Distance
          const dist = haversineKm(livreur.latitude, livreur.longitude, zone.lat, zone.lng);
          if (dist > distanceMaxKm) continue;

          // Token FCM valide
          const livreurTokens = allTokens.filter(t => t.livreur_id === livreur.id);
          if (livreurTokens.length === 0) continue;

          // Rate limiting : vérifier les notifications récentes de type zone_chaude
          try {
            const recentNotifs = await base44.asServiceRole.entities.Notification.filter({
              destinataire_email: livreur.user_email,
              type: 'zone_chaude',
            }, '-created_date', 50).catch(() => []);

            // Délai minimum entre alertes
            const derniereNotif = recentNotifs[0];
            if (derniereNotif && isRecentMin(derniereNotif.created_date, delaiMinAlertesMin)) continue;

            // Max par heure
            const notifsDerniereHeure = recentNotifs.filter(n => isRecentMin(n.created_date, 60));
            if (notifsDerniereHeure.length >= maxNotifsHeure) continue;
          } catch (_) {
            // Si la vérification échoue, on skip par sécurité
            continue;
          }

          livreursEligibles.push({ livreur, tokens: livreurTokens });
        }

        // Envoyer les push
        const message = ` ${zone.nb_courses} course${zone.nb_courses > 1 ? "s" : ""} disponible${zone.nb_courses > 1 ? "s" : ""} à ${zone.nom}. Déplacez-vous vers cette zone pour augmenter vos chances.`;
        const pushTitre = ` Zone très demandée`;

        for (const eligible of livreursEligibles) {
          for (const tokenItem of eligible.tokens) {
            const isNative = !String(tokenItem.token).startsWith('web_');
            if (!isNative) continue;

            try {
              const result = await sendFcm(firebaseConfig.projectId, accessToken, tokenItem.token, pushTitre, message);
              if (result.ok) {
                notifsEnvoyees++;
                // Créer notification en BDD
                await base44.asServiceRole.entities.Notification.create({
                  titre: pushTitre,
                  message,
                  type: 'zone_chaude',
                  destinataire_email: eligible.livreur.user_email,
                  lue: false,
                }).catch(() => null);

                // Mettre à jour le token
                await base44.asServiceRole.entities.NotificationToken.update(tokenItem.id, {
                  derniere_utilisation: nowIso,
                  derniere_notif_statut: 'success',
                  derniere_notif_titre: pushTitre,
                  derniere_notif_date: nowIso,
                }).catch(() => null);
              } else {
                notifsEchouees++;
                const errorCode = result.result?.error?.details?.[0]?.errorCode;
                if (['UNREGISTERED', 'INVALID_ARGUMENT'].includes(errorCode)) {
                  await base44.asServiceRole.entities.NotificationToken.update(tokenItem.id, {
                    actif: false,
                    derniere_notif_statut: 'failed',
                    fcm_error: JSON.stringify(result.result?.error || {}).slice(0, 300),
                  }).catch(() => null);
                }
              }
            } catch (_) {
              notifsEchouees++;
            }
          }
        }
      }

      pushesEnvoyes.push({ zone: zone.nom, envoyees: notifsEnvoyees, echouees: notifsEchouees });

      // 3. Sauvegarder historique
      const paysCode = countryCode || "BF";
      const villeNom = pays?.ville_principale || pays?.nom || "Ouagadougou";
      try {
        await base44.asServiceRole.entities.ZoneChaudeHistorique.create({
          country_code: paysCode,
          ville: villeNom,
          quartier: zone.nom,
          score: zone.score,
          niveau: zone.niveau,
          nb_courses: zone.nb_courses,
          nb_livreurs: zone.nb_livreurs,
          temps_attente_min: zone.temps_attente_min,
          rayon_km: zone.rayon_km,
          latitude: zone.lat,
          longitude: zone.lng,
          notifications_envoyees: notifsEnvoyees,
          notifications_echouees: notifsEchouees,
          message_envoye: pushActif ? ` Zone chaude ${zone.nom} — ${zone.nb_courses} courses, ${zone.nb_livreurs} livreurs` : "Push désactivé",
          alerte_livreur_id: alerteId,
          date_analyse: nowIso,
        });
      } catch (_) {}
    }

    console.log(`[ZonesChaudes] Analyse terminée — ${zonesChaudes.length} zones chaudes, ${alertesCreees.length} alertes créées, ${pushesEnvoyes.reduce((s, p) => s + p.envoyees, 0)} push envoyées`);

    return Response.json({
      success: true,
      timestamp: nowIso,
      config: {
        actif: config.ZC_ACTIF === 'true',
        push_actif: pushActif,
        rayon_km: rayonKm,
        min_courses: minCourses,
        distance_max_km: distanceMaxKm,
      },
      zones_analysees: zonesAnalyse.length,
      zones_chaudes: zonesChaudes.length,
      alertes_creees: alertesCreees.length,
      pushes_envoyes: pushesEnvoyes,
      zones_chaudes_detail: zonesChaudes,
      toutes_zones_actives: zonesToutesActives,
      stats: {
        courses_en_attente: coursesRecentes.length,
        livreurs_disponibles: livreursDispos.length,
      },
    });

  } catch (error) {
    console.error('[ZonesChaudes] Erreur:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
