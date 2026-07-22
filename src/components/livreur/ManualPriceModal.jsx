import React, { useState, useEffect } from "react";
import { DollarSign, AlertCircle, Check, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

const PRIX_MIN = 1000;

/**
 * Modal affiché au livreur pour saisir un prix manuel avant d'accepter une course.
 * Valide que le montant est >= 1000 FCFA.
 */
export default function ManualPriceModal({ course, onConfirm, onCancel, isSubmitting }) {
  const [montant, setMontant] = useState("");
  const [erreur, setErreur] = useState("");
  const [countryCommissionPct, setCountryCommissionPct] = useState(0);

  useEffect(() => {
    if (!course?.country_code) return;
    base44.entities.Country.filter({ code: course.country_code, actif: true })
      .then(countries => { if (countries?.[0]?.commission_pct) setCountryCommissionPct(countries[0].commission_pct); })
      .catch(() => {});
  }, [course?.country_code]);

  const valeur = parseInt(montant.replace(/\D/g, ""), 10);
  const valide = !isNaN(valeur) && valeur >= PRIX_MIN;

  const handleChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "");
    setMontant(raw);
    if (raw && parseInt(raw, 10) < PRIX_MIN) {
      setErreur(`Minimum autorisé : ${PRIX_MIN.toLocaleString()} ${course.devise || "FCFA"}`);
    } else {
      setErreur("");
    }
  };

  const handleConfirm = () => {
    if (!valide) {
      setErreur(`Minimum autorisé : ${PRIX_MIN.toLocaleString()} ${course.devise || "FCFA"}`);
      return;
    }
    onConfirm(valeur);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
    >
      <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <DollarSign className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-white font-black text-lg leading-tight">Saisir le prix</p>
              <p className="text-white/70 text-xs">Mode tarification manuelle</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Info course */}
          <div className="bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-600">
            <p className="font-semibold text-gray-800 truncate">
              {course.adresse_depart} → {course.adresse_arrivee || "Destination inconnue"}
            </p>
            {course.prix_estimate > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Prix automatique estimé : {course.prix_estimate.toLocaleString()} {course.devise || "FCFA"}
              </p>
            )}
          </div>

          {/* Champ montant */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Montant de la course *
            </label>
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                placeholder="Ex: 1500"
                value={montant}
                onChange={handleChange}
                autoFocus
                className="w-full h-16 rounded-2xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none px-5 text-2xl font-black text-gray-900 pr-20"
              />
              <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">
                {course.devise || "FCFA"}
              </span>
            </div>

            {/* Erreur */}
            {erreur && (
              <div className="flex items-center gap-2 mt-2 text-red-500">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-xs font-semibold">{erreur}</p>
              </div>
            )}

            {/* Info minimum */}
            <p className="text-xs text-gray-400 mt-2">
              ⚠️ Minimum : {PRIX_MIN.toLocaleString()} {course.devise || "FCFA"}
            </p>

            {/* Aperçu gain livreur */}
            {valide && (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-blue-700">Prix proposé</span>
                  <span className="font-black text-blue-900">{valeur.toLocaleString()} {course.devise || "FCFA"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-green-700">Votre gain</span>
                  <span className="font-bold text-green-700">+{Math.round(valeur * ((100 - countryCommissionPct) / 100)).toLocaleString()} {course.devise || "FCFA"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Commission SILGAPP</span>
                  <span className="text-gray-500">{Math.round(valeur * (countryCommissionPct / 100)).toLocaleString()} {course.devise || "FCFA"}</span>
                </div>
              </div>
            )}
          </div>

          {/* Info workflow */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-700 font-medium leading-relaxed">
              📋 Ce prix sera proposé au client. La course ne sera confirmée qu'après son accord.
            </p>
          </div>

          {/* Boutons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={onCancel}
              disabled={isSubmitting}
              className="h-13 rounded-2xl border border-gray-200 text-gray-600 font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 h-12"
            >
              <X className="w-4 h-4" />
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={!valide || isSubmitting}
              className="h-12 rounded-2xl bg-gradient-to-b from-blue-600 to-blue-700 text-white font-black text-sm shadow-lg shadow-blue-200 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <><Check className="w-4 h-4" /> Proposer ce prix</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}