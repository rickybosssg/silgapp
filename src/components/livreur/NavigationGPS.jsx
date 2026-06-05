import React, { useState, useEffect, useRef, useMemo } from "react";
import { Navigation, MapPin, Clock, Ruler, Eye, WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";

// ─── Haversine ────────────────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ETA moto ~25 km/h
function computeETA(distKm) {
  if (!distKm || distKm <= 0) return null;
  return Math.round((distKm / 25) * 60);
}

// Normaliser numéro BF
function normalizePhone(num) {
  const n = (num || "").replace(/\D/g, "");
  if (n.startsWith("226") && n.length === 11) return n;
  if (n.length === 8) return "226" + n;
  if (n.startsWith("0") && n.length === 9) return "226" + n.slice(1);
  return n;
}

function openGoogleMaps(originLat, originLng, destLat, destLng) {
  if (!destLat || !destLng) return;
  const origin = originLat && originLng ? `${originLat},${originLng}` : "";
  const dest = `${destLat},${destLng}`;
  const url = origin
    ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
  window.open(url, "_blank");
}

function openWaze(destLat, destLng) {
  if (!destLat || !destLng) return;
  window.open(`https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes`, "_blank");
}

// Durée depuis un timestamp
function dureeDepuis(isoDate) {
  if (!isoDate) return null;
  const diff = Math.round((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  return `${Math.floor(diff / 3600)} h`;
}

/**
 * Hook générique : récupère et rafraîchit la position GPS d'un contact depuis ClientExterne
 * Cherche par téléphone (normalisé ou brut)
 * Retourne { client, gps, connecte, gpsActif, lastUpdate, loading }
 * Utilisé pour EXPÉDITEUR (récupération) ET DESTINATAIRE (livraison)
 */
function useContactLive(telephone, enabled = true) {
  const [state, setState] = useState({ client: null, gps: null, connecte: false, gpsActif: false, lastUpdate: null, loading: true });

  // useRef pour stabiliser fetchGps et éviter recreations en boucle
  const telephoneRef = useRef(telephone);
  const enabledRef = useRef(enabled);
  useEffect(() => { telephoneRef.current = telephone; }, [telephone]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const fetchGps = useRef(async () => {
    const tel = telephoneRef.current;
    const en = enabledRef.current;
    if (!tel || !en) return;
    const norm = normalizePhone(tel);
    const local = norm.startsWith("226") ? norm.slice(3) : norm;
    // ⚡ CORRECTION RATE LIMIT : une seule requête avec le numéro local (8 chiffres)
    // au lieu de 3 requêtes en cascade. Fallback sur le normalisé si aucun résultat.
    try {
      let res = await base44.entities.ClientExterne.filter({ telephone: local });
      if (!res?.length && local !== norm) {
        res = await base44.entities.ClientExterne.filter({ telephone: norm });
      }
      if (res?.length > 0) {
        const client = res[0];
        const gpsActif = !!(client.latitude && client.longitude);
        const lastSeen = client.updated_date || client.created_date;
        const ageSec = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 1000 : Infinity;
        const connecte = client.actif !== false && ageSec < 300;
        setState({
          client,
          gps: gpsActif ? { lat: client.latitude, lng: client.longitude } : null,
          connecte,
          gpsActif,
          lastUpdate: lastSeen,
          loading: false,
        });
        return;
      }
    } catch (_) {}
    setState(prev => ({ ...prev, loading: false }));
  }).current;

  useEffect(() => {
    if (!enabled || !telephone) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }
    fetchGps();
    const interval = setInterval(fetchGps, 8000); // ⚡ 5s → 8s pour limiter les requêtes
    return () => clearInterval(interval);
  }, [telephone, enabled]); // stable car fetchGps est une ref

  return { ...state, refetch: fetchGps };
}

// Alias pour compatibilité
const useDestinataireLive = useContactLive;

/**
 * NavigationGPS — navigation + suivi temps réel expéditeur/destinataire
 *
 * Props:
 *   phase: "recuperation" | "livraison"
 *   destLat, destLng: coordonnées destination fixe (fallback si pas de GPS live)
 *   destLabel: texte adresse
 *   destinataireTelephone: numéro du contact cible (expéditeur ou destinataire)
 *   destinationInconnue: boolean
 */
export default function NavigationGPS({
  phase,
  destLat,
  destLng,
  destLabel,
  destinataireTelephone,
  destinationInconnue,
}) {
  const [livreurPos, setLivreurPos] = useState(null);
  const [dist, setDist] = useState(null);
  const [eta, setEta] = useState(null);
  const [showMiniMap, setShowMiniMap] = useState(false);

  const isLivraison = phase === "livraison";

  // ✅ CORRECTION AUDIT : relire le GPS du contact (expéditeur OU destinataire) toutes les 5s
  // Phase récupération → on suit l'expéditeur (destinataireTelephone = expediteur_telephone)
  // Phase livraison    → on suit le destinataire
  const { gps: contactGps, connecte, gpsActif: contactGpsActif, lastUpdate, loading: destLoading, client: destClient, refetch } =
    useContactLive(destinataireTelephone || null, !!destinataireTelephone);

  // Destination effective : GPS live du contact (PRIORITÉ ABSOLUE), sinon coordonnées fixes
  // useMemo pour stabiliser les références et éviter les re-renders infinis
  const effectiveLat = useMemo(
    () => contactGps?.lat || destLat || null,
    [contactGps?.lat, destLat]
  );
  const effectiveLng = useMemo(
    () => contactGps?.lng || destLng || null,
    [contactGps?.lng, destLng]
  );
  const usesLiveGps = !!(contactGps?.lat && contactGps?.lng);

  // CRITICAL : canNavigate doit être vrai si le GPS du destinataire existe, même si destinationInconnue=true
  const canNavigate = !!(effectiveLat && effectiveLng);

  // Ref pour éviter re-création du watchPosition à chaque render
  const effectiveLatRef = useRef(effectiveLat);
  const effectiveLngRef = useRef(effectiveLng);
  useEffect(() => { effectiveLatRef.current = effectiveLat; }, [effectiveLat]);
  useEffect(() => { effectiveLngRef.current = effectiveLng; }, [effectiveLng]);

  // Suivi GPS livreur (watchPosition) — créé UNE SEULE FOIS, lit les coords via ref
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLivreurPos(p);
        const lat = effectiveLatRef.current;
        const lng = effectiveLngRef.current;
        if (!lat || !lng) return; // Destination inconnue → pas de calcul
        const d = haversine(p.lat, p.lng, lat, lng);
        if (d !== null) {
          setDist(d);
          setEta(computeETA(d));
        }
      },
      null,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []); // Intentionnellement vide — les coords sont lues via ref

  const isRecup = phase === "recuperation";

  // ── PHASE RÉCUPÉRATION ──────────────────────────────────────────────────────
  if (!isLivraison) {
    if (!canNavigate) return null;
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
        {/* ✅ Indicateur GPS live expéditeur */}
        {usesLiveGps && destClient && (
          <div className="flex items-center gap-2 bg-amber-100 border border-amber-200 rounded-xl px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-800">
                {destClient?.prenom || destClient?.nom || "Expéditeur"} — GPS actif
              </p>
              {lastUpdate && (
                <p className="text-[10px] text-amber-600">Mis à jour il y a {dureeDepuis(lastUpdate)}</p>
              )}
            </div>
            <button onClick={refetch} className="p-1 rounded-lg hover:bg-amber-200 transition-colors">
              <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
            </button>
          </div>
        )}
        {dist !== null && (
          <ETABar dist={dist} eta={eta} color="amber" />
        )}
        <NavButtons
          onGoogle={() => openGoogleMaps(livreurPos?.lat, livreurPos?.lng, effectiveLat, effectiveLng)}
          onWaze={() => openWaze(effectiveLat, effectiveLng)}
          label="Naviguer vers la récupération"
          color="amber"
        />
        {destLabel && !usesLiveGps && (
          <p className="text-xs text-center text-amber-700 truncate">{destLabel}</p>
        )}
      </div>
    );
  }

  // ── PHASE LIVRAISON ─────────────────────────────────────────────────────────

  // Bandeau statut destinataire
  const DestStatut = () => {
    if (destLoading) return null;
    if (contactGpsActif) {
      return (
        <div className="flex items-center gap-2 bg-green-100 border border-green-200 rounded-xl px-3 py-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-green-800">
              {destClient?.prenom || destClient?.nom || "Destinataire"} — GPS actif
            </p>
            {lastUpdate && (
              <p className="text-[10px] text-green-600">
                Mis à jour il y a {dureeDepuis(lastUpdate)}
              </p>
            )}
          </div>
          <button onClick={refetch} className="p-1 rounded-lg hover:bg-green-200 transition-colors">
            <RefreshCw className="w-3.5 h-3.5 text-green-600" />
          </button>
        </div>
      );
    }
    if (destClient) {
      return (
        <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2">
          <WifiOff className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <p className="text-xs text-gray-500">
            {destClient?.prenom || destClient?.nom || "Destinataire"} — GPS non disponible
          </p>
        </div>
      );
    }
    return null;
  };

  // ── Règle unique : destination_gps_exists = canNavigate ──────────────────
  // Si pas de coordonnées disponibles → bloc orange "Destination à définir"
  if (!canNavigate) {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-orange-500" />
          <p className="text-sm font-bold text-orange-800">Destination à définir</p>
        </div>
        <p className="text-xs text-orange-700">
          Le destinataire n'a pas encore partagé sa position. Contactez-le pour obtenir son adresse.
        </p>
      </div>
    );
  }

  // ── Destination disponible → bloc vert navigation uniquement ──────────────
  return (
    <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3">
      {/* En-tête GPS */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
        <p className="text-sm font-bold text-green-800">
          {usesLiveGps ? "📍 Position GPS du destinataire" : "📍 Destination"}
        </p>
        {usesLiveGps && (
          <span className="text-[10px] bg-green-200 text-green-700 font-bold px-2 py-0.5 rounded-full ml-auto">
            Suivi temps réel actif
          </span>
        )}
      </div>

      {/* Nom destinataire si GPS live */}
      {usesLiveGps && destClient && (
        <div className="flex items-center justify-between bg-green-100/60 rounded-xl px-3 py-2">
          <p className="text-xs font-semibold text-green-800">
            {destClient.prenom || destClient.nom || "Destinataire"}
          </p>
          {lastUpdate && (
            <p className="text-[10px] text-green-600">
              Mis à jour il y a {dureeDepuis(lastUpdate)}
            </p>
          )}
          <button onClick={refetch} className="p-1 rounded-lg hover:bg-green-200 transition-colors ml-2">
            <RefreshCw className="w-3.5 h-3.5 text-green-600" />
          </button>
        </div>
      )}

      {/* ETA + distance — affiché même si très proche */}
      {dist !== null && (
        <ETABar dist={dist} eta={eta} color="green" />
      )}

      {/* Bouton navigation */}
      <NavButtons
        onGoogle={() => openGoogleMaps(livreurPos?.lat, livreurPos?.lng, effectiveLat, effectiveLng)}
        onWaze={() => openWaze(effectiveLat, effectiveLng)}
        label="Naviguer vers la livraison"
        color="green"
      />

      {/* Bouton mini carte live */}
      {usesLiveGps && (
        <button
          onClick={() => setShowMiniMap(v => !v)}
          className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-green-100 border border-green-200 text-green-700 font-semibold text-xs"
        >
          <Eye className="w-4 h-4" />
          {showMiniMap ? "Masquer la carte" : "Voir le destinataire en direct"}
        </button>
      )}

      {/* Mini carte */}
      {showMiniMap && (
        <MiniMap
          destLat={effectiveLat}
          destLng={effectiveLng}
          livreurLat={livreurPos?.lat}
          livreurLng={livreurPos?.lng}
        />
      )}

      {destLabel && !usesLiveGps && (
        <p className="text-xs text-center text-muted-foreground truncate">{destLabel}</p>
      )}
    </div>
  );
}

