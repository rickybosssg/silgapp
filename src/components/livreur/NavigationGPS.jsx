import React, { useState, useEffect, useRef } from "react";
import { Navigation, MapPin, Phone, Clock, Ruler, Eye, Wifi, WifiOff, RefreshCw } from "lucide-react";
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
 * Hook : récupère et rafraîchit la position GPS du destinataire depuis ClientExterne
 * Cherche par téléphone (normalisé ou brut)
 * Retourne { client, gps, connecte, gpsActif, lastUpdate, loading }
 */
function useDestinataireLive(telephone, enabled = true) {
  const [state, setState] = useState({ client: null, gps: null, connecte: false, gpsActif: false, lastUpdate: null, loading: true });

  const fetchGps = async () => {
    if (!telephone || !enabled) return;
    const norm = normalizePhone(telephone);
    const local = norm.startsWith("226") ? norm.slice(3) : norm;

    // Essais successifs avec différents formats
    const queries = [norm, local, telephone];
    for (const q of queries) {
      try {
        const res = await base44.entities.ClientExterne.filter({ telephone: q });
        if (res?.length > 0) {
          const client = res[0];
          const gpsActif = !!(client.latitude && client.longitude);
          // "connecté" = compte actif + GPS récent (< 5 min)
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
    }
    setState(prev => ({ ...prev, loading: false }));
  };

  useEffect(() => {
    if (!enabled || !telephone) return;
    fetchGps();
    // Rafraîchir toutes les 5s pour le suivi temps réel
    const interval = setInterval(fetchGps, 5000);
    return () => clearInterval(interval);
  }, [telephone, enabled]);

  return { ...state, refetch: fetchGps };
}

/**
 * NavigationGPS — navigation + suivi temps réel destinataire
 *
 * Props:
 *   phase: "recuperation" | "livraison"
 *   destLat, destLng: coordonnées destination fixe
 *   destLabel: texte adresse
 *   destinataireTelephone: numéro destinataire (pour contacts + recherche GPS)
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

  // Suivi GPS destinataire uniquement en phase livraison
  const { gps: destGps, connecte, gpsActif: destGpsActif, lastUpdate, loading: destLoading, client: destClient, refetch } =
    useDestinataireLive(isLivraison ? destinataireTelephone : null, isLivraison);

  // Destination effective : GPS destinataire si disponible (PRIORITÉ ABSOLUE), sinon coordonnées fixes
  const effectiveLat = (isLivraison && destGps?.lat) ? destGps.lat : destLat;
  const effectiveLng = (isLivraison && destGps?.lng) ? destGps.lng : destLng;
  const usesLiveGps = isLivraison && !!(destGps?.lat && destGps?.lng);

  // CRITICAL : canNavigate doit être vrai si le GPS du destinataire existe, même si destinationInconnue=true
  const canNavigate = !!(effectiveLat && effectiveLng);

  // Suivi GPS livreur (watchPosition)
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLivreurPos(p);
        const d = haversine(p.lat, p.lng, effectiveLat, effectiveLng);
        if (d !== null) {
          setDist(d);
          setEta(computeETA(d));
        }
      },
      null,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [effectiveLat, effectiveLng]);

  const isRecup = phase === "recuperation";

  // Boutons contact
  const BtnAppel = destinataireTelephone && (
    <a
      href={`tel:${destinataireTelephone}`}
      className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-blue-100 text-blue-700 font-semibold text-xs border border-blue-200"
    >
      <Phone className="w-4 h-4" />
      Appeler
    </a>
  );

  const BtnWhatsApp = destinataireTelephone && (
    <button
      onClick={() => {
        const num = normalizePhone(destinataireTelephone);
        const dl = `whatsapp://send?phone=${num}`;
        const a = document.createElement("a"); a.href = dl; a.click();
        setTimeout(() => { if (document.hasFocus()) window.open(`https://wa.me/${num}`, "_blank"); }, 500);
      }}
      className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-green-100 text-green-700 font-semibold text-xs border border-green-200"
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-green-600">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      WhatsApp
    </button>
  );

  // ── PHASE RÉCUPÉRATION ──────────────────────────────────────────────────────
  if (!isLivraison) {
    if (!canNavigate) return null;
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
        {dist !== null && dist > 0 && (
          <ETABar dist={dist} eta={eta} color="amber" />
        )}
        <NavButtons
          onGoogle={() => openGoogleMaps(livreurPos?.lat, livreurPos?.lng, effectiveLat, effectiveLng)}
          onWaze={() => openWaze(effectiveLat, effectiveLng)}
          label="Naviguer vers la récupération"
          color="amber"
        />
        {destLabel && (
          <p className="text-xs text-center text-amber-700 truncate">{destLabel}</p>
        )}
        {(BtnAppel || BtnWhatsApp) && (
          <div className="flex gap-2">{BtnAppel}{BtnWhatsApp}</div>
        )}
      </div>
    );
  }

  // ── PHASE LIVRAISON ─────────────────────────────────────────────────────────

  // Bandeau statut destinataire
  const DestStatut = () => {
    if (destLoading) return null;
    if (destGpsActif) {
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
        {(BtnAppel || BtnWhatsApp) && (
          <div className="flex gap-2">{BtnAppel}{BtnWhatsApp}</div>
        )}
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

      {/* ETA + distance — seulement si valeurs réelles > 0 */}
      {dist !== null && dist > 0 && (
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
  return (
    <div className="flex items-center gap-4">
      {dist !== null && (
        <div className="flex items-center gap-1.5">
          <Ruler className={cn("w-4 h-4", iconColor)} />
          <span className={cn("text-sm font-bold", textColor)}>
            {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}
          </span>
        </div>
      )}
      {eta !== null && (
        <div className="flex items-center gap-1.5">
          <Clock className={cn("w-4 h-4", iconColor)} />
          <span className={cn("text-sm font-bold", textColor)}>
            {eta <= 1 ? "~1 min" : `~${eta} min`}
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