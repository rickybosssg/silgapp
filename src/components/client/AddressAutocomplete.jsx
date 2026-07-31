import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, X } from "lucide-react";

/**
 * Champ de saisie d'adresse (saisie libre, sans autocomplétion).
 *
 * L'autocomplétion ORS a été retirée : la base OpenStreetService ne connaissait
 * pas les quartiers précis (ex: « Ouaga 2000 ») et renvoyait des résultats
 * génériques (ex: « Ouagadougou ») qui induisaient les utilisateurs en erreur.
 * L'interface (props) est conservée pour ne pas casser les formulaires existants.
 *
 * Props conservées :
 * - value, onChange, onSelect (appelé avec null sur effacement)
 * - countryCode, focusLat, focusLng (ignorés — conservés pour compat)
 * - placeholder, label, required, hint, className, autoFocus
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  countryCode: _countryCode = "BF",
  focusLat: _focusLat,
  focusLng: _focusLng,
  placeholder = "Saisissez l'adresse...",
  label,
  required = false,
  hint,
  className = "",
  autoFocus = false,
}) {
  const [query, setQuery] = useState(value || "");

  // Sync externe → interne (quand le parent change value)
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  const handleInputChange = (e) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    onChange?.(newQuery);
  };

  const handleClear = () => {
    setQuery("");
    onChange?.("");
    onSelect?.(null);
  };

  return (
    <div className="space-y-2">
      {label && (
        <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          {label}
          {required && <span className="text-red-500">*</span>}
          {!required && <span className="text-xs text-gray-400 font-normal">(optionnel)</span>}
        </Label>
      )}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
          <Search className="w-4 h-4 text-gray-400" />
        </div>
        <Input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`h-14 rounded-2xl border-2 border-gray-200 bg-gray-50 focus:bg-white focus:border-primary pl-10 ${query ? "pr-10" : ""} text-base font-medium shadow-sm transition-all ${className}`}
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-gray-400 pl-1">{hint}</p>}
    </div>
  );
}