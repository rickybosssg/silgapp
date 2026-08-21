import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveCountries } from "@/lib/countryService";
import { Loader2, Globe } from "lucide-react";

/**
 * Sélecteur de pays — liste déroulante alimentée par l'entité Country (backend).
 * Aucune liste codée en dur. Seuls les pays actifs sont affichés.
 *
 * Props:
 * - value: code pays ISO 2 lettres (ex: "BF")
 * - onChange: callback(code)
 * - disabled: bool
 */
export default function CountrySelect({ value, onChange, disabled = false, className = "" }) {
  const { countries, loading } = useActiveCountries();
  const selected = countries.find(c => c.code === value);

  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled || loading}>
      <SelectTrigger className={`h-12 rounded-xl bg-blue-50/40 border-blue-100/50 text-sm font-medium text-gray-900 focus:ring-blue-300/50 ${className}`}>
        {loading && !value ? (
          <span className="flex items-center gap-2 text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement des pays…
          </span>
        ) : (
          <SelectValue placeholder="Sélectionnez votre pays">
            {selected ? (
              <span className="flex items-center gap-2">
                <span className="text-lg">{selected.emoji_flag}</span>
                <span>{selected.nom}</span>
                <span className="text-gray-400 font-normal ml-auto">{selected.indicatif}</span>
              </span>
            ) : (
              <span className="flex items-center gap-2 text-gray-400">
                <Globe className="h-4 w-4" /> Sélectionnez votre pays
              </span>
            )}
          </SelectValue>
        )}
      </SelectTrigger>
      <SelectContent>
        {countries.map(c => (
          <SelectItem key={c.code} value={c.code}>
            <span className="flex items-center gap-2">
              <span className="text-lg">{c.emoji_flag}</span>
              <span>{c.nom}</span>
              <span className="text-gray-400 ml-2">{c.indicatif}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}