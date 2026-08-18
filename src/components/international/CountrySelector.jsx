import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Liste de secours — utilisée uniquement si la requête BDD échoue
const PAYS_FALLBACK = [
  { code: "BF", nom: "Burkina Faso", emoji_flag: "🇧🇫", ordre: 1 },
  { code: "CI", nom: "Côte d'Ivoire", emoji_flag: "🇨🇮", ordre: 2 },
  { code: "TG", nom: "Togo", emoji_flag: "🇹🇬", ordre: 3 },
  { code: "GH", nom: "Ghana", emoji_flag: "🇬🇭", ordre: 4 },
  { code: "BJ", nom: "Bénin", emoji_flag: "🇧🇯", ordre: 5 },
  { code: "SN", nom: "Sénégal", emoji_flag: "🇸🇳", ordre: 6 },
  { code: "ML", nom: "Mali", emoji_flag: "🇲🇱", ordre: 7 },
  { code: "GN", nom: "Guinée", emoji_flag: "🇬🇳", ordre: 8 },
  { code: "NE", nom: "Niger", emoji_flag: "🇳🇪", ordre: 9 },
  { code: "CM", nom: "Cameroun", emoji_flag: "🇨🇲", ordre: 10 },
  { code: "GA", nom: "Gabon", emoji_flag: "🇬🇦", ordre: 11 },
  { code: "TD", nom: "Tchad", emoji_flag: "🇹🇩", ordre: 12 },
  { code: "NG", nom: "Nigeria", emoji_flag: "🇳🇬", ordre: 13 },
  { code: "CA", nom: "Canada", emoji_flag: "🇨🇦", ordre: 14 },
];

// Hook pour récupérer les pays actifs — dynamique depuis la BDD avec fallback de secours
export function usePaysActifs() {
  const { data: pays = [], isLoading, error } = useQuery({
    queryKey: ["pays-actifs"],
    queryFn: async () => {
      const result = await base44.entities.Country.filter({ actif: true }, "ordre");
      return Array.isArray(result) && result.length > 0 ? result : PAYS_FALLBACK;
    },
    initialData: [],
    staleTime: 60000,
    retry: 2,
    refetchOnMount: true,
  });

  // Fallback si la requête échoue ou retourne vide
  const paysFinal = (!pays || pays.length === 0) ? PAYS_FALLBACK : pays;

  return { pays: paysFinal, isLoading, error };
}

// Sélecteur de pays avec Select stylisé (mobile-friendly)
export default function CountrySelector({ value, onChange, className = "" }) {
  const { pays, isLoading } = usePaysActifs();
  const [isOpen, setIsOpen] = useState(false);

  const selectedCountry = pays.find(p => p.code === value);

  return (
    <div className={cn("relative", className)}>
      {/* Bouton déclencheur */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 w-full px-3 py-2 rounded-lg border border-white/20 bg-white text-gray-900 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all"
      >
        <span className="flex items-center gap-2">
          <span className="text-lg">{selectedCountry?.emoji_flag || ""}</span>
          <span>{isLoading ? "Chargement..." : selectedCountry?.nom || "Tous les pays"}</span>
        </span>
        <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto text-gray-900">
            {/* Option "Tous les pays" */}
            <button
              type="button"
              onClick={() => { onChange(""); setIsOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-900 hover:bg-gray-100 transition-colors",
                !value && "bg-gray-100"
              )}
              >
              <span className="text-lg"></span>
              <span className="flex-1 text-left">Tous les pays</span>
              {!value && <Check className="w-4 h-4 text-primary" />}
              </button>

              {/* Liste des pays */}
              {pays.map((p) => (
              <button
              key={p.code}
              type="button"
              onClick={() => { onChange(p.code); setIsOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-900 hover:bg-gray-100 transition-colors",
                value === p.code && "bg-gray-100"
              )}
              >
                <span className="text-lg">{p.emoji_flag}</span>
                <span className="flex-1 text-left">{p.nom}</span>
                {value === p.code && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}