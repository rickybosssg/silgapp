import { useState, useEffect, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { MapPin } from "lucide-react";

/**
 * QuartierSelect — dropdown de quartiers filtré par pays, avec saisie libre.
 * 
 * Props:
 *   - countryCode (string): code pays pour filtrer les quartiers
 *   - value (string): valeur actuelle
 *   - onChange (function): callback avec le nom du quartier sélectionné/saisi
 *   - placeholder (string): placeholder du champ
 *   - label (string): label optionnel
 *   - required (boolean): champ requis (default false)
 */
export default function QuartierSelect({
  countryCode,
  value = "",
  onChange,
  placeholder = "Sélectionnez un quartier...",
  label = "Quartier",
  required = false,
}) {
  const [quartiers, setQuartiers] = useState([]);
  const [customValue, setCustomValue] = useState("");
  const [isCustom, setIsCustom] = useState(false);

  // Charger les quartiers filtrés par pays
  useEffect(() => {
    if (!countryCode) { setQuartiers([]); return; }
    let cancelled = false;
    base44.entities.Quartier
      .filter({ country_code: countryCode, actif: true }, "nom", 200)
      .then((data) => {
        if (!cancelled) setQuartiers(data || []);
      })
      .catch(() => { if (!cancelled) setQuartiers([]); });
    return () => { cancelled = true; };
  }, [countryCode]);

  // Détecter si la valeur actuelle est dans la liste
  useEffect(() => {
    if (!value || value === "__custom__") { setIsCustom(false); return; }
    const exists = quartiers.some(
      (q) => q.nom.toLowerCase() === value.toLowerCase()
    );
    setIsCustom(!exists && value.length > 0);
    if (!exists && value.length > 0) setCustomValue(value);
  }, [value, quartiers]);

  const handleSelect = (nom) => {
    if (nom === "__custom__") {
      setIsCustom(true);
      setCustomValue("");
      onChange("");
    } else {
      setIsCustom(false);
      onChange(nom);
    }
  };

  const handleCustomChange = (e) => {
    setCustomValue(e.target.value);
    onChange(e.target.value);
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

      {!isCustom ? (
        <Select value={value || ""} onValueChange={handleSelect}>
          <SelectTrigger className="rounded-xl h-12 bg-gray-50 border-gray-200 text-sm">
            <SelectValue placeholder={placeholder}>
              {value ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  {value}
                </span>
              ) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {quartiers.map((q) => (
              <SelectItem key={q.id} value={q.nom}>
                📍 {q.nom}
              </SelectItem>
            ))}
            <SelectItem value="__custom__" className="text-primary font-semibold">
              ✏️ Autre quartier (saisie libre)...
            </SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <div className="relative">
          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <Input
            value={customValue}
            onChange={handleCustomChange}
            placeholder="Saisissez le nom du quartier..."
            className="rounded-xl h-12 pl-10 bg-gray-50 border-gray-200 text-sm"
          />
          <button
            type="button"
            onClick={() => { setIsCustom(false); onChange(""); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-primary font-bold bg-primary/5 px-2 py-1 rounded-lg"
          >
            Liste
          </button>
        </div>
      )}
    </div>
  );
}