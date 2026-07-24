import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, Bike, Clock, MapPin, X, Radio, Users, Zap } from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { base44 } from "@/api/base44Client";

const DEPART_ICON = L.divIcon({
  html: '<div style="width:20px;height:20px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const LIVREUR_ANON_ICON = L.divIcon({
  html: '<div style="width:12px;height:12px;border-radius:50%;background:#10b981;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.2);opacity:0.7;"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
  className: "livreur-anon-marker",
});

const REASSURANCE_MESSAGES = [
  { emoji: "🔍", text: "Nous recherchons le meilleur livreur..." },
  { emoji: "🛵", text: "Un livreur consulte votre demande..." },
  { emoji: "📦", text: "Votre colis est entre de bonnes mains." },
  { emoji: "⚡", text: "Mise en relation en cours..." },
  { emoji: "🎯", text: "Nous trouvons le livreur le plus proche." },
];

function parseNotifiedCount(course) {
  try {
    if (course.dispatch_notified_ids) {
      const ids = JSON.parse(course.dispatch_notified_ids);
      return Array.isArray(ids) ? ids.length : 0;
    }
  } catch {}
  return 0;
}

function parseWaveNotifiedCount(course) {
  try {
    if (course.dispatch_wave_notified_ids) {
      const ids = JSON.parse(course.dispatch_wave_notified_ids);
      return Array.isArray(ids) ? ids.length : 0;
    }
  } catch {}
  return 0;
}