// ─── Composants internes ──────────────────────────────────────────────────────

function ETABar({ dist, eta, color }) {
  const textColor = color === "amber" ? "text-amber-800" : "text-green-800";
  const iconColor = color === "amber" ? "text-amber-600" : "text-green-600";
  
  // Calcul ETA : si distance < 0.1 km (100m), afficher "~1 min"
  const etaMinutes = eta !== null ? eta : (dist !== null && dist < 0.1 ? 1 : null);
  
  return (
    <div className="flex items-center gap-4">
      {dist !== null && (
        <div className="flex items-center gap-1.5">
          <Ruler className={cn("w-4 h-4", iconColor)} />
          <span className={cn("text-sm font-bold", textColor)}>
            {dist < 0.1 ? `${Math.round(dist * 1000)} m` : dist < 1 ? `${(dist * 1000).toFixed(0)} m` : `${dist.toFixed(1)} km`}
          </span>
        </div>
      )}
      {etaMinutes !== null && (
        <div className="flex items-center gap-1.5">
          <Clock className={cn("w-4 h-4", iconColor)} />
          <span className={cn("text-sm font-bold", textColor)}>
            {etaMinutes <= 1 ? "~1 min" : `~${etaMinutes} min`}
          </span>
        </div>
      )}
    </div>
  );
}

