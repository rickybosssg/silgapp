import React from "react";
import { CheckCircle2, MapPin, Clock, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Écran récapitulatif après livraison confirmée (scan QR ou bouton).
 * Affiche distance, prix, gains, horaires puis un bouton "Paiement reçu / Fermer la course".
 */
export default function LivraisonRecapitulatif({ course, onClose }) {
  const prixFinal = Number(course.prix_final || 0);
  const distance = Number(course.distance_reelle_km || 0);
  const commission = Number(course.commission_silga || Math.round(prixFinal * 0.3));
  const gain = Number(course.montant_livreur || prixFinal - commission);

  const heureRecup = course.heure_recuperation
    ? format(new Date(course.heure_recuperation), "HH:mm", { locale: fr })
    : "--:--";
  const heureLiv = course.heure_livraison
    ? format(new Date(course.heure_livraison), "HH:mm", { locale: fr })
    : "--:--";

  // Durée en minutes
  let duree = null;
  if (course.heure_recuperation && course.heure_livraison) {
    const diff = new Date(course.heure_livraison) - new Date(course.heure_recuperation);
    duree = Math.round(diff / 60000);
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center p-3"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
    >
      <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
        {/* Header vert */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-500 px-5 py-5 text-center">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-9 h-9 text-white" />
          </div>
          <p className="text-white font-black text-xl">Livraison confirmée !</p>
          <p className="text-white/70 text-sm mt-1">Course #{course.id?.slice(-6)}</p>
        </div>

        <div className="p-5 space-y-4">
          {/* Distance + Prix */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-2xl p-3 text-center">
              <p className="text-xs text-blue-600 font-semibold mb-1 flex items-center justify-center gap-1">
                <MapPin className="w-3 h-3" /> Distance
              </p>
              <p className="text-xl font-black text-blue-900">
                {distance > 0 ? `${distance.toFixed(1)} km` : "—"}
              </p>
            </div>
            <div className="bg-primary/5 rounded-2xl p-3 text-center">
              <p className="text-xs text-primary font-semibold mb-1 flex items-center justify-center gap-1">
                <TrendingUp className="w-3 h-3" /> Prix final
              </p>
              <p className="text-xl font-black text-primary">
                {prixFinal > 0 ? `${prixFinal.toLocaleString()} F` : "—"}
              </p>
            </div>
          </div>

          {/* Répartition */}
          {prixFinal > 0 && (
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Commission SILGAPP (30%)</span>
                <span className="font-bold text-red-600">−{commission.toLocaleString()} F</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-2">
                <span className="font-bold text-gray-900">Votre gain net (70%)</span>
                <span className="font-black text-green-700 text-base">+{gain.toLocaleString()} F</span>
              </div>
            </div>
          )}

          {/* Horaires */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3">
            <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 text-xs text-gray-600 space-y-0.5">
              <p>Récupération : <span className="font-bold">{heureRecup}</span></p>
              <p>Livraison : <span className="font-bold">{heureLiv}</span></p>
              {duree !== null && <p>Durée : <span className="font-bold">{duree} min</span></p>}
            </div>
          </div>

          {/* Bouton principal */}
          <button
            className="w-full h-14 rounded-2xl bg-gradient-to-b from-green-600 to-emerald-700 text-white font-black text-base shadow-lg shadow-green-200 active:scale-[0.98] transition-all"
            onClick={onClose}
          >
            ✅ Paiement reçu — Fermer la course
          </button>
        </div>
      </div>
    </div>
  );
}