import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Hook pour récupérer les pays actifs — 100% dynamique depuis la BDD
export function usePaysActifs() {
  const { data: pays = [], isLoading } = useQuery({
    queryKey: ["pays-actifs"],
    queryFn: () => base44.entities.Country.filter({ actif: true }, "ordre"),
    initialData: [],
    staleTime: 60000,
  });
  return { pays, isLoading };
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
