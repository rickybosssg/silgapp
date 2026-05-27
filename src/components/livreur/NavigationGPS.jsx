import React, { useState, useEffect } from "react";
import { Navigation, MapPin, Phone, Clock, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";

// Calcul distance haversine
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

// ETA à moto (vitesse moyenne ~25 km/h en ville)
function computeETA(distKm) {
  if (!distKm || distKm <= 0) return null;
  return Math.round((distKm / 25) * 60); // en minutes
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

/**
 * NavigationGPS — bouton de navigation + ETA pour le livreur externe
 *
 * Props:
 *   phase: "recuperation" | "livraison"
 *   destLat, destLng: coordonnées destination
 *   destLabel: texte adresse destination
 *   destinataire_telephone: pour appel si destination inconnue
 *   destinationInconnue: boolean
 */
export default function NavigationGPS({ phase, destLat, destLng, destLabel, destinataireTelephone, destinationInconnue }) {
  const [livreurPos, setLivreurPos] = useState(null);
  const [dist, setDist] = useState(null);
  const [eta, setEta] = useState(null);

  // Suivi GPS livreur
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLivreurPos(p);
        const d = haversine(p.lat, p.lng, destLat, destLng);
        if (d !== null) {
          setDist(d);
          setEta(computeETA(d));
        }
      },
      null,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [destLat, destLng]);

  const canNavigate = destLat && destLng;
  const isRecup = phase === "recuperation";

  // Cas destination inconnue
  if (destinationInconnue && phase === "livraison") {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-orange-500" />
          <p className="text-sm font-bold text-orange-800">Destination non encore définie</p>
        </div>
        <p className="text-xs text-orange-700">Contactez le destinataire pour obtenir sa position exacte.</p>
        {destinataireTelephone && (
          <div className="flex gap-2">
            <a
              href={`tel:${destinataireTelephone}`}
              className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-blue-100 text-blue-700 font-semibold text-xs border border-blue-200"
            >
              <Phone className="w-4 h-4" />
              Appeler destinataire
            </a>
            <button
              onClick={() => {
                const num = destinataireTelephone?.replace(/\D/g, "") || "";
                window.location.href = `whatsapp://send?phone=${num}`;
                setTimeout(() => window.open(`https://wa.me/${num}`, "_blank"), 1500);
              }}
              className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-green-100 text-green-700 font-semibold text-xs border border-green-200"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-green-600">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp destinataire
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!canNavigate) return null;

  return (
    <div className={cn(
      "rounded-2xl p-4 space-y-3 border",
      isRecup
        ? "bg-amber-50 border-amber-200"
        : "bg-green-50 border-green-200"
    )}>
      {/* ETA + distance */}
      {(dist !== null || eta !== null) && (
        <div className="flex items-center gap-4">
          {dist !== null && (
            <div className="flex items-center gap-1.5">
              <Ruler className={cn("w-4 h-4", isRecup ? "text-amber-600" : "text-green-600")} />
              <span className={cn("text-sm font-bold", isRecup ? "text-amber-800" : "text-green-800")}>
                {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}
              </span>
            </div>
          )}
          {eta !== null && (
            <div className="flex items-center gap-1.5">
              <Clock className={cn("w-4 h-4", isRecup ? "text-amber-600" : "text-green-600")} />
              <span className={cn("text-sm font-bold", isRecup ? "text-amber-800" : "text-green-800")}>
                {eta <= 1 ? "~1 min" : `~${eta} min`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Bouton navigation */}
      <button
        onClick={() => openGoogleMaps(livreurPos?.lat, livreurPos?.lng, destLat, destLng)}
        className={cn(
          "w-full flex items-center justify-center gap-2 h-12 rounded-2xl font-black text-sm text-white shadow-lg active:scale-[0.98] transition-all",
          isRecup
            ? "bg-gradient-to-b from-amber-500 to-amber-600 shadow-amber-200"
            : "bg-gradient-to-b from-green-500 to-green-700 shadow-green-200"
        )}
      >
        <Navigation className="w-5 h-5" />
        {isRecup ? "Naviguer vers la récupération" : "Naviguer vers la livraison"}
      </button>

      {destLabel && (
        <p className="text-xs text-center text-muted-foreground truncate">{destLabel}</p>
      )}
    </div>
  );
}