function NavButtons({ onGoogle, onWaze, label, color }) {
  const btnClass = color === "amber"
    ? "bg-gradient-to-b from-amber-500 to-amber-600 shadow-amber-200"
    : "bg-gradient-to-b from-green-500 to-green-700 shadow-green-200";
  return (
    <div className="flex gap-2">
      <button
        onClick={onGoogle}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl font-black text-sm text-white shadow-lg active:scale-[0.98] transition-all",
          btnClass
        )}
      >
        <Navigation className="w-5 h-5" />
        {label}
      </button>
      <button
        onClick={onWaze}
        className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg active:scale-[0.98] transition-all flex-shrink-0"
        title="Ouvrir dans Waze"
      >
        <span className="text-white text-xs font-black">W</span>
      </button>
    </div>
  );
}

function MiniMap({ destLat, destLng, livreurLat, livreurLng }) {
  // Utiliser OpenStreetMap embed via iframe statique
  const zoom = 15;
  const marker = `${destLat},${destLng}`;
  const bbox = destLat && destLng
    ? `${destLng - 0.01},${destLat - 0.01},${destLng + 0.01},${destLat + 0.01}`
    : "";
  const url = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;

  return (
    <div className="rounded-xl overflow-hidden border border-green-200 relative">
      <iframe
        title="Position destinataire"
        src={url}
        width="100%"
        height="200"
        style={{ border: 0 }}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin"
      />
      <div className="absolute top-2 left-2 bg-white/90 rounded-lg px-2 py-1 text-[10px] font-bold text-green-700 border border-green-200">
        📍 Destinataire
      </div>
    </div>
  );
}