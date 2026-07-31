import React, { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";

// ── Cache en mémoire partagé entre les instances ──────────────────────────
const searchCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Champ adresse avec autocomplétion (ORS geocode) pour le formulaire admin.
 * Conserve l'icône MapPin à gauche + le bouton "Localiser" fourni par le parent.
 *
 * Props:
 * - value: string
 * - onChange: (text) => void
 * - onSelect: (result | null) => void  // result = { name, label, quartier, ville, latitude, longitude }
 * - countryCode: string
 * - placeholder: string
 * - iconColor: string (tailwind text color, ex: "text-emerald-500")
 * - inputClassName: string (classes du Input)
 * - children: bouton "Localiser" positionné à droite par le parent
 */
export default function AdminAddressAutocomplete({
  value,
  onChange,
  onSelect,
  countryCode = "BF",
  placeholder = "Rechercher une adresse...",
  iconColor = "text-emerald-500",
  inputClassName = "",
  children, // bouton Localiser
}) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const lastRequestIdRef = useRef(0);

  // Recherche debounced
  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const cacheKey = `${searchQuery.trim().toLowerCase()}_${countryCode}`;
    const cached = searchCache.get(cacheKey);
    // On n'utilise le cache que s'il contient des résultats. Un cache vide
    // (hérité d'une panne transitoire ORS avant le correctif) est ignoré pour
    // forcer une nouvelle recherche.
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.results.length > 0) {
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
      });
      if (requestId !== lastRequestIdRef.current) return;
      const searchResults = res?.results || [];
      setResults(searchResults);
      setShowDropdown(true);
      // Ne JAMAIS cacher un résultat vide — une panne transitoire d'ORS ou une
      // frappe partielle ne doit pas bloquer la recherche pendant 10 minutes.
      if (searchResults.length > 0) {
        searchCache.set(cacheKey, { results: searchResults, timestamp: Date.now() });
      }
    } catch (err) {
      console.error("[AdminAddressAutocomplete] Erreur:", err.message);
      setResults([]);
    } finally {
      if (requestId === lastRequestIdRef.current) setLoading(false);
    }
  }, [countryCode]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value && value.trim().length >= 2) {
      setLoading(true);
      debounceRef.current = setTimeout(() => performSearch(value), 300);
    } else {
      setResults([]);
      setShowDropdown(false);
      setLoading(false);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, performSearch]);

  const handleSelect = (result) => {
    onChange?.(result.label || result.name);
    onSelect?.(result);
    setShowDropdown(false);
    setResults([]);
    setHighlightIndex(-1);
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
    <div className="relative" ref={containerRef}>
      <MapPin className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 z-10 ${iconColor}`} />
      {loading && (
        <Loader2 className="absolute right-24 top-1/2 -translate-y-1/2 w-3.5 h-3.5 z-10 animate-spin text-gray-400" />
      )}
      <Input
        value={value}
        onChange={e => onChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setShowDropdown(true)}
        placeholder={placeholder}
        className={inputClassName}
      />
      {children}

      {/* Dropdown des suggestions */}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-2xl border-2 border-gray-100 shadow-2xl max-h-72 overflow-y-auto">
          {results.map((result, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setHighlightIndex(index)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-b-0 transition-colors flex items-start gap-3 ${
                index === highlightIndex ? "bg-rose-50" : "hover:bg-gray-50"
              }`}
            >
              <MapPin className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{result.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {result.quartier && (
                    <span className="text-xs text-gray-500 truncate">{result.quartier}</span>
                  )}
                  {result.ville && (
                    <span className="text-xs text-gray-400 truncate">• {result.ville}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Aucun résultat */}
      {showDropdown && !loading && results.length === 0 && value && value.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-2xl border-2 border-gray-100 shadow-2xl px-4 py-3">
          <p className="text-sm text-gray-400">
            Aucun lieu trouvé pour « {value.trim()} ». Saisissez l'adresse manuellement.
          </p>
        </div>
      )}
    </div>
  );
}