import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Quartiers de référence (Ouagadougou + autres villes SILGAPP) ────────────
const QUARTIERS_REF = [
  { nom: "Ouaga 2000",       lat: 12.3230, lng: -1.5325, rayon_km: 2.0 },
  { nom: "Pissy",            lat: 12.3580, lng: -1.5780, rayon_km: 1.8 },
  { nom: "Gounghin",         lat: 12.3590, lng: -1.5250, rayon_km: 1.5 },
  { nom: "Patte d'Oie",      lat: 12.3720, lng: -1.5560, rayon_km: 1.5 },
  { nom: "Hamdalaye",        lat: 12.3800, lng: -1.5200, rayon_km: 1.5 },
  { nom: "Zone du Bois",     lat: 12.3660, lng: -1.5050, rayon_km: 1.5 },
  { nom: "Zogona",           lat: 12.3900, lng: -1.5320, rayon_km: 1.5 },
  { nom: "Dapoya",           lat: 12.3660, lng: -1.5280, rayon_km: 1.5 },
  { nom: "Ouaga centre",     lat: 12.3648, lng: -1.5355, rayon_km: 2.5 },
  { nom: "Cissin",           lat: 12.3480, lng: -1.5100, rayon_km: 1.5 },
  { nom: "Karpala",          lat: 12.3350, lng: -1.5280, rayon_km: 1.5 },
  { nom: "Tampouy",          lat: 12.3950, lng: -1.5500, rayon_km: 1.5 },
  { nom: "Wemtenga",         lat: 12.3800, lng: -1.5070, rayon_km: 1.5 },
  { nom: "Nagrin",           lat: 12.3700, lng: -1.4900, rayon_km: 1.5 },
  { nom: "Secteur 27",       lat: 12.3400, lng: -1.5580, rayon_km: 2.0 },
  { nom: "Nioko",            lat: 12.4100, lng: -1.5600, rayon_km: 1.8 },
  { nom: "Samandin",         lat: 12.3560, lng: -1.5460, rayon_km: 1.5 },
  { nom: "Koulouba",         lat: 12.3740, lng: -1.5430, rayon_km: 1.5 },
  { nom: "Saint-Léon",       lat: 12.3770, lng: -1.5310, rayon_km: 1.5 },
  { nom: "Larlé",            lat: 12.3630, lng: -1.4980, rayon_km: 1.5 },
];

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isRecentMin(dateStr, minutes) {
  if (!dateStr) return false;
  return (Date.now() - new Date(dateStr).getTime()) < minutes * 60 * 1000;
}

// ─── Score de priorité ───────────────────────────────────────────────────────
// Score = demande / max(livreurs_dispos, 0.5)
// 🟢 < 1.5 : faible | 🟡 1.5–3 : moyenne | 🟠 3–6 : forte | 🔴 > 6 : très forte
function calcScore(demande, livreursDispo) {
  return demande / Math.max(livreursDispo, 0.5);
}

function niveauFromScore(score) {
  if (score >= 6) return { niveau: "tres_forte", emoji: "🔴", label: "Très forte demande" };
  if (score >= 3) return { niveau: "forte",     emoji: "🟠", label: "Forte demande" };
  if (score >= 1.5) return { niveau: "moyenne", emoji: "🟡", label: "Demande moyenne" };
  return { niveau: "faible",                    emoji: "🟢", label: "Faible demande" };
}

