import React from "react";
import { Clock, Ruler, MapPin, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { useETACourse } from "@/hooks/useETACourse";

function dureeDepuis(isoDate) {
  if (!isoDate) return null;
  const diff = Math.round((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  return `${Math.floor(diff / 3600)} h`;
}

/**
 * ETADisplay — affiche l'ETA + distance style Uber/Glovo
 *
 * Utilise useETACourse (source unique d'ETA).
 * ORS prioritaire, Haversine ÷ 25 km/h en fallback.
 * GPS <2min = live, 2-5min = figé+avertissement, >5min = masqué.
 *
 * Props:
 * livreurLat, livreurLng: position du livreur (mise à jour en temps réel)
 * targetLat, targetLng: position de la destination (récupération ou livraison)
 * livreurNom: prénom du livreur
 * phase: "vers_recuperation" | "vers_livraison"
 * statut: statut de la course
 * gpsLastUpdate: ISO date de derniere_position_date du livreur
 * courseId, countryCode, livreurId: pour l'appel ORS
 */
export default function ETADisplay({
  livreurLat,
  livreurLng,
  targetLat,
  targetLng,
  livreurNom,
  phase,
  statut,
  gpsLastUpdate,
  courseId,
  countryCode,
  livreurId,
}) {
  const isRecup = phase === "vers_recuperation";
  const prenom = livreurNom?.split(" ")[0] || "Le livreur";

  const { etaMinutes, distanceKm, isRoadBased, isStale, staleLabel } = useETACourse({
    courseId,
    phase: isRecup ? "recuperation" : "livraison",
    fromLat: livreurLat || null,
    fromLng: livreurLng || null,
    toLat: targetLat || null,
    toLng: targetLng || null,
    countryCode,
    livreurId,
    livreurLastUpdate: gpsLastUpdate,
  });

  // ── GPS critique (>5min) : ETA masqué, position indisponible ──
  if (isStale && staleLabel?.includes("indisponible")) {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
          <WifiOff className="w-5 h-5 text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-red-900 leading-tight">
            {staleLabel}
          </p>
          {gpsLastUpdate && (
            <p className="text-xs text-red-600 mt-1">
              Dernière position reçue il y a {dureeDepuis(gpsLastUpdate)}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── GPS manquant (pas de coords) ──
  if (!livreurLat || !livreurLng || !targetLat || !targetLng) {
    return (
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
          <Clock className="w-5 h-5 text-blue-600 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-blue-900 leading-tight">
            {isRecup ? `${prenom} est en route pour la récupération` : `${prenom} est en route pour la livraison`}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs text-blue-600">
              <MapPin className="w-3 h-3" />
              {isRecup ? "Vers récupération" : "Vers livraison"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── GPS obsolète (2-5min) : ETA figé + avertissement ──
  if (isStale) {
    return (
      <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-orange-600" />
        </div>
        <div className="flex-1 min-w-0">
          {etaMinutes != null ? (
            <>
              <p className="text-sm font-bold text-orange-900 leading-tight">
                {isRecup
                  ? `${prenom} arrive dans environ ${etaMinutes} min`
                  : `${prenom} arrive chez vous dans ${etaMinutes} min`}
              </p>
              <p className="text-xs text-orange-600 mt-1 font-medium">
                ⚠️ {staleLabel} — ETA figé
              </p>
            </>
          ) : (
            <p className="text-sm font-bold text-orange-900 leading-tight">{staleLabel}</p>
          )}
          {distanceKm != null && (
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-xs text-orange-600">
                <Ruler className="w-3 h-3" />
                {distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Cas normal : GPS live, ETA actif ──
  if (etaMinutes == null) {
    return (
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
          <Clock className="w-5 h-5 text-blue-600 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-blue-900 leading-tight">
            {isRecup ? `${prenom} est en route pour la récupération` : `${prenom} est en route pour la livraison`}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs text-blue-600">
              <MapPin className="w-3 h-3" />
              {isRecup ? "Vers récupération" : "Vers livraison"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const message =
    etaMinutes <= 1
      ? isRecup
        ? `${prenom} arrive dans moins d'1 min`
        : `${prenom} arrive chez vous dans moins d'1 min`
      : isRecup
        ? `${prenom} arrive dans environ ${etaMinutes} min`
        : `${prenom} arrive chez vous dans ${etaMinutes} min`;

  const freshness = dureeDepuis(gpsLastUpdate);

  return (
    <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
      <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
        <Clock className="w-5 h-5 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-blue-900 leading-tight">{message}</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="flex items-center gap-1 text-xs text-blue-600">
            <Ruler className="w-3 h-3" />
            {distanceKm < 0.1
              ? `${Math.round(distanceKm * 1000)} m`
              : distanceKm < 1
                ? `${Math.round(distanceKm * 1000)} m`
                : `${distanceKm.toFixed(1)} km`}
          </span>
          <span className="flex items-center gap-1 text-xs text-blue-600">
            <MapPin className="w-3 h-3" />
            {isRecup ? "Récupération" : "Livraison"}
          </span>
          {isRoadBased && (
            <span className="text-[9px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">
              route
            </span>
          )}
          {freshness && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <Wifi className="w-3 h-3" />
              GPS live · {freshness}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
