import React from "react";

export default function PricingModeSelector({ pricingMode, onChange }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* En-tête */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">💰 MODE TARIFAIRE</p>
      </div>

      {/* Option : Prix automatique */}
      <button
        onClick={() => onChange("automatic")}
        className={`w-full flex items-start gap-3 px-4 py-3 transition-all text-left ${
          pricingMode === "automatic" ? "bg-green-50" : "hover:bg-gray-50"
        }`}
      >
        {/* Radio */}
        <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          pricingMode === "automatic"
            ? "border-green-500 bg-green-500"
            : "border-gray-300 bg-white"
        }`}>
          {pricingMode === "automatic" && (
            <div className="w-2 h-2 rounded-full bg-white" />
          )}
        </div>

        {/* Texte */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold leading-tight ${
            pricingMode === "automatic" ? "text-green-800" : "text-gray-700"
          }`}>
            Prix automatique
          </p>
          <p className={`text-xs mt-0.5 leading-relaxed ${
            pricingMode === "automatic" ? "text-green-700" : "text-gray-400"
          }`}>
            Le système SILGAPP continue de calculer automatiquement le prix selon les règles actuelles.
          </p>
        </div>
      </button>

      {/* Séparateur */}
      <div className="mx-4 h-px bg-gray-100" />

      {/* Option : Prix manuel */}
      <button
        onClick={() => onChange("manual")}
        className={`w-full flex items-start gap-3 px-4 py-3 transition-all text-left ${
          pricingMode === "manual" ? "bg-blue-50" : "hover:bg-gray-50"
        }`}
      >
        {/* Radio */}
        <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          pricingMode === "manual"
            ? "border-blue-500 bg-blue-500"
            : "border-gray-300 bg-white"
        }`}>
          {pricingMode === "manual" && (
            <div className="w-2 h-2 rounded-full bg-white" />
          )}
        </div>

        {/* Texte */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold leading-tight ${
            pricingMode === "manual" ? "text-blue-800" : "text-gray-700"
          }`}>
            Prix manuel
          </p>
          <p className={`text-xs mt-0.5 leading-relaxed ${
            pricingMode === "manual" ? "text-blue-700" : "text-gray-400"
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