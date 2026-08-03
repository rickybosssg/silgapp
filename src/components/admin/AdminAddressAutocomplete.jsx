import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { MapPin, Search } from "lucide-react";

/**
 * Champ de saisie d'adresse admin avec suggestions de quartiers en temps réel.
 *
 * Quand l'admin tape du texte, une liste de quartiers correspondants apparaît.
 * Sélectionner un quartier remplit l'adresse + le GPS automatiquement.
 *
 * Props:
 * - value, onChange
 * - onSelect(result): appelé avec { latitude, longitude, quartier, label } quand un quartier est sélectionné
 * - countryCode: code pays pour filtrer les quartiers
 * - placeholder, iconColor, inputClassName
 * - children: bouton « Localiser » positionné à droite par le parent
 */
export default function AdminAddressAutocomplete({
  value,
  onChange,
  onSelect,
  countryCode = "BF",
  placeholder = "Saisissez l'adresse...",
  iconColor = "text-emerald-500",
  inputClassName = "",
  children,
}) {
  const [quartiers, setQuartiers] = useState([]);
  const [query, setQuery] = useState(value || "");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef(null);

  // Charger les quartiers filtrés par pays
  useEffect(() => {
    if (!countryCode) { setQuartiers([]); return; }
    let cancelled = false;
    base44.entities.Quartier
      .filter({ country_code: countryCode, actif: true }, "nom", 500)
      .then((data) => { if (!cancelled) setQuartiers(data || []); })
      .catch(() => { if (!cancelled) setQuartiers([]); });
    return () => { cancelled = true; };
  }, [countryCode]);

  // Sync externe → interne
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  // Fermer les suggestions au clic extérieur
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Suggestions filtrées
  const suggestions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return quartiers
      .filter((qu) => qu.nom.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, quartiers]);

  const handleSelect = (qu) => {
    setQuery(qu.nom);
    setShowSuggestions(false);
    setHighlightIndex(-1);
    onChange?.(qu.nom);
    if (onSelect && qu.latitude && qu.longitude) {
      onSelect({
        latitude: qu.latitude,
        longitude: qu.longitude,
        quartier: qu.nom,
        label: qu.nom,
      });
    }
  };

  const handleInputChange = (e) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    setShowSuggestions(true);
    setHighlightIndex(-1);
    onChange?.(newQuery);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightIndex]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 z-10 ${iconColor}`} />
      <Input
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (query.trim()) setShowSuggestions(true); }}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />
      {children}

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl bg-white border border-gray-200 shadow-lg">
          {suggestions.map((q, idx) => (
            <button
              key={q.id || idx}
              type="button"
              onClick={() => handleSelect(q)}
              onMouseEnter={() => setHighlightIndex(idx)}
              className={`flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm transition-colors ${
                idx === highlightIndex
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              } ${idx > 0 ? "border-t border-gray-50" : ""}`}
            >
              <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span>{q.nom}</span>
              {q.ville && (
                <span className="text-[10px] text-gray-400 ml-auto">{q.ville}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}