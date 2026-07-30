import React from "react";
import SmartAddressInput from "@/components/location/SmartAddressInput";

/**
 * Searchable country-scoped district field.
 *
 * The public API remains compatible with the former select so existing forms
 * keep storing the district name, while suggestions can include known SILGAPP
 * structures and OpenStreetMap addresses.
 */
export default function QuartierSelect({
  countryCode,
  value = "",
  onChange,
  onLocationSelect,
  placeholder = "Rechercher un quartier...",
  label = "Quartier",
  required = false,
}) {
  return (
    <SmartAddressInput
      countryCode={countryCode}
      value={value}
      label={label}
      required={required}
      placeholder={placeholder}
      hint="Saisissez au moins deux lettres. La saisie manuelle reste possible."
      onChange={(text, item) => {
        const district = item?.quartier || item?.label || text;
        onChange?.(district);
      }}
      onSelect={onLocationSelect}
      inputClassName="h-12 rounded-xl text-sm"
    />
  );
}
