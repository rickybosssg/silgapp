import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * DispatchMap — Carte dédiée au dispatch temps réel
 *
 * Code couleur :
 *  🟢 Vert   = Livreur libre (disponible + ON + GPS récent + app active)
 *  🟠 Orange = Livreur en course (mission active + ON + GPS récent)
 *  🔵 Bleu   = Client (actif + GPS récent + app active)
 *  🔴 Rouge  = Course en attente (aucun livreur assigné)
 *  ⚫ Gris   = Inactif / non dispatchable (OFF, GPS expiré, app fermée, non validé)
 *
 * Props supplémentaires :
 *  - livreursInactifs  : livreurs masqués normalement (OFF, GPS expiré, etc.)
 *  - clientsInactifs   : clients sans GPS récent ou app fermée
 *  - showInactifs      : boolean — afficher les inactifs en gris
 */

const GPS_SEUIL_MIN = 5;
const GPS_EXPIRE_MIN = 10;
const GPS_CLIENT_SEUIL_MIN = 30;

function isEnCourse(livreur) {
  return livreur.statut === "en_course";
}

function isLivreurNoir(livreur) {
  const dt = livreur.last_seen_at || livreur.derniere_position_date;
  if (!dt) return true;
  const min = (Date.now() - new Date(dt).getTime()) / 60000;
  return min > GPS_EXPIRE_MIN || livreur.statut === "hors_ligne";
}

function isClientNoir(client) {
  if (!client.latitude || !client.longitude) return true;
  const dt = client.last_seen_at;
  if (!dt) return true;
  return (Date.now() - new Date(dt).getTime()) > GPS_CLIENT_SEUIL_MIN * 60 * 1000;
}

