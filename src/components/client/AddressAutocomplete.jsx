import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { MapPin, Search, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Champ de saisie d'adresse client avec suggestions de quartiers en temps réel.
 *
 * Comportement identique à AdminAddressAutocomplete :
 * - Suggestions de quartiers filtrés par pays (countryCode)
 * - Auto-remplissage du GPS (latitude/longitude) à la sélection
 * - Création automatique d'un nouveau quartier si introuvable (géocodage via geocodeAddress)
 * - Fallback sur la base Quartiers si ORS ne retourne rien
 * - Navigation clavier (flèches, Entrée, Échap)
 *
 * Props:
 * - value, onChange, onSelect(result: { latitude, longitude, quartier, ville, label } | null)
 * - countryCode: code pays pour filtrer les quartiers
 * - focusLat, focusLng: coordonnées de focalisation (ignorées — conservées pour compat)
 * - placeholder, label, required, hint, className, autoFocus
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  countryCode = "BF",
  focusLat: _focusLat,
  focusLng: _focusLng,
  placeholder = "Saisissez l'adresse...",
  label,
  required = false,
  hint,
  className = "",
  autoFocus = false,
}) {
  const [quartiers, setQuartiers] = useState([]);
  const [query, setQuery] = useState(value || "");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [creating, setCreating] = useState(false);
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

  const handleCreateQuartier = async () => {
    const nomQuartier = query.trim();
    if (!nomQuartier || nomQuartier.length < 3) return;
    setCreating(true);
    try {
      // 1. Géocoder le quartier via geocodeAddress (ORS + fallback base Quartiers)
      const res = await base44.functions.invoke("geocodeAddress", {
        query: nomQuartier,
        country_code: countryCode,
      });

      let lat = null;
      let lng = null;
      let ville = null;

      if (res?.results && res.results.length > 0) {
        const first = res.results[0];
        lat = first.latitude;
        lng = first.longitude;
        ville = first.quartier || first.ville || first.label || null;
        if (!ville && first.label) {
          const parts = first.label.split(",");
          ville = parts.length > 1 ? parts[parts.length - 1].trim() : parts[0].trim();
        }
      }

      if (!lat || !lng) {
        onChange?.(nomQuartier);
        setShowSuggestions(false);
        toast?.error?.(`Quartier « ${nomQuartier} » non trouvé par le géocodeur`);
        return;
      }

      // 2. Enregistrer le nouveau quartier en base
      if (!countryCode) {
        toast?.error?.("Pays requis pour créer un quartier (COUNTRY_REQUIRED).");
        return;
      }
      const nouveauQuartier = await base44.entities.Quartier.create({
        country_code: countryCode,
        nom: nomQuartier,
        ville: ville || "—",
        latitude: lat,
        longitude: lng,
        actif: true,
      });

      // 3. L'ajouter à la liste locale pour qu'il apparaisse immédiatement
      setQuartiers((prev) => [...prev, nouveauQuartier]);

      // 4. Sélectionner le quartier créé (remplit l'adresse + GPS)
      setQuery(nomQuartier);
      setShowSuggestions(false);
      setHighlightIndex(-1);
      onChange?.(nomQuartier);
      if (onSelect) {
        onSelect({
          latitude: lat,
          longitude: lng,
          quartier: nomQuartier,
          ville: ville || "",
          label: nomQuartier,
        });
      }

      toast?.success?.(`Quartier « ${nomQuartier} » enregistré avec coordonnées GPS`);
    } catch (err) {
      toast?.error?.(`Erreur création quartier: ${err?.message || "inconnue"}`);
    } finally {
      setCreating(false);
    }
  };

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
        ville: qu.ville || "",
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

  const handleClear = () => {
    setQuery("");
    onChange?.("");
    onSelect?.(null);
    setShowSuggestions(false);
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
          <Search className="w-4 h-4 text-gray-400" />
        </div>
        <Input
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (query.trim()) setShowSuggestions(true); }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
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

        {/* Suggestions de quartiers */}
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

        {/* Création d'un nouveau quartier s'il n'existe pas en base */}
        {showSuggestions && suggestions.length === 0 && query.trim().length >= 3 && !creating && (
          <button
            type="button"
            onClick={handleCreateQuartier}
            className="absolute z-50 mt-1 w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left rounded-xl bg-white border border-primary/30 shadow-lg hover:bg-primary/5 transition-colors"
          >
            <Plus className="w-4 h-4 text-primary shrink-0" />
            <span className="text-gray-700">
              Créer « <span className="font-medium text-primary">{query.trim()}</span> » et rechercher ses coordonnées
            </span>
          </button>
        )}

        {/* Loading pendant la création */}
        {creating && (
          <div className="absolute z-50 mt-1 w-full flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl bg-white border border-primary/30 shadow-lg">
            <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
            <span className="text-gray-600">Recherche des coordonnées…</span>
          </div>
        )}
      </div>
      {hint && <p className="text-xs text-gray-400 pl-1">{hint}</p>}
    </div>
  );
}