import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

/**
 * useForteDemande — Hook client pour le mode Forte Demande.
 *
 * Interroge le backend toutes les 30s pour obtenir :
 *   - Le nombre de courses actives dans le pays du client
 *   - L'état Forte Demande (true/false) après hystérésis
 *   - La config (titre, message, seuils)
 *
 * L'hystérésis (activation/retour) est gérée côté backend pour garantir
 * la cohérence entre tous les clients du même pays.
 *
 * @param {string|null} countryCode — Code pays du client (ex: "BF")
 * @returns {{ loading: boolean, forteDemande: boolean, activeCount: number, config: object|null }}
 */
export function useForteDemande(countryCode) {
  const [loading, setLoading] = useState(true);
  const [forteDemande, setForteDemande] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const [config, setConfig] = useState(null);

  const checkForteDemande = async (cc) => {
    if (!cc) return;
    try {
      const res = await base44.functions.invoke("getForteDemandeStatus", {
        country_code: cc,
      });
      const data = res?.data || res;
      setForteDemande(!!data?.forte_demande);
      setActiveCount(data?.active_count || 0);
      setConfig(data?.config || null);
    } catch (err) {
      console.error("[ForteDemande] Erreur:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!countryCode) return;
    checkForteDemande(countryCode);
    // Polling 30s — léger, agrégation backend, pas de téléchargement de toutes les courses
    const interval = setInterval(() => checkForteDemande(countryCode), 30000);
    return () => clearInterval(interval);
  }, [countryCode]);

  return { loading, forteDemande, activeCount, config };
}