import React from "react";
import { Search, X } from "lucide-react";

/**
 * Modal affiché quand un livreur annule une course.
 * Informe le client que nous recherchons un nouveau livreur.
 * Le dispatch est automatiquement relancé côté backend.
 */
export default function LivreurAnnulationDialog({ course, motifLabel, onFermer }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
    >
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-in">

        {/* Header coloré */}
        <div className="bg-gradient-to-r from-amber-400 to-orange-500 px-6 pt-8 pb-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-3">
            <Search className="w-8 h-8 text-white animate-pulse" />
          </div>
          <h2 className="text-xl font-black text-white">Livreur indisponible</h2>
          <p className="text-white/80 text-sm mt-1">
            Votre livreur a dû annuler la course.
          </p>
        </div>

        {/* Détails */}
        <div className="px-6 py-4 border-b border-gray-100 space-y-3">
          {motifLabel && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base flex-shrink-0">📝</span>
              <span className="text-gray-600">
                Motif : <span className="font-semibold text-gray-800">{motifLabel}</span>
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="text-base flex-shrink-0">📦</span>
            <span className="font-medium truncate">
              {course?.adresse_depart || "Point de départ"} → {course?.adresse_arrivee || "Destination"}
            </span>
          </div>
        </div>

        {/* Message de recherche */}
        <div className="px-6 py-5 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <p className="text-sm font-bold text-gray-800">
              Nous recherchons un nouveau livreur...
            </p>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Vous serez notifié dès qu'un livreur accepte votre course. Aucune action de votre part n'est nécessaire.
          </p>
        </div>

        {/* Action */}
        <div className="p-5 pt-0">
          <button
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-primary to-red-600 text-white font-black text-sm shadow-lg shadow-red-200 active:scale-95 transition-all flex items-center justify-center gap-2"
            onClick={onFermer}
          >
            <X className="w-4 h-4" />
            J'ai compris
          </button>
        </div>
      </div>
    </div>
  );
}