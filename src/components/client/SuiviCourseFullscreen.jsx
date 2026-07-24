import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X, Navigation } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import CourseTimeline from "./CourseTimeline";
import LivreurCardModerne from "./LivreurCardModerne";
import { base44 } from "@/api/base44Client";

// Fix icônes Leaflet en Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const DEPARTURE_ICON = L.divIcon({
  html: '<div style="width:28px;height:28px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const ARRIVAL_ICON = L.divIcon({
  html: '<div style="width:28px;height:28px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const LIVREUR_ICON = L.divIcon({
  html: '<div style="width:32px;height:32px;border-radius:50%;background:#f97316;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:14px;">🛵</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function SuiviCourseFullscreen({ course, position, onClose, onCall, onMessage, onCancel }) {
  const [showTimeline, setShowTimeline] = useState(false);

  // Positions
  const depart = useMemo(() => ({
    lat: course.gps_depart_lat || position?.latitude,
    lng: course.gps_depart_lng || position?.longitude,
  }), [course, position]);

  const arrivee = useMemo(() => ({
    lat: course.gps_arrivee_lat,
    lng: course.gps_arrivee_lng,
  }), [course]);

  const livreurPos = useMemo(() => ({
    lat: course.latitude_prise_en_charge || course.latitude_recuperation,
    lng: course.longitude_prise_en_charge || course.longitude_recuperation,
  }), [course]);

  // Calcul distance + ETA
  const eta = useMemo(() => {
    if (!livreurPos.lat || !depart.lat) return null;
    const dist = haversine(livreurPos.lat, livreurPos.lng, depart.lat, depart.lng);
    const mins = Math.max(1, Math.round((dist / 25) * 60)); // 25 km/h moyenne ville
    return { distance: dist.toFixed(1), minutes: mins };
  }, [livreurPos, depart]);

  // Centre carte
  const center = useMemo(() => {
    if (livreurPos.lat) return [livreurPos.lat, livreurPos.lng];
    if (depart.lat) return [depart.lat, depart.lng];
    return [12.3714, -1.5197]; // Ouaga
  }, [livreurPos, depart]);

  // Route polyline
  const routePoints = useMemo(() => {
    const pts = [];
    if (livreurPos.lat && depart.lat) {
      pts.push([livreurPos.lat, livreurPos.lng], [depart.lat, depart.lng]);
    }
    if (depart.lat && arrivee.lat) {
      pts.push([depart.lat, depart.lng], [arrivee.lat, arrivee.lng]);
    }
    return pts.length >= 2 ? pts : [];
  }, [livreurPos, depart, arrivee]);

  const hasLivreur = !!course.livreur_id && !!course.livreur_nom;

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
          <div className="bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg flex items-center gap-2">
            <Navigation className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-gray-900">{eta.minutes} min</span>
            <span className="text-xs text-gray-500">· {eta.distance} km</span>
          </div>
        )}
        {onCancel && !hasLivreur && (
          <button onClick={onCancel} className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
            <X className="w-5 h-5 text-red-500" />
          </button>
        )}
        {(!onCancel || hasLivreur) && <div className="w-10" />}
      </div>

      {/* Carte */}
      <div className="flex-1 relative">
        <MapContainer center={center} zoom={14} className="w-full h-full" zoomControl={false}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap'
          />
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
          {livreurPos.lat && (
            <Marker position={[livreurPos.lat, livreurPos.lng]} icon={LIVREUR_ICON}>
              <Popup>{course.livreur_nom || "Livreur"}</Popup>
            </Marker>
          )}
          {/* Route */}
          {routePoints.length >= 2 && (
            <Polyline positions={routePoints} color="#f97316" weight={4} opacity={0.7} dashArray="8 8" />
          )}
        </MapContainer>
      </div>

      {/* Bottom sheet */}
      <div className="bg-white rounded-t-3xl shadow-2xl border-t border-gray-100 max-h-[55%] overflow-y-auto">
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Poignée */}
          <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-3" />

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
          {hasLivreur && onCancel && (
            <button
              onClick={onCancel}
              className="w-full mt-3 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-bold active:scale-[0.98] transition-transform"
            >
              Annuler la course
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}