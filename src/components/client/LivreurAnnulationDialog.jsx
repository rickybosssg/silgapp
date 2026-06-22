import React from "react";

/**
 * Modale affichée quand le livreur a annulé la course.
 * La course est remise en dispatch — un nouveau livreur est recherché.
 */
export default function LivreurAnnulationDialog({ motif, onClose }) {
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
          <h2 className="text-xl font-black text-white">Le livreur a annulé</h2>
          <p className="text-white/80 text-sm mt-1">
            Votre livreur a annulé la course en cours.
          </p>
        </div>

        {/* Motif */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-start gap-3 text-sm">
            <span className="text-xl flex-shrink-0"></span>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase mb-0.5">Motif de l'annulation</p>
              <p className="font-bold text-gray-900">{motif || "Non spécifié"}</p>
            </div>
          </div>
        </div>

        {/* Message */}
        <div className="px-6 py-4">
          <p className="text-sm text-gray-600 text-center leading-relaxed">
            Nous recherchons un nouveau livreur pour votre course.
            <br />Vous serez notifié dès qu'un livreur accepte.
          </p>
        </div>

        {/* Action */}
        <div className="p-5 pt-0">
          <button
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary to-red-600 text-white font-black text-base shadow-lg shadow-red-200 active:scale-95 transition-all flex items-center justify-center"
            onClick={onClose}
          >
            Compris
          </button>
        </div>
      </div>
    </div>
  );
}
