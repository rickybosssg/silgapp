import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Indicatifs téléphoniques SILGAPP par pays (tous les pays supportés)
 */
const COUNTRY_DIALCODES = {
  BF: { code: "226", len: 8 },
  CI: { code: "225", len: 10 },
  TG: { code: "228", len: 8 },
  BJ: { code: "229", len: 8 },
  SN: { code: "221", len: 9 },
  ML: { code: "223", len: 8 },
  GN: { code: "224", len: 9 },
  NE: { code: "227", len: 8 },
};

/**
 * Génère toutes les variantes d'un numéro pour tous les pays SILGAPP.
 * Retourne un tableau [local_sans_indicatif, avec_indicatif_1, avec_indicatif_2, ...]
 * permettant de chercher dans ClientExterne sans connaître le pays a priori.
 */
function phoneVariants(num) {
  const n = (num || "").replace(/\D/g, "");
  if (!n) return [];
  const variants = new Set([n]);

  for (const { code, len } of Object.values(COUNTRY_DIALCODES)) {
    // Si le numéro commence déjà par l'indicatif → extraire la partie locale
    if (n.startsWith(code) && n.length === code.length + len) {
      variants.add(n.slice(code.length)); // local sans indicatif
      variants.add(n);                    // avec indicatif
    }
    // Si le numéro est la partie locale seule → ajouter avec indicatif
    if (n.length === len && !n.startsWith("0")) {
      variants.add(code + n);
    }
    // Cas "0XXXXXXXX" (certains pays)
    if (n.startsWith("0") && n.length === len + 1) {
      variants.add(n.slice(1));           // sans le 0
      variants.add(code + n.slice(1));    // avec indicatif
    }
  }
  return [...variants];
}

/**
 * Hook : poll le GPS live du destinataire depuis ClientExterne (toutes les 8s).
 * Compatible tous pays SILGAPP (BF, CI, TG, BJ, SN, ML, GN, NE).
 * Retourne { gpsLat, gpsLng, lastUpdate, loading }
 * Si aucun GPS live → gpsLat/gpsLng = null (fallback à la charge du parent)
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

    // Générer toutes les variantes du numéro (tous pays confondus)
    const variants = phoneVariants(tel);
    try {
      for (const variant of variants) {
        const res = await base44.entities.ClientExterne.filter({ telephone: variant });
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
          // Client trouvé mais sans GPS → stop, pas besoin de tester d'autres variantes
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