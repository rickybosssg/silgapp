import React, { useEffect, useId, useRef, useState } from "react";
import { Building2, Loader2, MapPin, Pill, Plus, Search, Store, UtensilsCrossed } from "lucide-react";
import {
  getCachedLocationSuggestions,
  searchLocationSuggestions,
  refreshCountryLocationIndex,
} from "@/lib/locationSearch";
import AddLieuDialog from "@/components/location/AddLieuDialog";

const TYPE_META = {
  quartier: { label: "Quartier", icon: MapPin, color: "text-emerald-600 bg-emerald-50" },
  boutique: { label: "Boutique", icon: Store, color: "text-violet-600 bg-violet-50" },
  restaurant: { label: "Restaurant", icon: UtensilsCrossed, color: "text-rose-600 bg-rose-50" },
  pharmacie: { label: "Pharmacie", icon: Pill, color: "text-blue-800 bg-blue-50" },
  adresse: { label: "Adresse", icon: Building2, color: "text-sky-700 bg-sky-50" },
  lieu_silgapp: { label: "Lieu", icon: Building2, color: "text-indigo-600 bg-indigo-50" },
};

export default function SmartAddressInput({
  countryCode,
  value = "",
  onChange,
  onSelect,
  label,
  placeholder = "Commencez à saisir un quartier, une adresse ou une structure...",
  required = false,
  hint,
  className = "",
  inputClassName = "",
  labelClassName = "",
  autoFocus = false,
  children,
  enableAddLieu = false,
  onLieuAdded,
  iconClassName = "text-gray-400",
}) {
  const listboxId = useId();
  const containerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Empêche la réouverture de la liste après sélection d'une suggestion.
  // Sans ce flag, l'useEffect ci-dessous rouvrirait la liste car `value`
  // change suite à la sélection, déclenchant le cache + setOpen(true).
  const justSelectedRef = useRef(false);
  const [showAddLieu, setShowAddLieu] = useState(false);

  useEffect(() => {
    // Si la valeur vient d'être définie par une sélection, ne pas rouvrir la liste.
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      setLoading(false);
      return undefined;
    }

    const query = value.trim();
    if (!countryCode || query.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return undefined;
    }

    const cached = getCachedLocationSuggestions(countryCode, query);
    setSuggestions(cached);

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchLocationSuggestions(countryCode, query, controller.signal);
        setSuggestions(results);
      } catch (error) {
        if (error?.name !== "AbortError") setSuggestions(cached);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [countryCode, value]);

  useEffect(() => {
    const closeOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  const choose = (item) => {
    const selectedValue = item.address || item.label;
    justSelectedRef.current = true;
    onChange?.(selectedValue, item);
    onSelect?.(item);
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative space-y-2 ${className}`}>
      {label && (
        <label className={`text-sm font-semibold text-gray-700 ${labelClassName}`}>
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}

      <div className="relative">
        <Search className={`pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 ${iconClassName}`} />
        <input
          value={value}
          onChange={(event) => {
            onChange?.(event.target.value, null);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => value.trim().length >= 2 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          className={`h-14 w-full rounded-2xl border-2 border-gray-200 bg-gray-50 py-3 pl-10 pr-10 text-base font-medium text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 ${inputClassName}`}
        />
        {loading && (
          <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-600" />
        )}
        {children}
      </div>

      {hint && <p className="pl-1 text-xs text-gray-500">{hint}</p>}

      {open && value.trim().length >= 2 && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-[80] mt-1 max-h-80 w-full overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-2xl"
        >
          {suggestions.length > 0 ? (
            suggestions.map((item, index) => {
              const meta = TYPE_META[item.type] || TYPE_META.adresse;
              const Icon = meta.icon;
              return (
                <button
                  key={item.id || `${item.type}:${item.label}:${index}`}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => choose(item)}
                  className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${
                    activeIndex === index ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  <span className={`mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl ${meta.color}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-gray-900">{item.label}</span>
                    <span className="mt-0.5 block line-clamp-2 text-xs leading-4 text-gray-500">
                      {item.address || [item.quartier, item.ville].filter(Boolean).join(", ")}
                    </span>
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-600">
                    {meta.label}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-3">
              <p className="text-sm font-semibold text-gray-700">Aucune suggestion trouvée</p>
              <p className="mt-1 text-xs text-gray-500">
                Vous pouvez conserver cette adresse et continuer manuellement.
              </p>
              {enableAddLieu && (
                <button
                  type="button"
                  onClick={() => setShowAddLieu(true)}
                  className="mt-2 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter ce lieu
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {enableAddLieu && (
        <AddLieuDialog
          open={showAddLieu}
          onClose={() => setShowAddLieu(false)}
          countryCode={countryCode}
          initialName={value}
          onCreated={async (lieu) => {
            setShowAddLieu(false);
            await refreshCountryLocationIndex(countryCode, true);
            const item = {
              id: lieu.id,
              type: "lieu_silgapp",
              label: lieu.nom,
              address: lieu.adresse || lieu.nom,
              quartier: lieu.quartier || "",
              ville: lieu.ville || "",
              latitude: lieu.latitude,
              longitude: lieu.longitude,
              precisionGps: lieu.precision_gps,
              source: "silgapp",
            };
            choose(item);
            onLieuAdded?.(lieu);
          }}
        />
      )}
    </div>
  );
}