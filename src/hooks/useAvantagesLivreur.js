import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

/**
 * useAvantagesLivreur — détermine si le livreur a un Pass Zéro Commission
 * ou un Happy Hour actif à l'instant T.
 *
 * Retourne :
 *   - passActif: { expiration_at, nom } | null
 *   - happyHourActif: { fin_at, taux, nom } | null
 *   - isRedTheme: boolean (true si au moins un avantage actif)
 *   - refresh: function
 */
export function useAvantagesLivreur(livreurId, countryCode) {
  const [passActif, setPassActif] = useState(null);
  const [happyHourActif, setHappyHourActif] = useState(null);

  const checkAvantages = async () => {
    if (!livreurId || !countryCode) return;

    // Vérifier Pass actif
    try {
      const achats = await base44.entities.PassAchat.filter({
        livreur_id: livreurId,
        statut: "valide",
      }).catch(() => []);

      const now = new Date();
      let passFound = null;
      for (const achat of achats || []) {
        if (!achat.debut_at || !achat.expiration_at) continue;
        const debut = new Date(achat.debut_at);
        const fin = new Date(achat.expiration_at);
        if (now >= debut && now < fin) {
          passFound = {
            expiration_at: achat.expiration_at,
            nom: achat.pass_offer_nom,
          };
          break;
        }
      }
      setPassActif(passFound);
    } catch {
      setPassActif(null);
    }

    // Vérifier Happy Hour actif
    try {
      const configs = await base44.entities.HappyHourConfig.filter({
        country_code: countryCode,
        actif: true,
      }).catch(() => []);

      const now = new Date();
      let hhFound = null;
      for (const config of configs || []) {
        if (!config.heure_debut || !config.heure_fin) continue;
        const tz = config.fuseau_horaire || "Africa/Ouagadougou";
        const localTime = new Date(now.toLocaleString("en-US", { timeZone: tz }));

        if (config.recurrence === "hebdomadaire" && config.jour_semaine != null) {
          if (localTime.getDay() !== Number(config.jour_semaine)) continue;
        } else if (config.recurrence === "unique" && config.date_specifique) {
          const dateStr = localTime.toISOString().slice(0, 10);
          if (dateStr !== config.date_specifique) continue;
        }

        const hh = String(localTime.getHours()).padStart(2, "0");
        const mm = String(localTime.getMinutes()).padStart(2, "0");
        const timeStr = `${hh}:${mm}`;

        if (timeStr >= config.heure_debut && timeStr < config.heure_fin) {
          const [finH, finM] = config.heure_fin.split(":").map(Number);
          localTime.setHours(finH, finM, 0, 0);
          hhFound = {
            fin_at: localTime.toISOString(),
            taux: Number(config.taux_promotionnel) || 0,
            nom: config.nom,
          };
          break;
        }
      }
      setHappyHourActif(hhFound);
    } catch {
      setHappyHourActif(null);
    }
  };

  useEffect(() => {
    checkAvantages();
    const interval = setInterval(checkAvantages, 60000);
    return () => clearInterval(interval);
  }, [livreurId, countryCode]);

  const isRedTheme = !!(passActif || happyHourActif);

  return { passActif, happyHourActif, isRedTheme, refresh: checkAvantages };
}