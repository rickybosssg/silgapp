import React, { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { Search, Loader2 } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════
// AdminAddressAutocomplete — Suggestions d'adresses pour création de course admin
// ═══════════════════════════════════════════════════════════════════════
//
// Priorité des résultats :
//   1. Quartiers SILGAPP (entité Quartier) — correspondance exacte ou quasi-exacte
//   2. Autres quartiers SILGAPP correspondant partiellement
//   3. POI / établissements / adresses du géocodeur externe (ORS)
//
// Recherche locale : nom, nom_affiche, variantes — insensible à la casse,
// aux accents et aux espaces supplémentaires.
// Déduction : consolidation par nom_affiche / quartier_parent.
// Isolation : filtrage strict par country_code (jamais de mélange entre pays).
//
// GPS quartier = secours. Une adresse précise sélectionnée conserve ses
// coordonnées exactes (non écrasées par le GPS quartier).
// ═══════════════════════════════════════════════════════════════════════

// ── Normalisation : minuscules, sans accents, espaces collapsés ──
function normalizeStr(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Recherche locale dans l'entité Quartier ──
// Retourne les quartiers correspondants, triés par pertinence décroissante.
function searchQuartiersLocal(quartiers, query) {
  const q = normalizeStr(query);
  if (!q) return [];

  const matches = [];
  const seenAffiche = new Set();

  for (const qu of quartiers) {
    const nom = normalizeStr(qu.nom);
    const nomAffiche = normalizeStr(qu.nom_affiche || qu.nom);
    const variantesRaw = normalizeStr(qu.variantes || "");
    const variantesList = variantesRaw
      ? variantesRaw.split(",").map((v) => v.trim()).filter(Boolean)
      : [];

    // ── Critères de correspondance ──
    const nomExact = nom === q || nomAffiche === q;
    const nomStartsWith = nom.startsWith(q) || nomAffiche.startsWith(q);
    const nomIncludes = nom.includes(q) || nomAffiche.includes(q);
    const varianteExact = variantesList.some((v) => v === q);
    const varianteStartsWith = variantesList.some((v) => v.startsWith(q));
    const varianteIncludes = variantesList.some((v) => v.includes(q));

    if (!nomExact && !nomStartsWith && !nomIncludes && !varianteExact && !varianteStartsWith && !varianteIncludes)
      continue;

    // ── Déduction par nom_affiche (regroupement des zones consolidées) ──
    const dedupKey = nomAffiche || nom;
    if (seenAffiche.has(dedupKey)) continue;
    seenAffiche.add(dedupKey);

    // ── Score de pertinence ──
    let score = 0;
    if (nomExact || varianteExact) score = 100;
    else if (nomStartsWith || varianteStartsWith) score = 80;
    else if (nomIncludes) score = 60;
    else score = 50;

    matches.push({
      ...qu,
      _score: score,
      _display: qu.nom_affiche || qu.nom,
    });
  }

  matches.sort(
    (a, b) => b._score - a._score || normalizeStr(a._display).localeCompare(normalizeStr(b._display))
  );
  return matches;
}

// ── Vérifie si un résultat externe duplique un quartier déjà affiché ──
function isDuplicateExternal(result, quartierNames) {
  const rName = normalizeStr(result.label || result.name || "");
  const rQuartier = normalizeStr(result.quartier || "");
  if (!rName && !rQuartier) return false;
  for (const qn of quartierNames) {
    if (rName === qn || rQuartier === qn) return true;
    // Éviter aussi les POI dont le nom contient exactement le quartier
    if (rName.includes(qn) && rName.length - qn.length < 5) return true;
  }
  return false;
}

const MAX_SUGGESTIONS = 5;

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
  const [quartiers, setQuartiers] = useState([]);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  // ── Charger les quartiers actifs du pays (isolation stricte par country_code) ──
  useEffect(() => {
    if (!countryCode) {
      setQuartiers([]);
      return;
    }
    let cancelled = false;
    base44.entities.Quartier
      .filter({ country_code: countryCode, actif: true }, "nom", 500)
      .then((data) => {
        if (!cancelled) setQuartiers(data || []);
      })
      .catch(() => {
        if (!cancelled) setQuartiers([]);
      });
    return () => {
      cancelled = true;
    };
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

  // ── Recherche fusionnée : quartiers locaux + géocodage externe ──
  const searchAddresses = useCallback(
    async (q) => {
      if (!q || q.trim().length < 3) {
        setSuggestions([]);
        setLoading(false);
        return;
      }

      // Annuler la requête externe précédente
      if (abortRef.current) {
        abortRef.current.abort = true;
      }
      const myAbort = { abort: false };
      abortRef.current = myAbort;

      // ── 1. Recherche locale instantanée dans les quartiers ──
      const localQuartiers = searchQuartiersLocal(quartiers, q);
      const quartierNames = localQuartiers.map((qu) => normalizeStr(qu._display));

      // Construire les suggestions de quartiers immédiatement
      const quartierSuggestions = localQuartiers.map((qu) => ({
        type: "quartier",
        name: qu._display,
        label: qu._display,
        quartier: qu._display,
        ville: qu.ville || "",
        latitude: qu.latitude,
        longitude: qu.longitude,
        _score: qu._score,
      }));

      // Afficher immédiatement les résultats locaux
      if (quartierSuggestions.length > 0) {
        setSuggestions(quartierSuggestions.slice(0, MAX_SUGGESTIONS));
        setShowSuggestions(true);
        setHighlightIndex(-1);
      }

      // Si on a déjà 5 quartiers, pas besoin d'appeler le géocodeur externe
      if (quartierSuggestions.length >= MAX_SUGGESTIONS) {
        setLoading(false);
        return;
      }

      // ── 2. Géocodage externe (ORS) pour les POI et adresses précises ──
      setLoading(true);
      try {
        const res = await base44.functions.invoke("geocodeAddress", {
          query: q.trim(),
          country_code: countryCode,
        });

        if (myAbort.abort) return;

        const externalResults = res?.results || res?.data?.results || [];

        // Filtrer les doublons (POI dont le nom correspond à un quartier déjà affiché)
        const filteredExternal = externalResults.filter(
          (r) => !isDuplicateExternal(r, quartierNames)
        );

        const externalSuggestions = filteredExternal.map((r) => ({
          type: "lieu",
          name: r.name || r.label || "",
          label: r.label || r.name || "",
          quartier: r.quartier || "",
          ville: r.ville || "",
          latitude: r.latitude,
          longitude: r.longitude,
        }));

        // ── 3. Fusion : quartiers d'abord, puis lieux externes ──
        const merged = [...quartierSuggestions, ...externalSuggestions].slice(0, MAX_SUGGESTIONS);

        if (myAbort.abort) return;
        setSuggestions(merged);
        setShowSuggestions(true);
        setHighlightIndex(-1);
      } catch (err) {
        if (!myAbort.abort) {
          console.error("[AdminAddressAutocomplete] Erreur géocode:", err);
          // Garder au moins les résultats locaux
          if (quartierSuggestions.length > 0) {
            setSuggestions(quartierSuggestions.slice(0, MAX_SUGGESTIONS));
          } else {
            setSuggestions([]);
          }
        }
      } finally {
        if (!myAbort.abort) setLoading(false);
      }
    },
    [countryCode, quartiers]
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
        onFocus={() => {
          if (suggestions.length > 0) setShowSuggestions(true);
        }}
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
          {suggestions.map((r, idx) => {
            const isQuartier = r.type === "quartier";
            return (
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
                <span className="shrink-0 text-base leading-none">
                  {isQuartier ? "📍" : "🏢"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{r.label || r.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">
                    {isQuartier ? "Quartier" : "Lieu"}
                    {r.ville ? ` · ${r.ville}` : ""}
                  </p>
                </div>
                {r.ville && !isQuartier && (
                  <span className="text-[10px] text-gray-400 ml-auto shrink-0">{r.ville}</span>
                )}
              </button>
            );
          })}
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