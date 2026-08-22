import React, { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { MapPin, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Champ de saisie d'adresse admin avec suggestions live du géocodeur ORS.
 *
 * Au lieu de proposer des quartiers depuis la base locale (qui est souvent
 * incomplète), ce composant interroge le géocodeur en temps réel et affiche
 * les résultats. Sélectionner un résultat remplit l'adresse + le GPS.
 *
 * Props:
 * - value, onChange
 * - onSelect(result): appelé avec { latitude, longitude, quartier, ville, label } quand une adresse est sélectionnée
 * - countryCode: code pays pour filtrer les résultats
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
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

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

  // ── Recherche live via geocodeAddress (debounce 350ms) ──
  const searchAddresses = useCallback(
    async (q) => {
      if (!q || q.trim().length < 3) {
        setSuggestions([]);
        setLoading(false);
        return;
      }

      // Annuler la requête précédente
      if (abortRef.current) {
        abortRef.current.abort = true;
      }
      const myAbort = { abort: false };
      abortRef.current = myAbort;

      setLoading(true);
      try {
        const res = await base44.functions.invoke("geocodeAddress", {
          query: q.trim(),
          country_code: countryCode,
        });

        if (myAbort.abort) return;

        const results = res?.results || res?.data?.results || [];
        setSuggestions(results.slice(0, 8));
        setShowSuggestions(true);
        setHighlightIndex(-1);
      } catch (err) {
        if (!myAbort.abort) {
          console.error("[AdminAddressAutocomplete] Erreur géocode:", err);
          setSuggestions([]);
        }
      } finally {
        if (!myAbort.abort) setLoading(false);
      }
    },
    [countryCode]
  );

  // Debounce la recherche
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      searchAddresses(q);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchAddresses]);

  const handleSelect = (result) => {
    const label = result.label || result.name || result.quartier || "";
    setQuery(label);
    setShowSuggestions(false);
    setHighlightIndex(-1);
    onChange?.(label);
    if (onSelect && result.latitude && result.longitude) {
      onSelect({
        latitude: result.latitude,
        longitude: result.longitude,
        quartier: result.quartier || result.name || "",
        ville: result.ville || "",
        label,
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
        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />
      {children}

      {/* Loading indicator */}
      {loading && (
        <div className="force-light absolute right-24 top-1/2 -translate-y-1/2 z-20">
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        </div>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div className="force-light absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl bg-white border border-gray-200 shadow-lg">
          {suggestions.map((r, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelect(r)}
              onMouseEnter={() => setHighlightIndex(idx)}
              className={`flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm transition-colors ${
                idx === highlightIndex
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              } ${idx > 0 ? "border-t border-gray-50" : ""}`}
            >
              <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="truncate">{r.label || r.name}</p>
              </div>
              {r.ville && (
                <span className="text-[10px] text-gray-400 ml-auto shrink-0">{r.ville}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Aucun résultat trouvé — proposer d'utiliser la carte */}
      {showSuggestions && !loading && suggestions.length === 0 && query.trim().length >= 3 && (
        <div className="force-light absolute z-50 mt-1 w-full rounded-xl bg-white border border-gray-200 shadow-lg p-3 space-y-2">
          <p className="text-xs text-gray-500 text-center">
            Aucune adresse trouvée pour « {query.trim()} »
          </p>
          <p className="text-[11px] text-gray-400 text-center">
            Utilisez le bouton <span className="font-semibold text-gray-600">Localiser</span> pour
            placer le point sur la carte et récupérer le GPS.
          </p>
        </div>
      )}
    </div>
  );
}