import React from "react";
import { MapPin, Navigation, Package, AlertCircle } from "lucide-react";
import { getPrixAffichable, getDeviseAffichable } from "@/utils/getPrixAffichable";

/**
 * Modal de confirmation d'engagement — affiché AVANT l'acceptation de la course.
 * Objectif : éviter les acceptations accidentelles ou prises sans avoir regardé
 * les caractéristiques de la course.
 *
 * N'interfère PAS avec Dispatch V2 — intervient uniquement avant l'action existante.
 */
export default function AcceptConfirmationModal({ course, onConfirm, onCancel, loading }) {
  if (!course) return null;

  const prix = getPrixAffichable(course);
  const devise = getDeviseAffichable(course);
  const prixAConfirmer = course.prix_a_confirmer === true || !prix || prix <= 0;
  const distance = course.distance_reelle_km || course.distance_tarifaire_km;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-primary px-5 py-4 text-center">
          <p className="text-white text-base font-black">Confirmer la course</p>
          <p className="text-white/70 text-xs mt-0.5">Vous vous engagez à effectuer cette course</p>
        </div>

        {/* Corps */}
        <div className="p-5 space-y-3">
          {/* Trajet */}
          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase text-gray-400">Départ</p>
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {course.quartier_depart || course.adresse_depart || "Adresse à confirmer"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-primary mt-1.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase text-gray-400">Destination</p>
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {course.quartier_arrivee || course.adresse_arrivee || "Adresse à confirmer"}
                </p>
              </div>
            </div>
          </div>

          {/* Infos */}
          <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-xl p-3">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5">
                <Navigation className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase">Distance</span>
              </div>
              <p className="text-sm font-black text-gray-800">
                {distance ? `${Number(distance).toFixed(1)} km` : "—"}
              </p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5">
                <Package className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase">Type</span>
              </div>
              <p className="text-sm font-black text-gray-800 capitalize">
                {course.type_colis ? course.type_colis.replace(/_/g, " ") : course.type_course || "—"}
              </p>
            </div>
          </div>

          {/* Prix */}
          {prixAConfirmer ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm font-bold text-amber-700">Prix à confirmer par SILGAPP</p>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-[10px] font-bold uppercase text-green-600">Prix de la course</p>
              <p className="text-2xl font-black text-green-700">
                {prix.toLocaleString()} <span className="text-sm">{devise}</span>
              </p>
            </div>
          )}
        </div>

        {/* Boutons */}
        <div className="grid grid-cols-2 gap-3 px-5 pb-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="h-12 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="h-12 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              "Confirmer"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}