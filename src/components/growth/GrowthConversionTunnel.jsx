import React from "react";
import { Card } from "@/components/ui/card";

// ── Tunnel de conversion cohérent (cohorte période) ──
// CORRECTION : chaque étape est un sous-ensemble de la précédente.
// Anciennement : mélange incohérent lifetime + période + populations indépendantes.
const STEPS = [
  { key: "firstCourse", label: "1ère course livrée", color: "bg-amber-400", format: "count" },
  { key: "secondCourse", label: "2ème course livrée", color: "bg-orange-400", format: "count" },
  { key: "regular", label: "Clients réguliers", color: "bg-emerald-400", format: "count" },
  { key: "caLivre", label: "CA livré (F)", color: "bg-green-500", format: "money" },
  { key: "commission", label: "Commission", color: "bg-blue-500", format: "moneyOrND" },
];

function formatValue(value, format) {
  if (value == null) return "N/D";
  if (format === "money" || format === "moneyOrND") {
    return value > 999 ? `${(value / 1000).toFixed(1)}k` : value;
  }
  return value > 999 ? `${(value / 1000).toFixed(1)}k` : value;
}

function TunnelStep({ step, value, prevValue }) {
  const displayValue = formatValue(value, step.format);
  const rate = (step.format === "count" && prevValue > 0 && value != null)
    ? ((value / prevValue) * 100).toFixed(1)
    : null;
  return (
    <div className="flex flex-col items-center flex-1 min-w-0">
      <div className="text-center">
        <div className={`mx-auto h-10 w-10 rounded-full ${step.color} flex items-center justify-center text-white text-xs font-bold`}>
          {displayValue}
        </div>
        <p className="mt-1.5 text-[10px] font-semibold text-slate-600 leading-tight text-center">
          {step.label}
        </p>
        {rate !== null && rate !== "100.0" && (
          <p className="text-[9px] text-slate-400 mt-0.5">↓ {rate}%</p>
        )}
      </div>
    </div>
  );
}

export default function GrowthConversionTunnel({ data }) {
  if (!data) return null;

  return (
    <Card className="p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800 mb-3">Tunnel de conversion (cohorte période)</h3>
      <div className="flex items-start justify-between gap-1 overflow-x-auto scrollbar-hide pb-2">
        {STEPS.map((step, i) => (
          <React.Fragment key={step.key}>
            <TunnelStep
              step={step}
              value={data[step.key]}
              prevValue={i > 0 ? (data[STEPS[i - 1].key] || 0) : 0}
            />
            {i < STEPS.length - 1 && (
              <div className="flex items-center pt-5 text-slate-300 text-xs">→</div>
            )}
          </React.Fragment>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">
        Tunnel cohorté par période : chaque étape représente un sous-ensemble de la précédente.
        « Commission » affiche « N/D » si aucune course n'a de commission_silga renseignée.
      </p>
    </Card>
  );
}