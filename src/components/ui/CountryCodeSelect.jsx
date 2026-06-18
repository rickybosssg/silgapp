import React, { useMemo, useState } from "react";
import { getCountryLabel, searchCountries } from "@/lib/phoneUtils";

export default function CountryCodeSelect({
  value,
  onChange,
  disabled = false,
  dark = false,
  className = "",
}) {
  const [query, setQuery] = useState("");
  const countries = useMemo(() => searchCountries(query), [query]);

  const inputClass = dark
    ? "bg-zinc-900 border-zinc-600 text-white placeholder:text-zinc-500 focus:border-red-500"
    : "bg-white border-gray-300 text-gray-900 placeholder:text-gray-500 focus:border-primary";
  const buttonBase = dark
    ? "border-zinc-700 bg-zinc-800 text-gray-100 hover:border-zinc-400"
    : "border-gray-200 bg-white text-gray-800 hover:border-primary/50";
  const buttonActive = dark
    ? "border-red-500 bg-red-600/20 text-red-200"
    : "border-primary bg-primary/10 text-primary";

  return (
    <div className={`space-y-2 ${className}`}>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        disabled={disabled}
        placeholder={value ? getCountryLabel(value) : "Rechercher un pays"}
        className={`w-full h-11 rounded-xl border-2 px-3 text-sm outline-none transition-colors disabled:opacity-60 ${inputClass}`}
      />
      <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
        {countries.map((country) => (
          <button
            key={country.code}
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange?.(country.code);
              setQuery("");
            }}
            className={`w-full min-h-11 rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold transition-all disabled:opacity-60 ${
              value === country.code ? buttonActive : buttonBase
            }`}
          >
            {getCountryLabel(country.code)}
          </button>
        ))}
        {countries.length === 0 ? (
          <p className={dark ? "text-xs text-zinc-400" : "text-xs text-gray-500"}>
            Aucun pays trouvé.
          </p>
        ) : null}
      </div>
    </div>
  );
}
