import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { haversineKm } from "@/lib/priceEstimate.js";

/**
 * Hook thin — appelle la fonction backend getRouteORS et retourne le résultat.
 *
 * Toute la logique métier (cache, TTL, throttling, recalcul, fallback)
 * est centralisée dans le backend (base44/functions/getRouteORS/entry.ts),
 * pilotée par SystemConfig.
 *
 * Ce hook ne fait QUE: appeler → stocker la réponse → l'exposer.
 */
export function useRouteORS({
  courseId,
  phase,
  fromLat,
  fromLng,
  toLat,
  toLng,
  countryCode,
  livreurId,
  enabled = true,
}) {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !fromLat || !fromLng || !toLat || !toLng) return;

    setLoading(true);

    base44.functions
      .invoke("getRouteORS", {
        course_id: courseId,
        livreur_id: livreurId,
        phase,
        from_lat: fromLat,
        from_lng: fromLng,
        to_lat: toLat,
        to_lng: toLng,
        country_code: countryCode,
      })
      .then((res) => {
        setRoute({
          coordinates: res.coordinates || [],
          distanceKm: res.distanceKm || 0,
          etaMinutes: res.etaMinutes || 0,
          durationSec: res.durationSec || 0,
          source: res.source || "fallback",
        });
      })
      .catch(() => {
        // Sécurité réseau uniquement — le backend gère tous les fallbacks métier
        // NE JAMAIS mettre distanceKm: 0 — calculer un fallback Haversine local
        const havDist = haversineKm(fromLat, fromLng, toLat, toLng) || 0;
        const havEta = Math.max(1, Math.round(havDist / 0.4)); // ~24 km/h moyenne urbaine
        setRoute({
          coordinates: [
            [fromLat, fromLng],
            [toLat, toLng],
          ],
          distanceKm: havDist,
          etaMinutes: havEta,
          durationSec: havEta * 60,
          source: "fallback",
        });
      })
      .finally(() => setLoading(false));
  }, [courseId, phase, fromLat, fromLng, toLat, toLng, countryCode, livreurId, enabled]);

  return { route, loading };
}