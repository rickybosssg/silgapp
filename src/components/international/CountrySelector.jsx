import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Données statiques de référence pour les pays supportés
export const PAYS_SILGAPP = [
  { code: "BF", nom: "Burkina Faso", indicatif: "+226", emoji_flag: "🇧🇫", devise: "FCFA", ville_principale: "Ouagadougou" },
  { code: "CI", nom: "Côte d'Ivoire", indicatif: "+225", emoji_flag: "🇨🇮", devise: "FCFA", ville_principale: "Abidjan" },
  { code: "TG", nom: "Togo", indicatif: "+228", emoji_flag: "🇹🇬", devise: "FCFA", ville_principale: "Lomé" },
  { code: "BJ", nom: "Bénin", indicatif: "+229", emoji_flag: "🇧🇯", devise: "FCFA", ville_principale: "Cotonou" },
  { code: "SN", nom: "Sénégal", indicatif: "+221", emoji_flag: "🇸🇳", devise: "FCFA", ville_principale: "Dakar" },
  { code: "ML", nom: "Mali", indicatif: "+223", emoji_flag: "🇲🇱", devise: "FCFA", ville_principale: "Bamako" },
  { code: "GN", nom: "Guinée", indicatif: "+224", emoji_flag: "🇬🇳", devise: "GNF", ville_principale: "Conakry" },
  { code: "NE", nom: "Niger", indicatif: "+227", emoji_flag: "🇳🇪", devise: "FCFA", ville_principale: "Niamey" },
];

// Hook pour récupérer les pays actifs
export function usePaysActifs() {
  const { data: pays = [] } = useQuery({
    queryKey: ["pays-actifs"],
    queryFn: () => base44.entities.Country.filter({ actif: true }, "ordre"),
    initialData: [],
    staleTime: 60000,
  });
  return pays;
}

// Sélecteur de pays (filtre)
export default function CountrySelector({ value, onChange, className = "" }) {
  const pays = usePaysActifs();

  if (pays.length <= 1) return null;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`border border-input rounded-md bg-background text-foreground px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${className}`}
    >
      <option value="">🌍 Tous les pays</option>
      {pays.map((p) => (
        <option key={p.code} value={p.code}>
          {p.emoji_flag} {p.nom}
        </option>
      ))}
    </select>
  );
}