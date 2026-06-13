import React, { useEffect, useRef, useState } from "react";
import { Loader2, Globe } from "lucide-react";
import HeatmapLayer from "./HeatmapLayer";
import HeatmapControls from "./HeatmapControls";
import HeatmapLegend from "./HeatmapLegend";
import CountrySelector from "@/components/international/CountrySelector";
import { useZonesChaudesHalos } from "./ZonesChaudes";
import { GPS_DISPATCH_SEUIL_MIN } from "@/lib/dispatchRules";

/**
 * DispatchMap — Carte dédiée au dispatch temps réel
 *
 * Code couleur Livreurs :
 *  🟢 Vert   = Livreur libre (disponible + ON + GPS présent)
 *  🟠 Orange = Livreur en course (mission active + ON + GPS présent)
 *  ⚫ Noir   = Inactif / non dispatchable (OFF, GPS expiré, non validé)
 *
 * Code couleur Clients :
 *  🔵 Bleu   = Client actif (GPS < 5 min)
 *  🟡 Jaune  = Client récent (GPS entre 5 et 15 min)
 *  ⚫ Noir   = Client inactif (GPS > 15 min ou GPS absent)
 *
 * 🔴 Rouge = Course en attente (aucun livreur assigné)
 *
 * Filtres :
 *  - showClients     : afficher/masquer les clients
 *  - showLivreurs    : afficher/masquer les livreurs
 *  - masquerInactifs : masquer les marqueurs noirs (inactifs)
 */

const GPS_CLIENT_ACTIF_SEUIL_MIN = 5;
const GPS_CLIENT_RECENT_SEUIL_MIN = 15;

/**
 * NOUVELLE RÈGLE : Disponibilité métier uniquement
 * 
 * 🟢 VERT = Libre (disponible + ON + validé + GPS)
 * 🟠 ORANGE = En course (course active réelle)
 * ⚫ NOIR = Hors ligne / non dispatchable
 * 
 * ⚠️ IMPORTANT :
 * - GPS ancien N'EXCLUT PAS (reste vert)
 * - Heartbeat ancien N'EXCLUT PAS (reste vert)
 * - App fermée N'EXCLUT PAS (reste vert, recevra WhatsApp)
 * 
 * Un livreur vert signifie : "Disponible pour travailler et peut recevoir une course (SILGAPP ou WhatsApp)"
 */
function isLivreurNoir(livreur, livreurIdsEnCourseReelle) {
  if (!livreur.latitude || !livreur.longitude) return true;
  if (livreur.statut === "hors_ligne") return true;
  if (livreur.actif === false) return true;
  if (livreur.validation !== "valide") return true;
  // 🎯 En course = avec course ACTIVE (peu importe le statut DB)
  if (livreurIdsEnCourseReelle?.has(livreur.id)) return false;
  // Disponible avec GPS = vert (même si GPS/heartbeat ancien)
  if (livreur.statut === "disponible") return false;
  return true;
}

function getClientStatut(client) {
  if (!client.latitude || !client.longitude) return "inactif";
  const dt = client.last_seen_at;
  if (!dt) return "inactif";
  const minutes = (Date.now() - new Date(dt).getTime()) / 60000;
  if (minutes < GPS_CLIENT_ACTIF_SEUIL_MIN) return "actif";
  if (minutes < GPS_CLIENT_RECENT_SEUIL_MIN) return "recent";
  return "inactif";
}

function isClientActif(client) {
  return getClientStatut(client) === "actif";
}

function isClientRecent(client) {
  return getClientStatut(client) === "recent";
}

function isClientNoir(client) {
  return getClientStatut(client) === "inactif";
}

function getLastGPSMin(entity) {
  const dt = entity.derniere_position_date || entity.last_seen_at;
  if (!dt) return null;
  return Math.round((Date.now() - new Date(dt).getTime()) / 60000);
}

/**
 * Ajoute un léger offset aléatoire pour éviter le chevauchement des marqueurs
 * Offset max: ~5 mètres (0.000045 degrés)
 */
function addMarkerOffset(lat, lng, index) {
  const offset = (Math.sin(index * 1.5) * 0.000045);
  return [lat + offset, lng + offset];
}

