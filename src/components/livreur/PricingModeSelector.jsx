import React from "react";

export default function PricingModeSelector({ pricingMode, onChange }) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] overflow-hidden">
      {/* En-tête */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mode tarifaire</p>
      </div>

      {/* Option : Prix automatique */}
      <button
        onClick={() => onChange("automatic")}
        className={`w-full flex items-start gap-3 px-4 py-3 transition-all text-left ${
          pricingMode === "automatic" ? "bg-blue-50" : "hover:bg-slate-50"
        }`}
      >
        {/* Radio */}
        <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          pricingMode === "automatic"
            ? "border-[#007aff] bg-[#007aff]"
            : "border-slate-300 bg-white"
        }`}>
          {pricingMode === "automatic" && (
            <div className="w-2 h-2 rounded-full bg-white" />
          )}
        </div>

        {/* Texte */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold leading-tight ${
            pricingMode === "automatic" ? "text-[#007aff]" : "text-slate-800"
          }`}>
            Prix automatique
          </p>
          <p className={`text-xs mt-0.5 leading-relaxed ${
            pricingMode === "automatic" ? "text-blue-700" : "text-slate-500"
          }`}>
            Le système SILGAPP continue de calculer automatiquement le prix selon les règles actuelles.
          </p>
        </div>
      </button>

      {/* Séparateur */}
      <div className="mx-4 h-px bg-slate-100" />

      {/* Option : Prix manuel */}
      <button
        onClick={() => onChange("manual")}
        className={`w-full flex items-start gap-3 px-4 py-3 transition-all text-left ${
          pricingMode === "manual" ? "bg-blue-50" : "hover:bg-slate-50"
        }`}
      >
        {/* Radio */}
        <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          pricingMode === "manual"
            ? "border-[#007aff] bg-[#007aff]"
            : "border-slate-300 bg-white"
        }`}>
          {pricingMode === "manual" && (
            <div className="w-2 h-2 rounded-full bg-white" />
          )}
        </div>

        {/* Texte */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold leading-tight ${
            pricingMode === "manual" ? "text-[#007aff]" : "text-slate-800"
          }`}>
            Prix manuel
          </p>
          <p className={`text-xs mt-0.5 leading-relaxed ${
            pricingMode === "manual" ? "text-blue-700" : "text-slate-500"
          }`}>
            Le livreur propose lui-même son prix après avoir accepté la course.
          </p>
        </div>
      </button>

      {/* Bas de carte */}
      <div className="px-4 pb-3 pt-1" />
    </div>
  );
}