// ─── Main ────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

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

    // ── Récupérer les données ────────────────────────────────────────────────
    const [courses, livreurs] = await Promise.all([
      base44.asServiceRole.entities.CourseExterne.filter(
        {}, "-created_date", 200
      ).catch(() => []),
      base44.asServiceRole.entities.Livreur.filter(
        { actif: true, type_livreur: "externe" }, "-updated_date", 500
      ).catch(() => []),
    ]);

    // Courses en attente créées dans les 2 dernières heures
    const coursesRecentes = courses.filter(c => {
      const enAttente = ["nouvelle", "recherche_livreur"].includes(c.statut);
      const recente = isRecentMin(c.created_date, 120);
      return enAttente && recente;
    });

    // Livreurs disponibles avec GPS récent (< 15 min)
    const livreursDispos = livreurs.filter(l => {
      const disponible = l.statut === "disponible";
      const gpsRecent = isRecentMin(l.derniere_position_date || l.last_seen_at, 15);
      const hasGPS = l.latitude && l.longitude;
      return disponible && gpsRecent && hasGPS;
    });

    // ── Analyse par quartier ─────────────────────────────────────────────────
    const zonesAnalyse = QUARTIERS_REF.map(zone => {
      // Courses dans ce quartier
      const coursesDansZone = coursesRecentes.filter(c => {
        if (!c.gps_depart_lat || !c.gps_depart_lng) {
          // Fallback : correspondance textuelle avec adresse_depart
          const adresse = (c.adresse_depart || "").toLowerCase();
          return adresse.includes(zone.nom.toLowerCase().split(" ")[0]);
        }
        const dist = haversineKm(c.gps_depart_lat, c.gps_depart_lng, zone.lat, zone.lng);
        return dist <= zone.rayon_km;
      });

      // Livreurs dans ce quartier
      const livreursDansZone = livreursDispos.filter(l => {
        const dist = haversineKm(l.latitude, l.longitude, zone.lat, zone.lng);
        return dist <= zone.rayon_km * 1.5; // Zone élargie pour les livreurs
      });

      // Temps moyen d'attente des courses dans la zone
      const tempsAttente = coursesDansZone
        .filter(c => c.created_date)
        .map(c => Math.round((Date.now() - new Date(c.created_date).getTime()) / 60000));
      const tempsAttenteMin = tempsAttente.length > 0
        ? Math.round(tempsAttente.reduce((a, b) => a + b, 0) / tempsAttente.length)
        : 0;

      const score = calcScore(coursesDansZone.length, livreursDansZone.length);
      const { niveau, emoji, label } = niveauFromScore(score);

      return {
        nom: zone.nom,
        lat: zone.lat,
        lng: zone.lng,
        rayon_km: zone.rayon_km,
        nb_courses: coursesDansZone.length,
        nb_livreurs: livreursDansZone.length,
        temps_attente_min: tempsAttenteMin,
        score: Math.round(score * 10) / 10,
        niveau,
        emoji,
        label,
      };
    });

    // ── Zones chaudes = forte ou très forte demande (au moins 1 course, livreurs < courses) ──
    const zonesChaudes = zonesAnalyse
      .filter(z => (z.niveau === "forte" || z.niveau === "tres_forte") && z.nb_courses >= 2)
      .sort((a, b) => b.score - a.score);

    // ── Toutes les zones avec au moins 1 cours (pour la carte) ──────────────
    const zonesToutesActives = zonesAnalyse
      .filter(z => z.nb_courses >= 1 || z.nb_livreurs >= 1)
      .sort((a, b) => b.score - a.score);

    // ── Créer les alertes pour les zones chaudes (éviter les doublons récents) ──
    const alertesCreees = [];

    for (const zone of zonesChaudes) {
      // Vérifier s'il n'existe pas déjà une alerte récente (< 45 min) pour cette zone
      const alertesExistantes = await base44.asServiceRole.entities.AlerteLivreur.filter(
        { actif: true }, "-created_date", 50
      ).catch(() => []);

      const dejaAlerte = alertesExistantes.some(a => {
        const recente = isRecentMin(a.created_date, 45);
        const memeZone = a.titre && a.titre.includes(zone.nom);
        return recente && memeZone;
      });

      if (!dejaAlerte) {
        const nbCourses = zone.nb_courses;
        const nbLivreurs = zone.nb_livreurs;
        const attenteStr = zone.temps_attente_min > 0 ? `\nTemps d'attente moyen : ${zone.temps_attente_min} min.` : "";

        const alerte = await base44.asServiceRole.entities.AlerteLivreur.create({
          titre: `🔥 Forte demande détectée à ${zone.nom}`,
          message: `${nbCourses} demande${nbCourses > 1 ? "s" : ""} de livraison en attente.\nSeulement ${nbLivreurs} livreur${nbLivreurs !== 1 ? "s" : ""} disponible${nbLivreurs !== 1 ? "s" : ""}.${attenteStr}\n\nRapprochez-vous de cette zone pour recevoir davantage de courses.`,
          niveau: zone.niveau === "tres_forte" ? "urgent" : "important",
          reseau: "externe",
          actif: true,
          delai_rappel_minutes: 30,
          cree_par: "moteur_zones_chaudes",
          nb_lectures: 0,
        }).catch(() => null);

        if (alerte) alertesCreees.push({ zone: zone.nom, alerte_id: alerte.id });
      }
    }

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      zones_analysees: zonesAnalyse.length,
      zones_chaudes: zonesChaudes.length,
      alertes_creees: alertesCreees.length,
      zones_chaudes_detail: zonesChaudes,
      toutes_zones_actives: zonesToutesActives,
      stats: {
        courses_en_attente: coursesRecentes.length,
        livreurs_disponibles: livreursDispos.length,
      },
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});