import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";

/**
 * Champ de saisie d'adresse admin (saisie libre, sans autocomplétion).
 *
 * L'autocomplétion ORS a été retirée : la base OpenStreetService ne connaissait
 * pas les quartiers précis (ex: « Ouaga 2000 ») et renvoyait des résultats
 * génériques. L'interface (props) est conservée pour ne pas casser AdminCourseForm.
 *
 * Props conservées :
 * - value, onChange, onSelect (n'est plus appelé — pas de sélection automatique)
 * - countryCode (ignoré — conservé pour compat)
 * - placeholder, iconColor, inputClassName
 * - children : bouton « Localiser » positionné à droite par le parent
 */
export default function AdminAddressAutocomplete({
  value,
  onChange,
  onSelect: _onSelect,
  countryCode: _countryCode = "BF",
  placeholder = "Saisissez l'adresse...",
  iconColor = "text-emerald-500",
  inputClassName = "",
  children,
}) {
  const [query, setQuery] = useState(value || "");

  // Sync externe → interne (quand le parent change value, ex. après localisation GPS)
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  const handleInputChange = (e) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    onChange?.(newQuery);
  };

  return (
    <div className="relative">
      <MapPin className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 z-10 ${iconColor}`} />
      <Input
        value={query}
        onChange={handleInputChange}
        placeholder={placeholder}
        className={inputClassName}
      />
      {children}
    </div>
  );
}