import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bike, Clock, X, Radio, Users, Zap } from "lucide-react";
import { MapContainer, TileLayer, Marker, Tooltip, Circle } from "react-leaflet";
import L from "leaflet";
import { CARTO_TILE_URL } from "@/lib/cartTiles";
import "leaflet/dist/leaflet.css";
import { haversineKm as haversine } from "@/lib/priceEstimate";
import { base44 } from "@/api/base44Client";
import { isExpressAwaitingDispatch } from "@/lib/expressTracking";
import ClientRelaunchActions from './ClientRelaunchActions';
import SearchActivityCounters from './SearchActivityCounters';
import { useQueryClient } from '@tanstack/react-query';

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

export default function RechercheLivreurScreen({ course, position, countryCode, onClose, onCancel = null, guestPriceActions = null }) {
  const queryClient = useQueryClient();
  const awaitingExpressDispatch = isExpressAwaitingDispatch(course);
  const [msgIndex, setMsgIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(null);
  const [nearbyLivreurs, setNearbyLivreurs] = useState([]);
  const [notifiedCount, setNotifiedCount] = useState(null);
  const [nearbyLoaded, setNearbyLoaded] = useState(false);
  const [waveNotifiedCount, setWaveNotifiedCount] = useState(0);
  const mapRef = useRef(null);

  const currentWave = course.private_guest ? course.dispatch_wave : course.dispatch_wave || 1;

  // ── Fetch notification counts from DispatchNotification entity ──
  useEffect(() => {
    if (course.private_guest) { setNotifiedCount(course.notified_count ?? null); return; }
    let active = true;
    const fetchCounts = async () => {
      try {
        const notifs = await base44.entities.DispatchNotification.filter(
          { course_id: course.id }, '-date_notification', 500
        );
        if (!active) return;
        const total = (notifs || []).filter(n => n.statut === 'notifie' || n.statut === 'accepte').length;
        const wave = (notifs || []).filter(n => (n.vague || 1) === currentWave && (n.statut === 'notifie' || n.statut === 'accepte')).length;
        setNotifiedCount(total);
        setWaveNotifiedCount(wave);
      } catch {}
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [course.id, currentWave, course.private_guest, course.notified_count]);

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
    const startTime = Date.parse(course.heure_sollicitation || '');
    const update = () => setElapsedSec(Number.isFinite(startTime) ? Math.max(0, Math.floor((Date.now() - startTime) / 1000)) : null);
    update();
    const interval = setInterval(update, 1000);
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
    if (course.private_guest) { setNearbyLivreurs([]); setNearbyLoaded(false); return; }
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
        setNearbyLoaded(true);
      } catch (e) {
        console.warn("[RechercheLivreur] Erreur fetch livreurs:", e.message);
      }
    };
    fetchLivreurs();
    const interval = setInterval(fetchLivreurs, 10000); // refresh every 10s
    return () => { active = false; clearInterval(interval); };
  }, [countryCode, depart.lat, depart.lng, course.private_guest]);

  // ETA estimation
  const etaText = useMemo(() => {
    if (awaitingExpressDispatch) return "Votre commande est conservée. Actualisation automatique en cours.";
    return "Recherche en cours. Le délai d’acceptation dépend des livreurs disponibles.";
  }, [awaitingExpressDispatch]);

  const elapsedDisplay = useMemo(() => {
    if (elapsedSec === null) return '—';
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [elapsedSec]);

  const msg = awaitingExpressDispatch
    ? { emoji: "", text: "Commande enregistrée. La recherche n’a pas encore démarré." }
    : { emoji: REASSURANCE_MESSAGES[msgIndex].emoji, text: 'Votre demande est en cours de recherche.' };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-white flex flex-col"
    >
      {/* ── CARTE VIVANTE ── */}
      <div className="flex-1 min-h-[160px] relative">
        <MapContainer
          center={center}
          zoom={14}
          className="w-full h-full"
          zoomControl={false}
          ref={(ref) => { mapRef.current = ref; }}
        >
          <TileLayer
            url={CARTO_TILE_URL}
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
                Point de récupération
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
        <div className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))] bg-gradient-to-b from-black/30 to-transparent">
          <div className="min-w-0 flex-1 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg">
            <p className="text-[10px] text-gray-500 font-medium">Point de récupération</p>
            <p className="text-sm font-bold text-gray-900 truncate">{course.adresse_depart}</p>
          </div>
          {onCancel && <button type="button" onClick={onCancel} className="max-w-[45%] min-h-11 rounded-lg px-3 py-2 bg-white text-sm font-semibold text-red-700">Annuler la course</button>}
          <button title="Fermer le suivi sans annuler" aria-label="Fermer le suivi sans annuler" onClick={onClose} className="w-10 h-10 shrink-0 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
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
            <span className="text-xs font-bold">{awaitingExpressDispatch ? "En attente de diffusion" : "Recherche en cours"}</span>
          </div>
        </motion.div>
      </div>

      {/* ── BOTTOM SHEET ── */}
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="max-h-[65dvh] overflow-y-auto bg-white rounded-t-3xl shadow-2xl border-t border-gray-100"
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
          <SearchActivityCounters course={course} />
          <div className="mb-4">
            {course.private_guest ? guestPriceActions && <ClientRelaunchActions searchMode {...guestPriceActions} />
              : <ClientRelaunchActions searchMode identity={`course:${course.id}`} context={{ revision: course.updated_date }}
                readContext={() => base44.functions.invoke('relaunchClientCourse', { action: 'context', course_id: course.id })}
                execute={input => base44.functions.invoke('relaunchClientCourse', { ...input, course_id: course.id })}
                onConfirmed={() => queryClient.invalidateQueries({ predicate: query => query.queryKey.some(key => typeof key === 'string' && /course/i.test(key)) })} />}
          </div>
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
              <p className="text-lg font-black text-gray-900">{notifiedCount ?? '—'}</p>
              <p className="text-[9px] text-gray-500 font-medium">notifiés</p>
            </div>
            {/* Disponibles */}
            <div className="bg-emerald-50 rounded-2xl p-3 text-center">
              <Bike className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
              <p className="text-lg font-black text-gray-900">{nearbyLoaded ? nearbyLivreurs.length : '—'}</p>
              <p className="text-[9px] text-gray-500 font-medium">disponibles</p>
            </div>
          </div>

          {/* Vagues de dispatch */}
          {!awaitingExpressDispatch && <div className="bg-gray-50 rounded-2xl p-3 mb-3">
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
          </div>}
          {/* ETA */}
          <div className="bg-indigo-50 rounded-2xl p-3 text-center">
            <p className="text-xs text-indigo-700 font-medium">{etaText}</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
