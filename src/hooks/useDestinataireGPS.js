import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Indicatifs SILGAPP — tous pays supportés
 */
const DIAL_CODES = [
  { code: "226", len: 8 },  // BF
  { code: "225", len: 10 }, // CI
  { code: "228", len: 8 },  // TG
  { code: "229", len: 8 },  // BJ
  { code: "221", len: 9 },  // SN
  { code: "223", len: 8 },  // ML
  { code: "224", len: 9 },  // GN
  { code: "227", len: 8 },  // NE
];

/**
 * Retourne [local_sans_indicatif, avec_indicatif] pour un numéro donné.
 * Maximum 2 variantes → 2 requêtes parallèles max (pas de boucle séquentielle).
 */
function phoneVariants(num) {
  const n = (num || "").replace(/\D/g, "");
  if (!n) return [];
  const variants = new Set([n]);

  for (const { code, len } of DIAL_CODES) {
    // Numéro déjà avec indicatif → ajouter aussi la version locale
    if (n.startsWith(code) && n.length === code.length + len) {
      variants.add(n.slice(code.length));
      break; // indicatif identifié, inutile de continuer
    }
    // Numéro local seul → ajouter avec indicatif
    if (n.length === len && !n.startsWith("0")) {
      variants.add(code + n);
      break;
    }
    // "0XXXXXXXX" (préfixe local avec 0)
    if (n.startsWith("0") && n.length === len + 1) {
      variants.add(n.slice(1));
      variants.add(code + n.slice(1));
      break;
    }
  }
  return [...variants];
}

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
              lastUpdate: client.updated_date || client.created_date,
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