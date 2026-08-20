import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { MapPin, Search, X } from "lucide-react";
import { searchQuartiers, resolveQuartier } from "@/lib/quartierResolver";

/**
 * QuartierSelect — champ de recherche avec suggestions en temps réel.
 *
 * L'admin tape le nom d'un quartier et une liste filtrée apparaît.
 * Quand un quartier connu est sélectionné, son GPS est auto-rempli.
 *
 * Props:
 * - countryCode (string): code pays pour filtrer les quartiers
 * - value (string): valeur actuelle
 * - onChange (function): callback avec le nom du quartier
 * - onGpsSelect (function): callback optionnel avec {lat, lng} quand un quartier connu est matché
 * - placeholder (string): placeholder du champ
 * - label (string): label optionnel
 * - required (boolean): champ requis (default false)
 */
export default function QuartierSelect({
  countryCode,
  value = "",
  onChange,
  onGpsSelect,
  placeholder = "Tapez le nom d'un quartier...",
  label = "Quartier",
  required = false,
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
      .then((data) => {
        if (!cancelled) setQuartiers(data || []);
      })
      .catch(() => { if (!cancelled) setQuartiers([]); });
    return () => { cancelled = true; };
  }, [countryCode]);

  // Sync la valeur externe vers l'input
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

  // ── Suggestions filtrées par la requête (normalisé + fuzzy) ──
  const suggestions = React.useMemo(() => {
    return searchQuartiers(query, quartiers, 50);
  }, [query, quartiers]);

  // ── Auto-remplir le GPS quand un quartier connu est matché ──
  const tryAutoFillGps = (nom) => {
    if (!nom || !onGpsSelect) return;
    const result = resolveQuartier(nom, quartiers);
    if (result.match && result.match.latitude && result.match.longitude) {
      onGpsSelect({ lat: result.match.latitude, lng: result.match.longitude });
    }
  };

  const handleSelect = (nom) => {
    setQuery(nom);
    setShowSuggestions(false);
    setHighlightIndex(-1);
    onChange(nom);
    tryAutoFillGps(nom);
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setShowSuggestions(true);
    setHighlightIndex(-1);
    onChange(val);
    tryAutoFillGps(val);
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
      handleSelect(suggestions[highlightIndex].nom);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setShowSuggestions(false);
    onChange("");
    if (onGpsSelect) onGpsSelect(null);
  };

  return (
    <div className="space-y-2">
      {label && (
        <p className="text-xs font-semibold text-gray-500">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
          {!required && <span className="text-gray-400 font-normal text-[10px] ml-1">(optionnel)</span>}
        </p>
      )}

      <div className="relative" ref={containerRef}>
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
        <Input
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          placeholder={placeholder}
          autoComplete="off"
          className="rounded-xl h-12 pl-10 pr-9 bg-gray-50 border-gray-200 text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl bg-white border border-gray-200 shadow-lg">
            {suggestions.map((q, idx) => (
              <button
                key={q.id || idx}
                type="button"
                onClick={() => handleSelect(q.nom)}
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

        {showSuggestions && query.trim() && suggestions.length === 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-xl bg-white border border-gray-200 shadow-lg px-4 py-3 text-sm text-gray-400">
            Aucun quartier trouvé. Vous pouvez utiliser « {query} » tel quel.
          </div>
        )}
      </div>
    </div>
  );
}