import React from "react";
import { Navigation, Clock, AlertTriangle, WifiOff } from "lucide-react";
import { useETACourse } from "@/hooks/useETACourse";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * AdminETABadge — badge ETA compact pour les écrans admin.
 * Utilise useETACourse (source unique d'ETA).
 * ORS prioritaire, Haversine fallback, GPS stale géré.
 */
export default function AdminETABadge({ course }) {
  const isLivraison = ["en_livraison", "arrivee"].includes(course?.statut);
  const isColisRecupere = ["colis_recupere", "passager_embarque", "pris_en_charge"].includes(course?.statut);
  const isActive = ["livreur_en_route", "arrive_prise_en_charge", "colis_recupere", "passager_embarque", "pris_en_charge", "en_livraison"].includes(course?.statut);

  // Fetch livreur position
  const { data: livreur } = useQuery({
    queryKey: ["admin-eta-livreur", course?.livreur_id],
    queryFn: () => base44.entities.Livreur.get(course.livreur_id),
    enabled: !!course?.livreur_id && isActive,
    staleTime: 5000,
    refetchInterval: isActive ? 10000 : false,
  });

  const fromLat = livreur?.latitude || null;
  const fromLng = livreur?.longitude || null;
  const toLat = isLivraison ? course.gps_arrivee_lat : course.gps_depart_lat;
  const toLng = isLivraison ? course.gps_arrivee_lng : course.gps_depart_lng;

  const { etaMinutes, distanceKm, isRoadBased, isStale, staleLabel } = useETACourse({
    courseId: course?.id,
    phase: isLivraison ? "livraison" : "recuperation",
    fromLat,
    fromLng,
    toLat: toLat || null,
    toLng: toLng || null,
    countryCode: course?.country_code,
    livreurId: course?.livreur_id,
    livreurLastUpdate: livreur?.derniere_position_date || livreur?.last_seen_at || null,
  });

  if (!course?.livreur_id || !isActive) return null;

  // GPS critique (>5min)
  if (isStale && staleLabel?.includes("indisponible")) {
    return (
      <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
        <WifiOff className="w-3 h-3 text-red-600" />
        <span className="text-[10px] font-bold text-red-700">GPS indispo.</span>
      </div>
    );
  }

  // GPS stale (2-5min)
  if (isStale) {
    return (
      <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1">
        <AlertTriangle className="w-3 h-3 text-orange-600" />
        {etaMinutes != null ? (
          <span className="text-[10px] font-bold text-orange-700">{etaMinutes} min (figé)</span>
        ) : (
          <span className="text-[10px] font-bold text-orange-700">GPS stale</span>
        )}
      </div>
    );
  }

  if (etaMinutes == null) {
    return (
      <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
        <Clock className="w-3 h-3 text-blue-600 animate-pulse" />
        <span className="text-[10px] font-bold text-blue-700">En route...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
      <Navigation className="w-3 h-3 text-blue-600" />
      <span className="text-[10px] font-bold text-blue-700">{etaMinutes} min</span>
      {distanceKm != null && (
        <span className="text-[9px] text-blue-500">{distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m` : `${distanceKm.toFixed(1)}km`}</span>
      )}
      {isRoadBased && (
        <span className="text-[8px] bg-green-100 text-green-700 font-bold px-1 rounded-full">route</span>
      )}
    </div>
  );
}
