import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { forteDemandeView } from '../../base44/shared/forteDemandeView.js';

/**
 * useForteDemande — Hook client pour le mode Forte Demande.
 *
 * Lit l'état Forte Demande directement depuis l'entité Country (GRATUIT).
 * Aucun appel backend facturable — 0 polling getForteDemandeStatus.
 *
 * L'hystérésis (activation/retour) est calculée côté backend par
 * getForteDemandeStatus et persistée sur Country.forte_demande_active.
 * Ce hook lit simplement l'état persisté + la config (titre, message).
 *
 * Une subscription Country met à jour l'affichage en temps réel
 * lorsque forte_demande_active change (transition de seuil).
 * La subscription ne déclenche AUCUNE fonction backend facturable.
 *
 * @param {string|null} countryCode — Code pays du client (ex: "BF")
 * @returns {{ loading: boolean, forteDemande: boolean, activeCount: null, config: object|null }}
 */
export function useForteDemande(countryCode) {
  const [loading, setLoading] = useState(true);
  const [forteDemande, setForteDemande] = useState(false);
  const [config, setConfig] = useState(null);

  const applyCountryState = (country) => {
    if (!country) return;
    const view = forteDemandeView(country);
    setForteDemande(view.active);
    setConfig(view.config);
  };

  const loadCountryState = async (cc) => {
    if (!cc) return;
    try {
      const countries = await base44.entities.Country.filter({ code: cc });
      applyCountryState((countries || [])[0]);
    } catch (err) {
      console.error("[ForteDemande] Erreur:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!countryCode) return;
    loadCountryState(countryCode);

    // ── Subscription realtime — met à jour l'affichage lorsque
    //    forte_demande_active change (transition de seuil persistée
    //    par le backend). Aucun appel backend facturable. ──
    const unsubscribe = base44.entities.Country.subscribe((event) => {
      const data = event?.data;
      if (data?.code === countryCode) {
        applyCountryState(data);
      }
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [countryCode]);

  // active_count n'est pas disponible via Country (calcul dynamique backend).
  // Non approximé, non recalculé — null côté client. Non utilisé par les consommateurs.
  return { loading, forteDemande, activeCount: null, config };
}