function buildStyles() {
  return `
    /* ─── Livreur LIBRE (🟢 vert) ─── */
    .dmap-livreur-libre .dmap-ring {
      background: rgba(22, 163, 74, 0.3);
      animation: dmap-pulse-vert 2s ease-out infinite;
    }
    .dmap-livreur-libre .dmap-body {
      border-color: #16a34a;
      box-shadow: 0 2px 10px rgba(22, 163, 74, 0.4);
    }
    .dmap-livreur-libre .dmap-avatar-bg {
      background: linear-gradient(135deg, #16a34a 0%, #059669 100%);
    }

    /* ─── Livreur EN COURSE (🟠 orange) ─── */
    .dmap-livreur-course .dmap-ring {
      background: rgba(234, 88, 12, 0.3);
      animation: dmap-pulse-orange 2s ease-out infinite;
    }
    .dmap-livreur-course .dmap-body {
      border-color: #ea580c;
      box-shadow: 0 2px 10px rgba(234, 88, 12, 0.4);
    }
    .dmap-livreur-course .dmap-avatar-bg {
      background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
    }

    /* ─── Livreur NOIR (⚫ hors ligne) ─── */
    .dmap-livreur-noir .dmap-ring {
      background: rgba(0, 0, 0, 0.3);
    }
    .dmap-livreur-noir .dmap-body {
      border-color: #000000;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }
    .dmap-livreur-noir .dmap-avatar-bg {
      background: linear-gradient(135deg, #000000 0%, #1f2937 100%);
    }
    .dmap-livreur-container.dmap-inactif-marker {
      opacity: 0.85;
    }

    /* ─── Client ACTIF (🔵 bleu) ─── */
    .dmap-client-actif .dmap-client-ring {
      background: rgba(37, 99, 235, 0.25);
      animation: dmap-pulse-bleu 2s ease-out infinite;
    }
    .dmap-client-actif .dmap-client-dot {
      background: #2563eb;
      border-color: white;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.45);
    }

    /* ─── Client RÉCENT (🟡 jaune/orange) ─── */
    .dmap-client-recent .dmap-client-ring {
      background: rgba(234, 179, 8, 0.25);
      animation: dmap-pulse-jaune 2s ease-out infinite;
    }
    .dmap-client-recent .dmap-client-dot {
      background: #eab308;
      border-color: white;
      box-shadow: 0 2px 8px rgba(234, 179, 8, 0.45);
    }

    /* ─── Client INACTIF (⚫ noir) ─── */
    .dmap-client-inactif .dmap-client-ring {
      background: rgba(0, 0, 0, 0.3);
    }
    .dmap-client-inactif .dmap-client-dot {
      background: #000000;
      border-color: white;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    }
    .dmap-client-container.dmap-inactif-marker {
      opacity: 0.85;
    }

    /* ─── Course en attente (🔴 rouge) ─── */
    .dmap-course-wrapper {
      position: relative;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .dmap-course-ring {
      position: absolute;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(220, 38, 38, 0.3);
      animation: dmap-pulse-rouge 1.5s ease-out infinite;
    }
    .dmap-course-pin {
      width: 26px;
      height: 26px;
      background: #dc2626;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 2px 10px rgba(220, 38, 38, 0.5);
      position: relative;
      z-index: 1;
    }
    .dmap-course-container {
      cursor: pointer;
      transition: filter 0.2s ease;
    }
    .dmap-course-container:hover {
      filter: brightness(1.15);
      z-index: 9999 !important;
    }

    /* ─── Animations ─── */
    @keyframes dmap-pulse-vert {
      0%   { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(1.6); opacity: 0; }
    }
    @keyframes dmap-pulse-orange {
      0%   { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(1.6); opacity: 0; }
    }
    @keyframes dmap-pulse-bleu {
      0%   { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(1.6); opacity: 0; }
    }
    @keyframes dmap-pulse-jaune {
      0%   { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(1.6); opacity: 0; }
    }
    @keyframes dmap-pulse-rouge {
      0%   { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(1.8); opacity: 0; }
    }

    /* ─── Structure commune livreur ─── */
    .dmap-livreur-wrapper {
      position: relative;
      width: 52px;
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .dmap-ring {
      position: absolute;
      width: 52px;
      height: 52px;
      border-radius: 50%;
    }
    .dmap-body {
      width: 42px;
      height: 42px;
      background: white;
      border-radius: 50%;
      border: 3px solid;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      z-index: 1;
    }
    .dmap-photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .dmap-avatar-bg {
      width: 100%;
      height: 100%;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 16px;
    }

    /* ─── Structure client ─── */
    .dmap-client-wrapper {
      position: relative;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .dmap-client-ring {
      position: absolute;
      width: 44px;
      height: 44px;
      border-radius: 50%;
    }
    .dmap-client-dot {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 3px solid;
      position: relative;
      z-index: 1;
    }

    /* ─── Containers Leaflet ─── */
    .dmap-livreur-container,
    .dmap-client-container {
      transition: filter 0.2s ease;
      cursor: pointer;
    }
    .dmap-livreur-container:hover,
    .dmap-client-container:hover {
      filter: brightness(1.1);
      z-index: 9999 !important;
    }

    /* ─── Zoom controls ─── */
    .leaflet-control-zoom { border: none !important; }
    .leaflet-control-zoom-in,
    .leaflet-control-zoom-out {
      background: white !important;
      color: #1a1a1a !important;
      border: 1px solid #e5e5e5 !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
      border-radius: 8px !important;
      font-weight: 600 !important;
      width: 36px !important;
      height: 36px !important;
      line-height: 36px !important;
      font-size: 20px !important;
      transition: all 0.2s !important;
    }

    /* ─── Badge légende en overlay ─── */
    .dmap-overlay-badge {
      background: rgba(255,255,255,0.95);
      backdrop-filter: blur(8px);
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 8px 14px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.1);
    }
  `;
}

