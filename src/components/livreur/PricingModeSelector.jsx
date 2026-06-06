import React from "react";

export default function PricingModeSelector({ pricingMode, onChange }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">💰 Mode tarifaire</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onChange("automatic")}
          className={`h-16 rounded-xl border-2 font-semibold text-sm transition-all flex flex-col items-center justify-center gap-1 ${
            pricingMode === "automatic"
              ? "border-green-500 bg-green-50 text-green-700"
              : "border-gray-200 text-gray-500 hover:border-gray-300"
          }`}
        >
          <span className="text-xl">🤖</span>
          <span className="text-xs font-bold">Prix automatique</span>
        </button>
        <button
          onClick={() => onChange("manual")}
          className={`h-16 rounded-xl border-2 font-semibold text-sm transition-all flex flex-col items-center justify-center gap-1 ${
            pricingMode === "manual"
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-gray-200 text-gray-500 hover:border-gray-300"
          }`}
        >
          <span className="text-xl">💰</span>
          <span className="text-xs font-bold">Prix manuel</span>
        </button>
      </div>
      <p className="text-[11px] text-gray-400 leading-relaxed">
        {pricingMode === "automatic"
          ? "Le système SILGAPP calcule automatiquement le prix selon les règles actuelles."
          : "Vous proposez votre prix après acceptation. Le client doit valider. Minimum : 1 000 FCFA."}
      </p>
    </div>
  );
}