import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { phoneVariants } from "@/lib/phoneUtils";

/**
 * Hook : poll le GPS live d'un contact depuis ClientExterne (toutes les 8s).
 * Compatible tous pays SILGAPP (BF, CI, TG, BJ, SN, ML, GN, NE).
 * 2 requêtes parallèles max par poll (local + avec indicatif).
 * Retourne { gpsLat, gpsLng, lastUpdate, loading }
 */
export function useDestinataireGPS(telephone, enabled = true) {
  const [state, setState] = useState({ gpsLat: null, gpsLng: null, lastUpdate: null, loading: true });

  const telephoneRef = useRef(telephone);
  const enabledRef = useRef(enabled);
  useEffect(() => { telephoneRef.current = telephone; }, [telephone]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const fetchGps = useRef(async () => {
    const tel = telephoneRef.current;
    const en = enabledRef.current;
    if (!tel || !en) { setState(prev => ({ ...prev, loading: false })); return; }

    const variants = phoneVariants(tel);
    try {
      // Requêtes parallèles (max 2)
      const results = await Promise.all(
        variants.map(v => base44.entities.ClientExterne.filter({ telephone: v }).catch(() => []))
      );
      for (const res of results) {
        if (res?.length > 0) {
          const client = res[0];
          if (client.latitude && client.longitude) {
            setState({
              gpsLat: client.latitude,
              gpsLng: client.longitude,
              lastUpdate: client.last_seen_at || client.updated_date || client.created_date,
              loading: false,
            });
            return;
          }
          // Client trouvé sans GPS → inutile de continuer
          break;
        }
      }
    } catch (_) {}
    setState({ gpsLat: null, gpsLng: null, lastUpdate: null, loading: false });
  }).current;

  useEffect(() => {
    if (!enabled || !telephone) {
      setState({ gpsLat: null, gpsLng: null, lastUpdate: null, loading: false });
      return;
    }
    fetchGps();
    const interval = setInterval(fetchGps, 8000);
    return () => clearInterval(interval);
  }, [telephone, enabled]);

  return state;
}