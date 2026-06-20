import React from "react";
import { RefreshCw, X } from "lucide-react";

/**
 * Dialog affiché quand une course a été annulée automatiquement
 * après 4 minutes sans livreur (dispatch_status === "expire").
 * Propose au client de relancer la recherche ou de terminer.
 */
export default function CourseAnnuleeRelanceDialog({ course, onRelancer, onTerminer }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
    >
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">

        {/* Header coloré */}
        <div className="bg-gradient-to-r from-orange-400 to-red-500 px-6 pt-8 pb-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-3">
            <span className="text-4xl"></span>
          </div>
          <h2 className="text-xl font-black text-white">Aucun livreur disponible</h2>
          <p className="text-white/80 text-sm mt-1">
            Votre course n'a pas trouvé de livreur après 4 minutes.
          </p>
        </div>

        {/* Détails course */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="text-base"></span>
            <span className="font-medium truncate">
              {course.adresse_depart || "Point de départ"} → {course.adresse_arrivee || "Destination"}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="p-5 space-y-3">
          <p className="text-xs text-center text-gray-400 font-medium mb-4">Que souhaitez-vous faire ?</p>

          <button
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary to-red-600 text-white font-black text-base shadow-lg shadow-red-200 active:scale-95 transition-all flex items-center justify-center gap-3"
            onClick={onRelancer}
          >
            <RefreshCw className="w-5 h-5" />
            Relancer la recherche
          </button>

          <button
            className="w-full h-12 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-gray-50"
            onClick={onTerminer}
          >
            <X className="w-4 h-4" />
            Terminer
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 pb-5">
           Réessayez dans quelques minutes, des livreurs se connectent régulièrement.
        </p>
      </div>
    </div>
  );
}