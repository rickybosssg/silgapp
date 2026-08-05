import React from "react";

export default function PricingModeSelector({ pricingMode, onChange }) {
  return (
    <div className="bg-[#1f2429] rounded-2xl border border-white/8 shadow-sm overflow-hidden">
      {/* En-tête */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wider"> MODE TARIFAIRE</p>
      </div>

      {/* Option : Prix automatique */}
      <button
        onClick={() => onChange("automatic")}
        className={`w-full flex items-start gap-3 px-4 py-3 transition-all text-left ${
          pricingMode === "automatic" ? "bg-[#00a86b]/10" : "hover:bg-white/5"
        }`}
      >
        {/* Radio */}
        <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          pricingMode === "automatic"
            ? "border-[#00a86b] bg-[#00a86b]"
            : "border-white/30 bg-transparent"
        }`}>
          {pricingMode === "automatic" && (
            <div className="w-2 h-2 rounded-full bg-white" />
          )}
        </div>

        {/* Texte */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold leading-tight ${
            pricingMode === "automatic" ? "text-[#00a86b]" : "text-white/80"
          }`}>
            Prix automatique
          </p>
          <p className={`text-xs mt-0.5 leading-relaxed ${
            pricingMode === "automatic" ? "text-[#00a86b]/80" : "text-white/40"
          }`}>
            Le système SILGAPP continue de calculer automatiquement le prix selon les règles actuelles.
          </p>
        </div>
      </button>

      {/* Séparateur */}
      <div className="mx-4 h-px bg-white/8" />

      {/* Option : Prix manuel */}
      <button
        onClick={() => onChange("manual")}
        className={`w-full flex items-start gap-3 px-4 py-3 transition-all text-left ${
          pricingMode === "manual" ? "bg-sky-500/10" : "hover:bg-white/5"
        }`}
      >
        {/* Radio */}
        <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          pricingMode === "manual"
            ? "border-sky-400 bg-sky-400"
            : "border-white/30 bg-transparent"
        }`}>
          {pricingMode === "manual" && (
            <div className="w-2 h-2 rounded-full bg-white" />
          )}
        </div>

        {/* Texte */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold leading-tight ${
            pricingMode === "manual" ? "text-sky-300" : "text-white/80"
          }`}>
            Prix manuel
          </p>
          <p className={`text-xs mt-0.5 leading-relaxed ${
            pricingMode === "manual" ? "text-sky-300/80" : "text-white/40"
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