function buildLivreurIcon(livreur, livreurIdsEnCourseReelle) {
  const estNoir = isLivreurNoir(livreur, livreurIdsEnCourseReelle);
  const estEnCourse = livreurIdsEnCourseReelle?.has(livreur.id);
  // VERT = pas noir ET pas en course
  const cssClass = estNoir ? "dmap-livreur-noir" : (estEnCourse ? "dmap-livreur-course" : "dmap-livreur-libre");
  const initial = livreur.nom?.charAt(0)?.toUpperCase() || "L";
  const photoHtml = livreur.photo_url
    ? `<img src="${livreur.photo_url}" alt="" class="dmap-photo" />`
    : `<div class="dmap-avatar-bg">${initial}</div>`;

  return window.L.divIcon({
    html: `
      <div class="dmap-livreur-wrapper ${cssClass}">
        <div class="dmap-ring"></div>
        <div class="dmap-body">${photoHtml}</div>
      </div>
    `,
    className: `dmap-livreur-container${estNoir ? " dmap-inactif-marker" : ""}`,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
  });
}

function buildClientIcon(client) {
  const statut = getClientStatut(client);
  const cssClass = statut === "actif" ? "dmap-client-actif"
    : statut === "recent" ? "dmap-client-recent"
    : "dmap-client-inactif";
  return window.L.divIcon({
    html: `
      <div class="dmap-client-wrapper ${cssClass}">
        <div class="dmap-client-ring"></div>
        <div class="dmap-client-dot"></div>
      </div>
    `,
    className: `dmap-client-container${statut === "inactif" ? " dmap-inactif-marker" : ""}`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function buildLivreurPopup(livreur, livreurIdsEnCourseReelle) {
  const estNoir = isLivreurNoir(livreur, livreurIdsEnCourseReelle);
  const estEnCourse = livreurIdsEnCourseReelle?.has(livreur.id);
  const statutLabel = estNoir
    ? "⚫ Hors ligne — non dispatchable"
    : estEnCourse ? "🟠 En course" : "🟢 Libre — disponible";
  const gpsMin = getLastGPSMin(livreur);
  const gpsStr = gpsMin === null ? "?" : gpsMin < 1 ? "à l'instant" : `${gpsMin} min`;
  const statutColor = estNoir ? "#374151" : (estEnCourse ? "#ea580c" : "#16a34a");
  
  // Qualité GPS
  let gpsQuality = "";
  if (gpsMin !== null) {
    if (gpsMin < 2) gpsQuality = "❤️ Excellent";
    else if (gpsMin < 5) gpsQuality = "💚 Bon";
    else if (gpsMin < 15) gpsQuality = "🧡 Moyen";
    else if (gpsMin < 30) gpsQuality = "❤️‍🩹 Faible";
    else gpsQuality = "❤️‍🔥 Expiré";
  }
  
  return `
    <div style="min-width:210px;font-family:sans-serif;padding:4px 0">
      <p style="font-weight:700;font-size:14px;margin:0 0 4px 0;color:#1a1a1a">${livreur.prenom || ""} ${livreur.nom || ""}</p>
      <p style="font-size:12px;margin:2px 0;color:${statutColor}">${statutLabel}</p>
      ${livreur.telephone ? `<p style="font-size:12px;margin:2px 0;color:#444">📞 ${livreur.telephone}</p>` : ""}
      <p style="font-size:12px;margin:2px 0;color:#6b7280">📍 GPS il y a ${gpsStr}</p>
      ${gpsQuality ? `<p style="font-size:11px;margin:2px 0;color:#999">Qualité: ${gpsQuality}</p>` : ""}
      ${livreur.vehicule ? `<p style="font-size:12px;margin:2px 0;color:#888">🏍 ${livreur.vehicule}</p>` : ""}
      ${livreur.validation !== "valide" ? `<p style="font-size:11px;margin:2px 0;color:#f59e0b">⚠️ Validation: ${livreur.validation || "en attente"}</p>` : ""}
    </div>
  `;
}

function getRaisonInactif(livreur) {
  const raisons = [];
  if (livreur.statut === "hors_ligne") raisons.push("hors ligne");
  if (livreur.validation !== "valide") raisons.push("non validé");
  if (!livreur.actif) raisons.push("bloqué");
  const dt = livreur.last_seen_at || livreur.derniere_position_date;
  if (dt) {
    const min = Math.round((Date.now() - new Date(dt).getTime()) / 60000);
    if (min > GPS_DISPATCH_SEUIL_MIN) raisons.push(`GPS expiré ${min} min`);
  }
  if (!livreur.latitude || !livreur.longitude) raisons.push("pas de GPS");
  return raisons.length > 0 ? `(${raisons.join(", ")})` : "";
}

function buildCourseIcon() {
  return window.L.divIcon({
    html: `
      <div class="dmap-course-wrapper">
        <div class="dmap-course-ring"></div>
        <div class="dmap-course-pin"></div>
      </div>
    `,
    className: "dmap-course-container",
    iconSize: [44, 44],
    iconAnchor: [13, 26],
  });
}

function buildCoursePopup(course) {
  const age = course.created_date
    ? Math.round((Date.now() - new Date(course.created_date).getTime()) / 60000)
    : null;
  const ageStr = age === null ? "" : age < 1 ? "à l'instant" : `il y a ${age} min`;
  return `
    <div style="min-width:210px;font-family:sans-serif;padding:4px 0">
      <p style="font-weight:700;font-size:14px;margin:0 0 4px 0;color:#dc2626">🔴 Course en attente</p>
      ${course.client_nom ? `<p style="font-size:12px;margin:2px 0;color:#444">👤 ${course.client_nom}</p>` : ""}
      ${course.client_telephone ? `<p style="font-size:12px;margin:2px 0;color:#444">📞 ${course.client_telephone}</p>` : ""}
      ${course.adresse_depart ? `<p style="font-size:12px;margin:2px 0;color:#444">📍 Départ : ${course.adresse_depart}</p>` : ""}
      ${course.adresse_arrivee ? `<p style="font-size:12px;margin:2px 0;color:#888">🏁 Arrivée : ${course.adresse_arrivee}</p>` : ""}
      ${ageStr ? `<p style="font-size:11px;margin:4px 0 0 0;color:#dc2626;font-weight:600">⏱ Créée ${ageStr}</p>` : ""}
    </div>
  `;
}

function buildClientPopup(client) {
  const statut = getClientStatut(client);
  const gpsMin = getLastGPSMin(client);
  const gpsStr = gpsMin === null ? "?" : gpsMin < 1 ? "à l'instant" : `${gpsMin} min`;
  
  const statutLabels = {
    actif: "🔵 Client actif — GPS récent",
    recent: "🟡 Client récent — GPS > 5 min",
    inactif: "⚫ Hors ligne — non dispatchable",
  };
  
  const statutColors = {
    actif: "#2563eb",
    recent: "#eab308",
    inactif: "#374151",
  };
  
  // Qualité GPS
  let gpsQuality = "";
  if (gpsMin !== null) {
    if (gpsMin < 2) gpsQuality = "❤️ Excellent";
    else if (gpsMin < 5) gpsQuality = "💚 Bon";
    else if (gpsMin < 15) gpsQuality = "🧡 Moyen";
    else if (gpsMin < 30) gpsQuality = "❤️‍🩹 Faible";
    else gpsQuality = "❤️‍🔥 Expiré";
  }
  
  return `
    <div style="min-width:210px;font-family:sans-serif;padding:4px 0">
      <p style="font-weight:700;font-size:14px;margin:0 0 4px 0;color:#1a1a1a">${client.prenom || ""} ${client.nom || ""}</p>
      <p style="font-size:12px;margin:2px 0;color:${statutColors[statut]}">${statutLabels[statut]}</p>
      ${client.telephone ? `<p style="font-size:12px;margin:2px 0;color:#444">📞 ${client.telephone}</p>` : ""}
      <p style="font-size:12px;margin:2px 0;color:#6b7280">📍 GPS il y a ${gpsStr}</p>
      ${gpsQuality ? `<p style="font-size:11px;margin:2px 0;color:#999">Qualité: ${gpsQuality}</p>` : ""}
      ${client.quartier ? `<p style="font-size:12px;margin:2px 0;color:#888">📌 ${client.quartier}</p>` : ""}
    </div>
  `;
}

export default function DispatchMap({
  position,
  livreurs = [],
  clients = [],
  courses = [],
  onMarkerClick,
  showHeatmap = false,
  heatmapMode = "off", // "off" | "demande" | "couverture" | "opportunite"
  countryCode = "",
  onCountryChange,
  zonesChaudesData = [], // zones pour les halos colorés
  masquerInactifs = false, // prop contrôlée depuis le parent
  showClients = true, // filtre : afficher les clients
  showLivreurs = true, // filtre : afficher les livreurs
  livreurIdsEnCourseReelle = new Set(), // 🎯 IDs des livreurs avec course active réelle
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [heatmapModeLocal, setHeatmapModeLocal] = useState(heatmapMode);
  const [showHeatmapHint, setShowHeatmapHint] = useState(true);

  // Recentrer la carte quand le pays change
  useEffect(() => {
    if (!mapInstanceRef.current || !position || !position.latitude || !position.longitude) return;
    mapInstanceRef.current.setView([position.latitude, position.longitude], position.zoom ?? 12);
  }, [position?.latitude, position?.longitude]);

  // Init carte
  useEffect(() => {
    if (!mapRef.current || !position || !position.latitude || !position.longitude) return;

    const inject = () => {
      console.log("[DispatchMap] Injection carte...");
      
      if (!document.getElementById("dmap-styles")) {
        const s = document.createElement("style");
        s.id = "dmap-styles";
        s.textContent = buildStyles();
        document.head.appendChild(s);
      }

      if (!window.L) {
        console.error("[DispatchMap] window.L non disponible après chargement script");
        return;
      }

      console.log("[DispatchMap] window.L disponible:", !!window.L);

      try {
        const map = window.L.map(mapRef.current, {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: true,
          doubleClickZoom: true,
          dragging: true,
          keyboard: false,
        }).setView([position.latitude, position.longitude], position.zoom ?? 12);

        window.L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
          { maxZoom: 19, subdomains: "abcd" }
        ).addTo(map);

        window.L.control.zoom({ position: "bottomright" }).addTo(map);

        mapInstanceRef.current = map;
        setMapLoaded(true);
        console.log("[DispatchMap] Carte initialisée avec succès");
      } catch (error) {
        console.error("[DispatchMap] Erreur initialisation carte:", error);
      }
    };

    if (!window.L) {
      console.log("[DispatchMap] Chargement Leaflet...");
      
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.onerror = () => console.error("[DispatchMap] Erreur chargement CSS Leaflet");
      document.head.appendChild(link);

      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => {
        console.log("[DispatchMap] Script Leaflet chargé");
        inject();
      };
      script.onerror = () => console.error("[DispatchMap] Erreur chargement script Leaflet");
      document.head.appendChild(script);
    } else {
      console.log("[DispatchMap] Leaflet déjà chargé");
      inject();
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersRef.current = [];
    };
  }, [position?.latitude, position?.longitude]);

  // Halos zones chaudes
  useZonesChaudesHalos(mapInstanceRef.current, mapLoaded, zonesChaudesData);

  // Heatmap layer - géré directement par le composant HeatmapLayer
  // Pas besoin d'effet séparé, le composant HeatmapLayer gère son propre cycle de vie

  // Mise à jour des marqueurs
  useEffect(() => {
    if (!mapInstanceRef.current || !mapLoaded) return;
    const map = mapInstanceRef.current;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // 🔴 Courses en attente (toujours affichées)
    let markerIndex = 0;
    courses.forEach(course => {
      const lat = course.gps_depart_lat;
      const lng = course.gps_depart_lng;
      if (!lat || !lng) return;
      const icon = buildCourseIcon();
      const [latOff, lngOff] = addMarkerOffset(lat, lng, markerIndex++);
      const marker = window.L.marker([latOff, lngOff], { icon, zIndexOffset: 1500 }).addTo(map);
      marker.bindPopup(buildCoursePopup(course), { maxWidth: 260 });
      if (onMarkerClick) marker.on("click", () => onMarkerClick({ ...course, _type: "course" }));
      markersRef.current.push(marker);
    });

    // 🟢🟠⚫ Livreurs (filtrés par showLivreurs)
    if (showLivreurs) {
      // Livreurs NOIRS (hors ligne) — zIndex bas
      livreurs.forEach(livreur => {
        if (!livreur.latitude || !livreur.longitude) return;
        const estNoir = isLivreurNoir(livreur, livreurIdsEnCourseReelle);
        if (!estNoir) return;
        if (masquerInactifs) return; // filtre visuel
        const icon = buildLivreurIcon(livreur, livreurIdsEnCourseReelle);
        const [lat, lng] = addMarkerOffset(livreur.latitude, livreur.longitude, markerIndex++);
        const marker = window.L.marker([lat, lng], {
          icon,
          zIndexOffset: 100,
        }).addTo(map);
        marker.bindPopup(buildLivreurPopup(livreur, livreurIdsEnCourseReelle), { maxWidth: 260 });
        if (onMarkerClick) marker.on("click", () => onMarkerClick(livreur));
        markersRef.current.push(marker);
      });

      // Livreurs actifs (VERT/ORANGE)
      livreurs.forEach(livreur => {
        if (!livreur.latitude || !livreur.longitude) return;
        const estNoir = isLivreurNoir(livreur, livreurIdsEnCourseReelle);
        if (estNoir) return;
        const icon = buildLivreurIcon(livreur, livreurIdsEnCourseReelle);
        const [lat, lng] = addMarkerOffset(livreur.latitude, livreur.longitude, markerIndex++);
        // 🎯 CORRECTION : zIndex basé sur course active réelle
        const estEnCourse = livreurIdsEnCourseReelle?.has(livreur.id);
        const marker = window.L.marker([lat, lng], {
          icon,
          zIndexOffset: estEnCourse ? 1100 : 1200,
        }).addTo(map);
        marker.bindPopup(buildLivreurPopup(livreur, livreurIdsEnCourseReelle), { maxWidth: 260 });
        if (onMarkerClick) marker.on("click", () => onMarkerClick(livreur));
        markersRef.current.push(marker);
      });
    }

    // 🔵🟡⚫ Clients (filtrés par showClients)
    if (showClients) {
      // Clients INACTIFS (NOIRS) — zIndex bas
      clients.forEach(client => {
        if (!client.latitude || !client.longitude) return;
        const statut = getClientStatut(client);
        if (statut !== "inactif") return;
        if (masquerInactifs) return; // filtre visuel
        const icon = buildClientIcon(client);
        const [lat, lng] = addMarkerOffset(client.latitude, client.longitude, markerIndex++);
        const marker = window.L.marker([lat, lng], {
          icon,
          zIndexOffset: 50,
        }).addTo(map);
        marker.bindPopup(buildClientPopup(client), { maxWidth: 260 });
        if (onMarkerClick) marker.on("click", () => onMarkerClick(client));
        markersRef.current.push(marker);
      });

      // Clients ACTIFS et RÉCENTS (BLEUS/JAUNES) — zIndex haut
      clients.forEach(client => {
        if (!client.latitude || !client.longitude) return;
        const statut = getClientStatut(client);
        if (statut === "inactif") return;
        const icon = buildClientIcon(client);
        const [lat, lng] = addMarkerOffset(client.latitude, client.longitude, markerIndex++);
        const marker = window.L.marker([lat, lng], {
          icon,
          zIndexOffset: 900,
        }).addTo(map);
        marker.bindPopup(buildClientPopup(client), { maxWidth: 260 });
        if (onMarkerClick) marker.on("click", () => onMarkerClick(client));
        markersRef.current.push(marker);
      });
    }
  }, [livreurs, clients, courses, mapLoaded, masquerInactifs, showClients, showLivreurs, livreurIdsEnCourseReelle]);

  // 🎯 Compteurs — alignés avec la logique visuelle des marqueurs
  // VERT = pas noir ET pas en course (même logique que buildLivreurIcon)
  const nbLibres = livreurs.filter(l => !isLivreurNoir(l, livreurIdsEnCourseReelle) && !livreurIdsEnCourseReelle?.has(l.id)).length;
  // ORANGE = pas noir ET en course active
  const nbCourse = livreurs.filter(l => !isLivreurNoir(l, livreurIdsEnCourseReelle) && livreurIdsEnCourseReelle?.has(l.id)).length;
  const nbLivreursInactifs = livreurs.filter(l => isLivreurNoir(l, livreurIdsEnCourseReelle)).length;
  const nbClientsActifs = clients.filter(c => getClientStatut(c) === "actif").length;
  const nbClientsRecents = clients.filter(c => getClientStatut(c) === "recent").length;
  const nbClientsInactifs = clients.filter(c => getClientStatut(c) === "inactif").length;
  const nbClientsVisibles = showClients ? nbClientsActifs + nbClientsRecents : 0;
  const nbLivreursVisibles = showLivreurs ? nbLibres + nbCourse : 0;
  
  // Points heatmap pour légende
  const nbPointsDemande = clients.filter(c => c.latitude && c.longitude).length + 
                          courses.filter(c => c.gps_depart_lat && c.gps_depart_lng).length;
  const nbPointsCouverture = livreurs.filter(l => 
    l.latitude && l.longitude && (l.statut === "disponible" || l.statut === "en_course")
  ).length;

  return (
    <div className="relative w-full h-full">
      {/* Heatmap layer */}
      {mapLoaded && heatmapModeLocal !== "off" && (
        <HeatmapLayer
          map={mapInstanceRef.current}
          clients={clients}
          livreurs={livreurs}
          mode={heatmapModeLocal}
        />
      )}

      <div ref={mapRef} className="w-full h-full bg-slate-100" style={{ minHeight: 300 }} />

      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
          <div className="text-center space-y-3">
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
            <p className="text-xs font-medium text-slate-600">Chargement de la carte...</p>
          </div>
        </div>
      )}

      {/* Overlay controls */}
      {mapLoaded && (
        <>
          {/* Stats + légende (top-left) */}
          <div className="absolute top-4 left-4 z-[1000] space-y-2">
            <div className="dmap-overlay-badge">
              <div className="space-y-1 text-xs font-medium">
                {courses.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-600 flex-shrink-0" />
                    <span className="text-red-700 font-bold">{courses.length} en attente !</span>
                  </div>
                )}
                {showLivreurs && nbLibres > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="text-green-700">{nbLibres} libre{nbLibres > 1 ? "s" : ""}</span>
                  </div>
                )}
                {showLivreurs && nbCourse > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-orange-500 flex-shrink-0" />
                    <span className="text-orange-700">{nbCourse} en course</span>
                  </div>
                )}
                {showClients && nbClientsActifs > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-600 flex-shrink-0" />
                    <span className="text-blue-700">{nbClientsActifs} actif{nbClientsActifs > 1 ? "s" : ""} (&lt;5 min)</span>
                  </div>
                )}
                {showClients && nbClientsRecents > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-yellow-500 flex-shrink-0" />
                    <span className="text-yellow-700">{nbClientsRecents} récent{nbClientsRecents > 1 ? "s" : ""} (5-15 min)</span>
                  </div>
                )}
                {!masquerInactifs && showLivreurs && nbLivreursInactifs > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-gray-400 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">⚫ {nbLivreursInactifs} livreur{nbLivreursInactifs > 1 ? "s" : ""} inactif{nbLivreursInactifs > 1 ? "s" : ""}</span>
                  </div>
                )}
                {!masquerInactifs && showClients && nbClientsInactifs > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-gray-400 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">⚫ {nbClientsInactifs} client{nbClientsInactifs > 1 ? "s" : ""} inactif{nbClientsInactifs > 1 ? "s" : ""}</span>
                  </div>
                )}
                {courses.length === 0 && nbLivreursVisibles === 0 && nbClientsVisibles === 0 && (
                  <span className="text-gray-400">Aucun élément visible</span>
                )}
              </div>
            </div>
            
            {/* Légende GPS qualité */}
            <div className="dmap-overlay-badge text-xs text-slate-500 space-y-1">
              <div className="font-semibold text-slate-700 mb-1">Qualité GPS</div>
              <div>❤️ &lt;2 min · 💚 2-5 min · 🧡 5-15 min</div>
              <div>❤️‍🩹 15-30 min · ❤️‍🔥 &gt;30 min</div>
              <div className="text-gray-400">⚫ Noir = non dispatchable</div>
            </div>
          </div>

          {/* Contrôles heatmap + légende (top-right) */}
          <div className="absolute top-4 right-4 z-[1000] space-y-2">
            {showHeatmapHint && heatmapModeLocal === "off" && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 shadow-lg animate-in fade-in slide-in-from-top-2">
                <p className="text-xs font-semibold text-blue-800 mb-1">✨ Nouveau !</p>
                <p className="text-xs text-blue-700">Essayez les cartes thermiques pour analyser la demande et la couverture</p>
                <button 
                  onClick={() => setShowHeatmapHint(false)}
                  className="text-xs text-blue-500 hover:text-blue-700 mt-1 underline"
                >
                  Ne plus afficher
                </button>
              </div>
            )}
            <HeatmapControls
              mode={heatmapModeLocal}
              onModeChange={setHeatmapModeLocal}
              clients={clients}
              livreurs={livreurs}
              courses={courses}
            />
            
            {/* Légende contextuelle détaillée */}
            <HeatmapLegend
              mode={heatmapModeLocal}
              clients={clients}
              livreurs={livreurs}
              courses={courses}
            />
          </div>

          {/* Sélecteur pays (bottom-left) */}
          {onCountryChange && (
            <div className="absolute bottom-4 left-4 z-[1000]">
              <div className="dmap-overlay-badge" style={{ colorScheme: "light" }}>
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-3 h-3 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-700">Pays</span>
                </div>
                <div className="[&_button]:!bg-white [&_button]:!text-slate-800 [&_button]:!border-slate-200 [&_div]:!bg-white [&_div]:!text-slate-800">
                  <CountrySelector
                    value={countryCode}
                    onChange={onCountryChange}
                    className="w-full text-xs"
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}