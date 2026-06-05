import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Hook : poll le GPS live du destinataire depuis ClientExterne (toutes les 8s).
 * Même logique que useContactLive dans NavigationGPS.
 * Retourne { gpsLat, gpsLng, lastUpdate, loading }
 * Si aucun GPS live → gpsLat/gpsLng = null (fallback à la charge du parent)
 */
function normalizePhone(num) {
  const n = (num || "").replace(/\D/g, "");
  if (n.startsWith("226") && n.length === 11) return n;
  if (n.length === 8) return "226" + n;
  if (n.startsWith("0") && n.length === 9) return "226" + n.slice(1);
  return n;
}

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
    const norm = normalizePhone(tel);
    const local = norm.startsWith("226") ? norm.slice(3) : norm;
    try {
      let res = await base44.entities.ClientExterne.filter({ telephone: local });
      if (!res?.length && local !== norm) {
        res = await base44.entities.ClientExterne.filter({ telephone: norm });
      }
      if (res?.length > 0) {
        const client = res[0];
        if (client.latitude && client.longitude) {
          setState({
            gpsLat: client.latitude,
            gpsLng: client.longitude,
            lastUpdate: client.updated_date || client.created_date,
            loading: false,
          });
          return;
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