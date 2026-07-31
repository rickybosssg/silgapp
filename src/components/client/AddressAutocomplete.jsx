import React, { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

// ── Cache en mémoire partagé entre toutes les instances ──────────────────────
const searchCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_MAX_SIZE = 200;

function cleanCache() {
  if (searchCache.size <= CACHE_MAX_SIZE) return;
  const now = Date.now();
  for (const [key, entry] of searchCache) {
    if (now - entry.timestamp > CACHE_TTL_MS * 2) searchCache.delete(key);
  }
}

/**
 * Autocomplétion d'adresses mondiale (style Yango/Uber/Bolt).
 *
 * Props:
 * - value: string — texte actuel de l'adresse
 * - onChange: (text: string) => void — appelé à chaque frappe
 * - onSelect: (result | null) => void — appelé lors d'une sélection
 *   result = { name, label, quartier, ville, pays, latitude, longitude, distance }
 * - countryCode: string — code ISO 2 lettres (BF, CI, ...) pour filtrer
 * - focusLat / focusLng: number — point de référence pour prioriser les résultats proches
 * - placeholder, label, required, hint, className, autoFocus
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  countryCode = "BF",
  focusLat,
  focusLng,
  placeholder = "Rechercher une adresse...",
  label,
  required = false,
  hint,
  className = "",
  autoFocus = false,
}) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const lastRequestIdRef = useRef(0);

  // Sync externe → interne (quand le parent change value)
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  // ── Recherche debounced ──
  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    // Vérifier le cache
    const cacheKey = `${searchQuery.trim().toLowerCase()}_${countryCode}`;
    const cached = searchCache.get(cacheKey);
    // On n'utilise le cache que s'il contient des résultats. Un cache vide
    // (hérité d'une panne transitoire ORS avant le correctif) est ignoré pour
    // forcer une nouvelle recherche.
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS && cached.results.length > 0) {
      setResults(cached.results);
      setLoading(false);
      setShowDropdown(true);
      return;
    }

    const requestId = ++lastRequestIdRef.current;
    try {
      const res = await base44.functions.invoke("geocodeAddress", {
        query: searchQuery.trim(),
        country_code: countryCode,
        focus_lat: focusLat,
        focus_lng: focusLng,
      });

      // Ignorer les réponses obsolètes (frappes plus récentes)
      if (requestId !== lastRequestIdRef.current) return;

      const searchResults = res?.results || [];
      setResults(searchResults);
      setShowDropdown(true);
      // Ne JAMAIS cacher un résultat vide — une panne transitoire d'ORS ou une
      // frappe partielle ne doit pas bloquer la recherche pendant 10 minutes.
      if (searchResults.length > 0) {
        searchCache.set(cacheKey, { results: searchResults, timestamp: Date.now() });
        cleanCache();
      }
    } catch (err) {
      console.error("[AddressAutocomplete] Erreur:", err.message);
      setResults([]);
    } finally {
      if (requestId === lastRequestIdRef.current) setLoading(false);
    }
  }, [countryCode, focusLat, focusLng]);

  // Debounce 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query && query.trim().length >= 2) {
      setLoading(true);
      debounceRef.current = setTimeout(() => {
        performSearch(query);
      }, 300);
    } else {
      setResults([]);
      setShowDropdown(false);
      setLoading(false);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, performSearch]);

  const handleInputChange = (e) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    onChange?.(newQuery);
    setHighlightIndex(-1);
  };

  const handleSelect = (result) => {
    setQuery(result.label);
    onChange?.(result.label);
    onSelect?.(result);
    setShowDropdown(false);
    setResults([]);
    setHighlightIndex(-1);
  };

  const handleClear = () => {
    setQuery("");
    onChange?.("");
    onSelect?.(null);
    setResults([]);
    setShowDropdown(false);
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex(prev => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex(prev => (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(results[highlightIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  // Fermer le dropdown au clic extérieur
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-2" ref={containerRef}>
      {label && (
        <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          {label}
          {required && <span className="text-red-500">*</span>}
          {!required && <span className="text-xs text-gray-400 font-normal">(optionnel)</span>}
        </Label>
      )}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
          {loading ? (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          ) : (
            <Search className="w-4 h-4 text-gray-400" />
          )}
        </div>
        <Input
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
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

        {/* Dropdown des résultats */}
        {showDropdown && results.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-white rounded-2xl border-2 border-gray-100 shadow-2xl max-h-72 overflow-y-auto">
            {results.map((result, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setHighlightIndex(index)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-b-0 transition-colors flex items-start gap-3 ${
                  index === highlightIndex ? "bg-primary/5" : "hover:bg-gray-50"
                }`}
              >
                <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{result.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {result.quartier && (
                      <span className="text-xs text-gray-500 truncate">{result.quartier}</span>
                    )}
                    {result.ville && (
                      <span className="text-xs text-gray-400 truncate">• {result.ville}</span>
                    )}
                    {result.distance != null && (
                      <span className="text-xs text-primary font-medium ml-auto flex-shrink-0">
                        {result.distance} km
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Aucun résultat — saisie libre */}
        {showDropdown && !loading && results.length === 0 && query.trim().length >= 2 && (
          <div className="absolute z-50 mt-1 w-full bg-white rounded-2xl border-2 border-gray-100 shadow-2xl px-4 py-3">
            <p className="text-sm text-gray-400">
              Aucun lieu trouvé pour « {query.trim()} ». Saisissez l'adresse manuellement.
            </p>
          </div>
        )}
      </div>
      {hint && <p className="text-xs text-gray-400 pl-1">{hint}</p>}
    </div>
  );
}