export default function RechercheLivreurScreen({ course, position, countryCode, onClose }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [nearbyLivreurs, setNearbyLivreurs] = useState([]);
  const mapRef = useRef(null);

  const notifiedCount = parseNotifiedCount(course);
  const waveNotifiedCount = parseWaveNotifiedCount(course);
  const currentWave = course.dispatch_wave || 1;

  // Départ
  const depart = useMemo(() => ({
    lat: course.gps_depart_lat || position?.latitude,
    lng: course.gps_depart_lng || position?.longitude,
  }), [course, position]);

  const center = useMemo(() => {
    if (depart.lat) return [depart.lat, depart.lng];
    return [12.3714, -1.5197];
  }, [depart]);

  // Timer écoulé
  useEffect(() => {
    const startTime = course.heure_sollicitation ? new Date(course.heure_sollicitation).getTime() : Date.now();
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [course.heure_sollicitation]);

  // Messages rassurants rotatifs
  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex(prev => (prev + 1) % REASSURANCE_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Fetch livreurs disponibles à proximité (anonymes)
  useEffect(() => {
    if (!countryCode) return;
    let active = true;
    const fetchLivreurs = async () => {
      try {
        const livreurs = await base44.entities.Livreur.filter({
          statut: "disponible",
          country_code: countryCode,
          actif: true,
        });
        if (!active) return;
        // Filtrer ceux avec GPS et dans un rayon de ~5km
        const nearby = (livreurs || []).filter(l => {
          if (!l.latitude || !l.longitude) return false;
          if (!depart.lat) return true; // pas de départ GPS → tous
          const dist = haversine(depart.lat, depart.lng, l.latitude, l.longitude);
          return dist <= 5;
        });
        setNearbyLivreurs(nearby.slice(0, 12));
      } catch (e) {
        console.warn("[RechercheLivreur] Erreur fetch livreurs:", e.message);
      }
    };
    fetchLivreurs();
    const interval = setInterval(fetchLivreurs, 10000); // refresh every 10s
    return () => { active = false; clearInterval(interval); };
  }, [countryCode, depart.lat, depart.lng]);

  // ETA estimation
  const etaText = useMemo(() => {
    const mins = Math.floor(elapsedSec / 60);
    const secs = elapsedSec % 60;
    if (mins === 0) return `≈ 1 min ${secs}s`;
    if (mins < 2) return `≈ 2 min`;
    if (currentWave <= 1) return "Un livreur est généralement trouvé en moins de 2 minutes";
    if (currentWave === 2) return "Recherche élargie en cours...";
    return "Nous continuons à chercher le meilleur livreur...";
  }, [elapsedSec, currentWave]);

  const elapsedDisplay = useMemo(() => {
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [elapsedSec]);

  const msg = REASSURANCE_MESSAGES[msgIndex];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-white flex flex-col"
    >
      {/* ── CARTE VIVANTE ── */}
      <div className="flex-1 relative">
        <MapContainer
          center={center}
          zoom={14}
          className="w-full h-full"
          zoomControl={false}
          ref={(ref) => { mapRef.current = ref; }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap'
          />

          {/* Rayon animé autour du départ */}
          {depart.lat && (
            <>
              <Circle
                center={[depart.lat, depart.lng]}
                radius={800}
                pathOptions={{ color: "#f97316", fillColor: "#f97316", fillOpacity: 0.05, weight: 1, dashArray: "6 6" }}
              />
              <Circle
                center={[depart.lat, depart.lng]}
                radius={400}
                pathOptions={{ color: "#f97316", fillColor: "#f97316", fillOpacity: 0.08, weight: 1 }}
              />
            </>
          )}

          {/* Marqueur de départ */}
          {depart.lat && (
            <Marker position={[depart.lat, depart.lng]} icon={DEPART_ICON}>
              <Tooltip permanent direction="top" offset={[0, -12]} className="custom-tooltip">
                Votre position
              </Tooltip>
            </Marker>
          )}

          {/* Livreurs disponibles anonymes */}
          {nearbyLivreurs.map((l, i) => (
            <Marker
              key={l.id || i}
              position={[l.latitude, l.longitude]}
              icon={LIVREUR_ANON_ICON}
            />
          ))}
        </MapContainer>

        {/* Overlay header sur la carte */}
        <div className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] bg-gradient-to-b from-black/30 to-transparent">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg">
            <p className="text-[10px] text-gray-500 font-medium">Point de récupération</p>
            <p className="text-sm font-bold text-gray-900 max-w-[200px] truncate">{course.adresse_depart}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Badge "Recherche en cours" flottant */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000]"
        >
          <div className="bg-primary text-white rounded-full px-4 py-2 shadow-lg flex items-center gap-2">
            <Radio className="w-4 h-4 animate-pulse" />
            <span className="text-xs font-bold">Recherche en cours</span>
          </div>
        </motion.div>
      </div>

      {/* ── BOTTOM SHEET ── */}
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="bg-white rounded-t-3xl shadow-2xl border-t border-gray-100"
      >
        <div className="p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {/* Poignée */}
          <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />

          {/* Message rassurant */}
          <div className="text-center min-h-[48px] mb-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={msgIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="flex items-center justify-center gap-2"
              >
                <span className="text-xl">{msg.emoji}</span>
                <p className="text-sm font-bold text-gray-900">{msg.text}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {/* Temps écoulé */}
            <div className="bg-blue-50 rounded-2xl p-3 text-center">
              <Clock className="w-5 h-5 text-blue-500 mx-auto mb-1" />
              <p className="text-lg font-black text-gray-900">{elapsedDisplay}</p>
              <p className="text-[9px] text-gray-500 font-medium">écoulé</p>
            </div>
            {/* Livreurs notifiés */}
            <div className="bg-amber-50 rounded-2xl p-3 text-center">
              <Users className="w-5 h-5 text-amber-500 mx-auto mb-1" />
              <p className="text-lg font-black text-gray-900">{notifiedCount}</p>
              <p className="text-[9px] text-gray-500 font-medium">notifiés</p>
            </div>
            {/* Disponibles */}
            <div className="bg-emerald-50 rounded-2xl p-3 text-center">
              <Bike className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
              <p className="text-lg font-black text-gray-900">{nearbyLivreurs.length}</p>
              <p className="text-[9px] text-gray-500 font-medium">disponibles</p>
            </div>
          </div>

          {/* Vagues de dispatch */}
          <div className="bg-gray-50 rounded-2xl p-3 mb-3">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Vagues de dispatch
            </p>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map(wave => {
                const isDone = currentWave > wave;
                const isActive = currentWave === wave;
                return (
                  <React.Fragment key={wave}>
                    <motion.div
                      initial={false}
                      animate={{
                        scale: isActive ? [1, 1.08, 1] : 1,
                        opacity: isActive ? 1 : isDone ? 0.7 : 0.4,
                      }}
                      transition={{ duration: 1.2, repeat: isActive ? Infinity : 0 }}
                      className={`flex-1 rounded-xl py-2 px-1 text-center border-2 ${
                        isDone ? "bg-emerald-50 border-emerald-200" :
                        isActive ? "bg-primary/10 border-primary" :
                        "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <p className={`text-[10px] font-bold ${isDone ? "text-emerald-600" : isActive ? "text-primary" : "text-gray-400"}`}>
                        {isDone ? "✓" : isActive ? "→" : ""} Vague {wave}
                      </p>
                    </motion.div>
                    {wave < 3 && <div className="w-3 h-0.5 bg-gray-200" />}
                  </React.Fragment>
                );
              })}
            </div>
            {waveNotifiedCount > 0 && (
              <p className="text-[10px] text-gray-500 mt-2 text-center">
                Vague {currentWave} : {waveNotifiedCount} livreur{waveNotifiedCount > 1 ? "s" : ""} notifié{waveNotifiedCount > 1 ? "s" : ""}
              </p>
            )}
          </div>

          {/* ETA */}
          <div className="bg-indigo-50 rounded-2xl p-3 text-center">
            <p className="text-xs text-indigo-700 font-medium">{etaText}</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}