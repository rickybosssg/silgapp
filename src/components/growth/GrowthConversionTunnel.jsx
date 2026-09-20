import React from "react";
import { Card } from "@/components/ui/card";

const STEPS = [
  { key: "prospects", label: "Prospects CRM", color: "bg-slate-400" },
  { key: "clients", label: "Clients", color: "bg-blue-400" },
  { key: "withAccount", label: "Comptes User", color: "bg-indigo-400" },
  { key: "installs", label: "Installations", color: "bg-violet-400" },
  { key: "fcmActive", label: "FCM actif", color: "bg-purple-400" },
  { key: "firstCourse", label: "1ère course", color: "bg-amber-400" },
  { key: "secondCourse", label: "2ème course", color: "bg-orange-400" },
  { key: "regular", label: "Réguliers", color: "bg-emerald-400" },
  { key: "reactivated", label: "Réactivés", color: "bg-green-500" },
];

function TunnelStep({ step, value, prevValue }) {
  const rate = prevValue > 0 ? ((value / prevValue) * 100).toFixed(1) : null;
  return (
    <div className="flex flex-col items-center flex-1 min-w-0">
      <div className="text-center">
        <div className={`mx-auto h-10 w-10 rounded-full ${step.color} flex items-center justify-center text-white text-xs font-bold`}>
          {value > 999 ? `${(value / 1000).toFixed(1)}k` : value}
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
      <h3 className="text-sm font-bold text-slate-800 mb-3">Tunnel de conversion</h3>
      <div className="flex items-start justify-between gap-1 overflow-x-auto scrollbar-hide pb-2">
        {STEPS.map((step, i) => (
          <React.Fragment key={step.key}>
            <TunnelStep
              step={step}
              value={data[step.key] || 0}
              prevValue={i > 0 ? (data[STEPS[i - 1].key] || 0) : 0}
            />
            {i < STEPS.length - 1 && (
              <div className="flex items-center pt-5 text-slate-300 text-xs">→</div>
            )}
          </React.Fragment>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">
        Surveillez l'étape « FCM actif » — c'est notre point de blocage actuel.
      </p>
    </Card>
  );
}