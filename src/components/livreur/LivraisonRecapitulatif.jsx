import React from "react";
import { CheckCircle2, MapPin, Banknote } from "lucide-react";

/**
 * Écran récapitulatif après livraison confirmée.
 * Affiche uniquement distance et prix total — sans détail financier interne.
 */
export default function LivraisonRecapitulatif({ course, onClose }) {
  const prixFinal = Number(course.prix_final || 0);
  const distance = Number(course.distance_reelle_km || 0);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center p-3"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
    >
      <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
        {/* Header vert */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-500 px-5 py-7 text-center">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-9 h-9 text-white" />
          </div>
          <p className="text-white font-black text-2xl">Course livrée</p>
          <p className="text-white/70 text-sm mt-1">Course #{course.id?.slice(-6)}</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Distance */}
          <div className="flex items-center gap-4 bg-blue-50 rounded-2xl p-4">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Distance parcourue</p>
              <p className="text-xl font-black text-blue-900">
                {distance > 0 ? `${distance.toFixed(1)} km` : "—"}
              </p>
            </div>
          </div>

          {/* Prix */}
          <div className="flex items-center gap-4 bg-green-50 rounded-2xl p-4">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
              <Banknote className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">Prix à payer</p>
              <p className="text-2xl font-black text-green-900">
                {prixFinal > 0 ? `${prixFinal.toLocaleString()} FCFA` : "—"}
              </p>
            </div>
          </div>

          {/* Bouton principal */}
          <button
            className="w-full h-14 rounded-2xl bg-gradient-to-b from-green-600 to-emerald-700 text-white font-black text-base shadow-lg shadow-green-200 active:scale-[0.98] transition-all mt-2"
            onClick={onClose}
          >
            ✅ Paiement reçu — Fermer la course
          </button>
        </div>
      </div>
    </div>
  );
}