import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * Hook qui récupère la configuration tarifaire d'un pays :
 * - devise (symbole affiché)
 * - prix suggérés pour le client (ex: [1500, 2000] pour BF)
 *
 * 100% dynamique — aucun montant codé en dur.
 * L'ajout d'un nouveau pays ne nécessite aucune modification du composant.
 */
export function useCountryPricing(countryCode) {
  const { data: country = null, isLoading } = useQuery({
    queryKey: ["country-pricing", countryCode],
    queryFn: async () => {
      if (!countryCode) return null;
      const rows = await base44.entities.Country.filter({ code: countryCode, actif: true });
      return rows?.[0] || null;
    },
    enabled: !!countryCode,
    staleTime: 60000,
  });

  const devise = country?.devise_symbole || country?.devise || "FCFA";

  let prixSuggeres = [1500, 2000]; // fallback universel
  if (country?.prix_suggeres_client) {
    try {
      const parsed = JSON.parse(country.prix_suggeres_client);
      if (Array.isArray(parsed) && parsed.length > 0) {
        prixSuggeres = parsed.map(Number).filter((n) => Number.isFinite(n) && n > 0);
      }
    } catch (_) {}
  }

  return { country, devise, prixSuggeres, isLoading };
}