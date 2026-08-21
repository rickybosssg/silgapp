import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X, Navigation, Package, MapPin } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { haversineKm as haversine } from "@/lib/priceEstimate";
import CourseTimeline from "./CourseTimeline";
import LivreurCardModerne from "./LivreurCardModerne";
import { base44 } from "@/api/base44Client";
import { useETACourse } from "@/hooks/useETACourse";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const DEPARTURE_ICON = L.divIcon({
  html: '<div style="width:24px;height:24px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const ARRIVAL_ICON = L.divIcon({
  html: '<div style="width:24px;height:24px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const LIVREUR_ICON = L.divIcon({
  html: '<div style="position:relative;width:44px;height:44px;">' +
    '<div style="position:absolute;inset:0;border-radius:50%;background:rgba(249,115,22,0.2);animation:pulseFull 2s infinite;"></div>' +
    '<div style="position:absolute;top:4px;left:4px;width:36px;height:36px;border-radius:50%;background:#f97316;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">' +
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="5.5" cy="17.5" r="3.5" fill="white" stroke="white"/>' +
    '<circle cx="18.5" cy="17.5" r="3.5" fill="white" stroke="white"/>' +
    '<path d="M5.5 17.5 L9 17.5 L10 14 L15 14 L18.5 17.5" stroke="white" stroke-width="2" fill="none"/>' +
    '<path d="M10 14 L11 10 L14 10 L15 14" stroke="white" stroke-width="2" fill="none"/>' +
    '<circle cx="12.5" cy="7" r="2.5" fill="white" stroke="white"/>' +
    '</svg>' +
    '</div>' +
    '</div>' +
    '<style>@keyframes pulseFull{0%{transform:scale(0.8);opacity:0.7}70%{transform:scale(1.3);opacity:0}100%{transform:scale(0.8);opacity:0}}</style>',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  className: "livreur-marker-anim",
});

// Composant interne pour ajuster la vue de la carte (seulement au montage et changement de phase)
function FitBounds({ positions, phase }) {
  const map = useMap();
  const lastCount = useRef(0);
  const lastPhase = useRef("");
  useEffect(() => {
    // Seulement re-zoomer quand le nombre de marqueurs change ou la phase change
    if (positions.length !== lastCount.current || phase !== lastPhase.current) {
      lastCount.current = positions.length;
      lastPhase.current = phase;
      if (positions.length >= 2) {
        const bounds = L.latLngBounds(positions.map(p => [p[0], p[1]]));
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      } else if (positions.length === 1) {
        map.setView(positions[0], 15);
      }
    }
  }, [positions, phase]);
  return null;
}

const REASSURANCE_LIVRAISON = [
  "Votre colis est entre de bonnes mains.",
  "Le livreur se dirige vers la destination.",
  "Livraison en cours, restez informé.",
];