function getLastGPSMin(entity) {
  const dt = entity.derniere_position_date || entity.last_seen_at;
  if (!dt) return null;
  return Math.round((Date.now() - new Date(dt).getTime()) / 60000);
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
      background: rgba(55, 65, 81, 0.2);
    }
    .dmap-livreur-noir .dmap-body {
      border-color: #374151;
      box-shadow: 0 2px 8px rgba(55, 65, 81, 0.3);
    }
    .dmap-livreur-noir .dmap-avatar-bg {
      background: linear-gradient(135deg, #374151 0%, #1f2937 100%);
    }
    .dmap-livreur-container.dmap-inactif-marker {
      opacity: 0.7;
    }

    /* ─── Client (🔵 bleu) ─── */
    .dmap-client .dmap-client-ring {
      background: rgba(37, 99, 235, 0.25);
      animation: dmap-pulse-bleu 2s ease-out infinite;
    }
    .dmap-client .dmap-client-dot {
      background: #2563eb;
      border-color: white;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.45);
    }

    /* ─── Client NOIR (⚫ hors ligne) ─── */
    .dmap-client-noir .dmap-client-ring {
      background: rgba(55, 65, 81, 0.2);
    }
    .dmap-client-noir .dmap-client-dot {
      background: #374151;
      border-color: white;
      box-shadow: 0 2px 6px rgba(55, 65, 81, 0.3);
    }
    .dmap-client-container.dmap-inactif-marker {
      opacity: 0.7;
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

function buildLivreurIcon(livreur) {
  const estNoir = isLivreurNoir(livreur);
  const libre = livreur.statut === "disponible";
  const cssClass = estNoir ? "dmap-livreur-noir" : (libre ? "dmap-livreur-libre" : "dmap-livreur-course");
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
  const estNoir = isClientNoir(client);
  const cssClass = estNoir ? "dmap-client-noir" : "dmap-client";
  return window.L.divIcon({
    html: `
      <div class="dmap-client-wrapper ${cssClass}">
        <div class="dmap-client-ring"></div>
        <div class="dmap-client-dot"></div>
      </div>
    `,
    className: `dmap-client-container${estNoir ? " dmap-inactif-marker" : ""}`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function buildLivreurPopup(livreur) {
  const estNoir = isLivreurNoir(livreur);
  const libre = livreur.statut === "disponible";
  const statutLabel = estNoir
    ? "⚫ Hors ligne — non dispatchable"
    : libre ? "🟢 Libre — disponible" : "🟠 En course";
  const gpsMin = getLastGPSMin(livreur);
  const gpsStr = gpsMin === null ? "?" : gpsMin < 1 ? "à l'instant" : `${gpsMin} min`;
  const statutColor = estNoir ? "#374151" : (libre ? "#16a34a" : "#ea580c");
  
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
    if (min > 10) raisons.push(`inactif depuis ${min} min`);
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
  const estNoir = isClientNoir(client);
  const gpsMin = getLastGPSMin(client);
  const gpsStr = gpsMin === null ? "?" : gpsMin < 1 ? "à l'instant" : `${gpsMin} min`;
  const statutLabel = estNoir ? "⚫ Hors ligne — non dispatchable" : "🔵 Client actif";
  const statutColor = estNoir ? "#374151" : "#2563eb";
  
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
      <p style="font-size:12px;margin:2px 0;color:${statutColor}">${statutLabel}</p>
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
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Recentrer la carte quand le pays change
  useEffect(() => {
    if (!mapInstanceRef.current || !position) return;
    mapInstanceRef.current.setView([position.latitude, position.longitude], position.zoom ?? 12);
  }, [position?.latitude, position?.longitude]);

  // Init carte
  useEffect(() => {
    if (!mapRef.current || !position) return;

    const inject = () => {
      if (!document.getElementById("dmap-styles")) {
        const s = document.createElement("style");
        s.id = "dmap-styles";
        s.textContent = buildStyles();
        document.head.appendChild(s);
      }

      if (!window.L) return;

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
    };

    if (!window.L) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);

      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = inject;
      document.head.appendChild(script);
    } else {
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

  // Mise à jour des marqueurs
  useEffect(() => {
    if (!mapInstanceRef.current || !mapLoaded) return;
    const map = mapInstanceRef.current;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // ⚫ Livreurs NOIRS (hors ligne) — zIndex bas
    livreurs.forEach(livreur => {
      if (!livreur.latitude || !livreur.longitude) return;
      const estNoir = isLivreurNoir(livreur);
      if (!estNoir) return;
      const icon = buildLivreurIcon(livreur);
      const marker = window.L.marker([livreur.latitude, livreur.longitude], {
        icon,
        zIndexOffset: 100,
      }).addTo(map);
      marker.bindPopup(buildLivreurPopup(livreur), { maxWidth: 260 });
      if (onMarkerClick) marker.on("click", () => onMarkerClick(livreur));
      markersRef.current.push(marker);
    });

    // ⚫ Clients NOIRS (hors ligne) — zIndex bas
    clients.forEach(client => {
      if (!client.latitude || !client.longitude) return;
      const estNoir = isClientNoir(client);
      if (!estNoir) return;
      const icon = buildClientIcon(client);
      const marker = window.L.marker([client.latitude, client.longitude], {
        icon,
        zIndexOffset: 50,
      }).addTo(map);
      marker.bindPopup(buildClientPopup(client), { maxWidth: 260 });
      if (onMarkerClick) marker.on("click", () => onMarkerClick(client));
      markersRef.current.push(marker);
    });

    // 🔴 Courses en attente
    courses.forEach(course => {
      const lat = course.gps_depart_lat;
      const lng = course.gps_depart_lng;
      if (!lat || !lng) return;
      const icon = buildCourseIcon();
      const marker = window.L.marker([lat, lng], { icon, zIndexOffset: 1500 }).addTo(map);
      marker.bindPopup(buildCoursePopup(course), { maxWidth: 260 });
      if (onMarkerClick) marker.on("click", () => onMarkerClick({ ...course, _type: "course" }));
      markersRef.current.push(marker);
    });

    // 🟢🟠 Livreurs actifs (déjà filtrés par buildLivreurIcon)
    livreurs.forEach(livreur => {
      if (!livreur.latitude || !livreur.longitude) return;
      const estNoir = isLivreurNoir(livreur);
      if (estNoir) return; // déjà affiché ci-dessus
      const icon = buildLivreurIcon(livreur);
      const marker = window.L.marker([livreur.latitude, livreur.longitude], {
        icon,
        zIndexOffset: livreur.statut === "disponible" ? 1200 : 1100,
      }).addTo(map);
      marker.bindPopup(buildLivreurPopup(livreur), { maxWidth: 260 });
      if (onMarkerClick) marker.on("click", () => onMarkerClick(livreur));
      markersRef.current.push(marker);
    });

    // 🔵 Clients BLEUS (actifs) — zIndex haut
    clients.forEach(client => {
      if (!client.latitude || !client.longitude) return;
      const estNoir = isClientNoir(client);
      if (estNoir) return; // déjà affiché ci-dessus
      const icon = buildClientIcon(client);
      const marker = window.L.marker([client.latitude, client.longitude], {
        icon,
        zIndexOffset: 900,
      }).addTo(map);
      marker.bindPopup(buildClientPopup(client), { maxWidth: 260 });
      if (onMarkerClick) marker.on("click", () => onMarkerClick(client));
      markersRef.current.push(marker);
    });
  }, [livreurs, clients, courses, mapLoaded]);

  const nbLibres = livreurs.filter(l => l.statut === "disponible" && !isLivreurNoir(l)).length;
  const nbCourse = livreurs.filter(l => l.statut === "en_course" && !isLivreurNoir(l)).length;
  const nbInactifs = livreurs.filter(l => isLivreurNoir(l)).length + clients.filter(c => isClientNoir(c)).length;

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full bg-slate-100" style={{ minHeight: 300 }} />

      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
          <div className="text-center space-y-3">
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
            <p className="text-xs font-medium text-slate-600">Chargement de la carte...</p>
          </div>
        </div>
      )}

      {/* Légende overlay */}
      {mapLoaded && (
        <div className="absolute top-4 left-4 z-[1000] space-y-2">
          <div className="dmap-overlay-badge">
            <div className="space-y-1 text-xs font-medium">
              {courses.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-600 flex-shrink-0" />
                  <span className="text-red-700 font-bold">{courses.length} en attente !</span>
                </div>
              )}
              {nbLibres > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-green-700">{nbLibres} libre{nbLibres > 1 ? "s" : ""}</span>
                </div>
              )}
              {nbCourse > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange-500 flex-shrink-0" />
                  <span className="text-orange-700">{nbCourse} en course</span>
                </div>
              )}
              {clients.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />
                  <span className="text-blue-700">{clients.length} client{clients.length > 1 ? "s" : ""}</span>
                </div>
              )}
              {nbInactifs > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-gray-400 flex-shrink-0" />
                  <span className="text-gray-500">{nbInactifs} inactif{nbInactifs > 1 ? "s" : ""} (non dispatchable)</span>
                </div>
              )}
              {courses.length === 0 && nbLibres === 0 && nbCourse === 0 && clients.length === 0 && nbInactifs === 0 && (
                <span className="text-gray-400">Aucun élément visible</span>
              )}
            </div>
          </div>
          <div className="dmap-overlay-badge text-xs text-slate-500 space-y-1">
            <div>❤️ &lt;2 min · 💚 2-5 min · 🧡 5-15 min</div>
            <div>❤️‍🩹 15-30 min · ❤️‍🔥 &gt;30 min</div>
            <div className="text-gray-400">⚫ Noir = non dispatchable</div>
          </div>
        </div>
      )}
    </div>
  );
}