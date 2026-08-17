import React, { useState } from "react";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import { usePaysActifs } from "@/components/international/CountrySelector";
import { cn } from "@/lib/utils";

/**
 * Sélecteur de pays fermé par défaut, 100% dynamique (Country entity).
 * Affiche uniquement le pays actuel ; la liste s'ouvre au clic.
 * Format : 🇧🇫 Burkina Faso (+226)
 *
 * Réutilise le hook usePaysActifs de CountrySelector (single source of truth).
 * Pas d'option "Tous les pays" — un pays doit être sélectionné.
 */
export default function ClientCountrySelect({ value, onChange, disabled = false }) {
  const { pays, isLoading } = usePaysActifs();
  const [isOpen, setIsOpen] = useState(false);

  const selected = pays.find((p) => p.code === value);

  const handleSelect = (code) => {
    onChange?.(code);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Bouton déclencheur — fermé par défaut */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-between gap-2 w-full h-12 rounded-xl border border-gray-200 bg-white px-3 text-sm",
          "hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all",
          disabled && "opacity-60 cursor-not-allowed"
        )}
      >
        {isLoading ? (
          <span className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Chargement...
          </span>
        ) : selected ? (
          <span className="flex items-center gap-2 text-gray-900">
            <span className="text-lg">{selected.emoji_flag}</span>
            <span className="font-semibold">{selected.nom}</span>
            <span className="text-gray-500 font-medium">(+{String(selected.indicatif || "").replace("+", "")})</span>
          </span>
        ) : (
          <span className="text-gray-400">Sélectionnez votre pays</span>
        )}
        <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform flex-shrink-0", isOpen && "rotate-180")} />
      </button>

      {/* Dropdown — ouvert uniquement au clic */}
      {isOpen && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
            {pays.length === 0 && !isLoading && (
              <p className="px-4 py-3 text-sm text-gray-500">Aucun pays disponible</p>
            )}
            {pays.map((p) => (
              <button
                key={p.code}
                type="button"
                onClick={() => handleSelect(p.code)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-900 hover:bg-gray-100 transition-colors text-left",
                  value === p.code && "bg-primary/5"
                )}
              >
                <span className="text-lg flex-shrink-0">{p.emoji_flag}</span>
                <span className="flex-1 font-semibold">{p.nom}</span>
                <span className="text-gray-500 text-xs font-medium">(+{String(p.indicatif || "").replace("+", "")})</span>
                {value === p.code && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}