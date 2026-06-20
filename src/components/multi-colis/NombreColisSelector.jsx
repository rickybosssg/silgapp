import React from "react";
import { Minus, Plus, Package } from "lucide-react";

const MAX_COLIS = 10;

export default function NombreColisSelector({ value, onChange }) {
  const nb = value || 1;

  const decrement = () => {
    if (nb > 1) onChange(nb - 1);
  };
  const increment = () => {
    if (nb < MAX_COLIS) onChange(nb + 1);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center">
          <Package className="w-4 h-4 text-purple-600" />
        </div>
        <span className="text-sm font-semibold text-gray-700">
          Nombre de colis
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={decrement}
          disabled={nb <= 1}
          className="w-12 h-12 rounded-2xl border-2 border-gray-200 bg-white flex items-center justify-center active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:border-gray-300"
        >
          <Minus className="w-5 h-5 text-gray-600" />
        </button>

        <div className="flex-1 text-center">
          <span className="text-4xl font-black text-gray-900">{nb}</span>
          <p className="text-xs text-gray-400 mt-1 font-medium">
            {nb === 1 ? "colis" : "colis"}
          </p>
        </div>

        <button
          type="button"
          onClick={increment}
          disabled={nb >= MAX_COLIS}
          className="w-12 h-12 rounded-2xl border-2 border-purple-200 bg-purple-50 flex items-center justify-center active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-purple-100"
        >
          <Plus className="w-5 h-5 text-purple-600" />
        </button>
      </div>

      {nb === 1 && (
        <p className="text-xs text-gray-400 text-center">
          Augmentez pour créer une tournée multi-colis
        </p>
      )}

      {nb > 1 && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3 flex items-center gap-2">
          <span className="text-lg"></span>
          <p className="text-xs text-purple-700 font-semibold">
            Mode multi-colis activé — {nb} destinataires à renseigner
          </p>
        </div>
      )}
    </div>
  );
}