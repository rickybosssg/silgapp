import React, { useEffect } from "react";
import { CheckCircle2, MapPin, Banknote, Clock, TrendingUp, Star } from "lucide-react";

/**
 * Écran récapitulatif après livraison confirmée (côté livreur externe).
 * Affiche distance réelle, temps, prix final, et part livreur.
 */
export default function LivraisonRecapitulatif({ course, onClose }) {
  const prixFinal = Number(course.prix_final || 0);
  const distance = Number(course.distance_reelle_km || 0);
  const montantLivreur = Number(course.montant_livreur > 0 ? course.montant_livreur : (prixFinal * 0.7));
  const commission = Number(course.commission_silga > 0 ? course.commission_silga : (prixFinal * 0.3));

  // Calcul temps réel si heures disponibles
  let tempsMinutes = null;
  if (course.heure_recuperation && course.heure_livraison) {
    const diff = new Date(course.heure_livraison) - new Date(course.heure_recuperation);
    tempsMinutes = Math.round(diff / 60000);
  } else if (distance > 0) {
    tempsMinutes = Math.round((distance / 25) * 60);
  }

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
          <p className="text-white font-black text-2xl">Course livrée !</p>
          <p className="text-white/70 text-sm mt-1">Course #{course.id?.slice(-6)}</p>
        </div>

        <div className="p-6 space-y-3">
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

          {/* Temps */}
          {tempsMinutes !== null && (
            <div className="flex items-center gap-4 bg-purple-50 rounded-2xl p-4">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-purple-600 font-semibold uppercase tracking-wide">Durée de livraison</p>
                <p className="text-xl font-black text-purple-900">{tempsMinutes} min</p>
              </div>
            </div>
          )}

          {/* Prix à payer (client) */}
          <div className="flex items-center gap-4 bg-green-50 rounded-2xl p-4">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
              <Banknote className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">Prix à encaisser</p>
              <p className="text-2xl font-black text-green-900">
                {prixFinal > 0 ? `${prixFinal.toLocaleString()} FCFA` : "—"}
              </p>
            </div>
          </div>

          {/* Gain livreur */}
          {montantLivreur > 0 && (
            <div className="flex items-center gap-4 bg-amber-50 rounded-2xl p-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide">Votre gain (70%)</p>
                <p className="text-xl font-black text-amber-900">{Math.round(montantLivreur).toLocaleString()} FCFA</p>
                <p className="text-[10px] text-amber-500 mt-0.5">Commission SILGA : {Math.round(commission).toLocaleString()} F (30%)</p>
              </div>
            </div>
          )}

          {/* Note reçue si disponible */}
          {course.note_livreur > 0 && (
            <div className="flex items-center gap-3 bg-yellow-50 rounded-2xl p-3 border border-yellow-200">
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`w-5 h-5 ${i < course.note_livreur ? "fill-yellow-400 text-yellow-400" : "fill-gray-200 text-gray-200"}`} />
                ))}
              </div>
              <p className="text-sm font-bold text-yellow-800">Note reçue : {course.note_livreur}/5</p>
            </div>
          )}

          {/* Bouton principal */}
          <button
            className="w-full h-14 rounded-2xl bg-gradient-to-b from-green-600 to-emerald-700 text-white font-black text-base shadow-lg shadow-green-200 active:scale-[0.98] transition-all mt-2"
            onClick={onClose}
          >
            ✅ Paiement reçu — Retour disponible
          </button>
        </div>
      </div>
    </div>
  );
}