export default function SuiviCourseFullscreen({ course, position, onClose, onCall, onMessage, onCancel }) {
  const [showTimeline, setShowTimeline] = useState(false);
  const [livreurPos, setLivreurPos] = useState(null);
  const [reassuranceIdx, setReassuranceIdx] = useState(0);
  const livreurPosRef = useRef(null);

  // Positions
  const depart = useMemo(() => ({
    lat: course.gps_depart_lat || position?.latitude,
    lng: course.gps_depart_lng || position?.longitude,
  }), [course, position]);

  const arrivee = useMemo(() => ({
    lat: course.gps_arrivee_lat,
    lng: course.gps_arrivee_lng,
  }), [course]);

  // Phase: "approche" (livreur va vers départ) ou "livraison" (livreur va vers arrivée)
  const isLivraison = ["en_livraison", "arrivee"].includes(course.statut);
  const isColisRecupere = ["colis_recupere", "passager_embarque", "pris_en_charge"].includes(course.statut);

  // ── Position livreur depuis course._livreur (enrichi par ClientExterneApp.checkStatus) ──
  // Polling Livreur.get() redondant supprimé — la position vient du polling de courses.
  useEffect(() => {
    const l = course._livreur;
    if (l?.latitude && l?.longitude) {
      setLivreurPos({ lat: l.latitude, lng: l.longitude });
    } else {
      const fallbackLat = course.latitude_prise_en_charge || course.latitude_recuperation;
      const fallbackLng = course.longitude_prise_en_charge || course.longitude_recuperation;
      if (fallbackLat) setLivreurPos({ lat: fallbackLat, lng: fallbackLng });
    }
  }, [course._livreur, course.latitude_prise_en_charge, course.longitude_prise_en_charge, course.latitude_recuperation, course.longitude_recuperation]);

  // Messages rassurants rotatifs (en mode livraison)
  useEffect(() => {
    if (!isLivraison) return;
    const interval = setInterval(() => {
      setReassuranceIdx(prev => (prev + 1) % REASSURANCE_LIVRAISON.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isLivraison]);

  // ── ETA unifié : useETACourse (ORS prioritaire, Haversine fallback) ──
  const activeTarget = (isLivraison || isColisRecupere) ? arrivee : depart;
  const etaHook = useETACourse({
    courseId: course.id,
    phase: isLivraison ? "livraison" : "recuperation",
    fromLat: livreurPos?.lat || null,
    fromLng: livreurPos?.lng || null,
    toLat: activeTarget?.lat || null,
    toLng: activeTarget?.lng || null,
    countryCode: course.country_code,
    livreurId: course.livreur_id,
    livreurLastUpdate: course?._livreur?.derniere_position_date || course?._livreur?.last_seen_at || null,
  });

  const eta = etaHook.etaMinutes != null
    ? { distance: etaHook.distanceKm?.toFixed(1), minutes: etaHook.etaMinutes, isRoadBased: etaHook.isRoadBased, isStale: etaHook.isStale, staleLabel: etaHook.staleLabel }
    : null;

  // Segments de route — ligne directe livreur → cible (ORS géré par useETACourse)
  const routeSegments = useMemo(() => {
    const segments = [];
    // Ligne de contexte: départ → arrivée (léger, pointillé)
    if (depart.lat && arrivee.lat && (isColisRecupere || isLivraison)) {
      segments.push({
        positions: [[depart.lat, depart.lng], [arrivee.lat, arrivee.lng]],
        color: "#cbd5e1", weight: 3, opacity: 0.5, dashArray: "6 6",
      });
    }
    // Route active: livreur → cible (ligne directe)
    if (livreurPos?.lat && activeTarget?.lat) {
      segments.push({
        positions: [[livreurPos.lat, livreurPos.lng], [activeTarget.lat, activeTarget.lng]],
        color: isLivraison ? "#f97316" : "#3b82f6",
        weight: 5, opacity: 0.9,
      });
    }
    return segments;
  }, [livreurPos, activeTarget, depart, arrivee, isColisRecupere, isLivraison]);

  // Positions pour FitBounds
  const fitPositions = useMemo(() => {
    const pts = [];
    if (livreurPos?.lat) pts.push([livreurPos.lat, livreurPos.lng]);
    if (depart.lat) pts.push([depart.lat, depart.lng]);
    if (arrivee.lat) pts.push([arrivee.lat, arrivee.lng]);
    return pts;
  }, [livreurPos, depart, arrivee]);

  const hasLivreur = !!course.livreur_id && !!course.livreur_nom;
  const targetLabel = isLivraison ? "Destination" : "Point de récupération";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-white flex flex-col"
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] bg-gradient-to-b from-black/40 to-transparent">
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
          <ArrowLeft className="w-5 h-5 text-gray-900" />
        </button>
        {eta && (
          <motion.div
            key={eta.minutes}
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg flex items-center gap-2"
          >
            <Navigation className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-gray-900">{eta.minutes} min</span>
            <span className="text-xs text-gray-500">· {eta.distance} km</span>
            {eta.isRoadBased && (
              <span className="text-[9px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">route</span>
            )}
          </motion.div>
        )}
        {onCancel && !isLivraison && !isColisRecupere && (
          <button onClick={onCancel} className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
            <X className="w-5 h-5 text-red-500" />
          </button>
        )}
        {(!onCancel || isLivraison || isColisRecupere) && <div className="w-10" />}
      </div>

      {/* Carte */}
      <div className="flex-1 relative">
        <MapContainer
          center={fitPositions[0] || [12.3714, -1.5197]}
          zoom={14}
          className="w-full h-full"
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap'
          />
          <FitBounds positions={fitPositions} phase={isLivraison ? "livraison" : "approche"} />

          {/* Départ */}
          {depart.lat && (
            <Marker position={[depart.lat, depart.lng]} icon={DEPARTURE_ICON}>
              <Popup>Départ: {course.adresse_depart}</Popup>
            </Marker>
          )}
          {/* Arrivée */}
          {arrivee.lat && (
            <Marker position={[arrivee.lat, arrivee.lng]} icon={ARRIVAL_ICON}>
              <Popup>Destination: {course.adresse_arrivee}</Popup>
            </Marker>
          )}
          {/* Livreur */}
          {livreurPos?.lat && (
            <Marker position={[livreurPos.lat, livreurPos.lng]} icon={LIVREUR_ICON}>
              <Popup>{course.livreur_nom || "Livreur"}</Popup>
            </Marker>
          )}
          {/* Routes — road-based (ORS) ou fallback ligne droite */}
          {routeSegments.map((r, i) => (
            <Polyline key={i} positions={r.positions} color={r.color} weight={r.weight} opacity={r.opacity} dashArray={r.dashArray} />
          ))}
        </MapContainer>

        {/* Badge mode livraison */}
        <AnimatePresence>
          {isLivraison && (
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000]"
            >
              <div className="bg-purple-500 text-white rounded-full px-4 py-2 shadow-lg flex items-center gap-2">
                <Package className="w-4 h-4" />
                <span className="text-xs font-bold">Colis en cours de livraison</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom sheet */}
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="bg-white rounded-t-3xl shadow-2xl border-t border-gray-100 max-h-[55%] overflow-y-auto"
      >
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Poignée */}
          <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-3" />

          {/* ── MODE LIVRAISON : ambiance dédiée ── */}
          {isLivraison && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-4 mb-3 border border-purple-100"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">📦 Votre colis est en route</p>
                  <p className="text-xs text-gray-500">Le livreur se dirige vers {targetLabel.toLowerCase()}</p>
                </div>
              </div>
              {eta && (
                <div className="flex items-center gap-4 mt-2 pl-1">
                  <div className="flex items-center gap-1">
                    <Navigation className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-xs font-bold text-gray-700">{eta.minutes} min restantes</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-xs font-bold text-gray-700">{eta.distance} km</span>
                  </div>
                </div>
              )}
              {/* Message rassurant rotatif */}
              <AnimatePresence mode="wait">
                <motion.p
                  key={reassuranceIdx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[11px] text-purple-600 font-medium mt-2 pl-1"
                >
                  {REASSURANCE_LIVRAISON[reassuranceIdx]}
                </motion.p>
              </AnimatePresence>
            </motion.div>
          )}

          {/* Timeline compact */}
          <div className="mb-3" onClick={() => setShowTimeline(!showTimeline)}>
            <CourseTimeline statut={course.statut} typeCourse={course.type_course} compact />
          </div>

          {/* Timeline détaillé */}
          <AnimatePresence>
            {showTimeline && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mb-3 px-1"
              >
                <CourseTimeline statut={course.statut} typeCourse={course.type_course} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Carte livreur */}
          {hasLivreur && (
            <LivreurCardModerne
              course={course}
              onCall={onCall}
              onMessage={onMessage}
              onTrack={null}
            />
          )}

          {/* Pas de livreur encore */}
          {!hasLivreur && (
            <div className="bg-amber-50 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
              <p className="text-sm font-semibold text-amber-800">Recherche d'un livreur en cours...</p>
            </div>
          )}

          {/* Bouton annuler */}
          {hasLivreur && onCancel && !isLivraison && !isColisRecupere && (
            <button
              onClick={onCancel}
              className="w-full mt-3 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-bold active:scale-[0.98] transition-transform"
            >
              Annuler la course
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}