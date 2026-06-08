import React, { useEffect } from "react";
import { CheckCircle2, MapPin, Banknote, Clock, TrendingUp, Star } from "lucide-react";

/**
 * Écran récapitulatif après livraison confirmée (côté livreur externe).
 * Affiche distance réelle, temps, prix final, et part livreur.
 */
export default function LivraisonRecapitulatif({ course, onClose }) {
  // Calcul distance avec fallback (comme ClientSuiviCourse)
  function haversine(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // Fallbacks pour données manquantes
  const distance = Number(course.distance_reelle_km) > 0 
    ? Number(course.distance_reelle_km)
    : haversine(course.latitude_recuperation, course.longitude_recuperation, course.latitude_livraison, course.longitude_livraison)
    || haversine(course.gps_depart_lat, course.gps_depart_lng, course.gps_arrivee_lat, course.gps_arrivee_lng)
    || 0;

  // Prix manuel accepté → priorité absolue, ne jamais recalculer à partir de la distance
  const isPrixManuel = course.pricing_mode === "manual" && course.manual_price_status === "accepted" && Number(course.manual_price) > 0;

  const prixFinal = isPrixManuel
    ? Number(course.manual_price)
    : (Number(course.prix_final) > 0 ? Number(course.prix_final) : (distance > 0 ? Math.round(distance * 100) : 0));

  const montantLivreur = Number(course.montant_livreur) > 0 
    ? Number(course.montant_livreur)
    : Math.round(prixFinal * 0.7);

  const commission = Number(course.commission_silga) > 0 
    ? Number(course.commission_silga)
    : Math.round(prixFinal * 0.3);

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
          {/* Distance — toujours afficher si disponible ou calculable */}
          {distance > 0 && (
            <div className="flex items-center gap-4 bg-blue-50 rounded-2xl p-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Distance parcourue</p>
                <p className="text-xl font-black text-blue-900">
                  {distance.toFixed(1)} km
                </p>
              </div>
            </div>
          )}

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

          {/* Prix à payer (client) — toujours affiché */}
          <div className="flex items-center gap-4 bg-green-50 rounded-2xl p-4">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
              <Banknote className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">
                Prix à encaisser{isPrixManuel ? " (prix convenu)" : ""}
              </p>
              <p className="text-2xl font-black text-green-900">
                {prixFinal > 0 ? `${prixFinal.toLocaleString()} FCFA` : "100 FCFA"}
              </p>
              {isPrixManuel && (
                <p className="text-[10px] text-green-600 mt-0.5">Prix accepté par le client</p>
              )}
            </div>
          </div>

          {/* Gain livreur — toujours affiché */}
          <div className="flex items-center gap-4 bg-amber-50 rounded-2xl p-4">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide">Votre gain (70%)</p>
              <p className="text-xl font-black text-amber-900">{Math.max(montantLivreur, 70).toLocaleString()} FCFA</p>
              <p className="text-[10px] text-amber-500 mt-0.5">Commission SILGA : {Math.max(commission, 30).toLocaleString()} F (30%)</p>
            </div>
          </div>

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

          {/* Message d'instruction */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-center">
            <p className="text-sm font-bold text-amber-800">💵 Encaissez le paiement du client</p>
            <p className="text-xs text-amber-600 mt-0.5">Appuyez sur PAYER après avoir reçu le montant</p>
          </div>

          {/* Bouton PAYER — impossible à rater */}
          <button
            className="w-full rounded-2xl bg-gradient-to-b from-green-500 to-green-700 text-white font-black text-xl shadow-xl shadow-green-300 active:scale-[0.97] transition-all mt-1"
            style={{ minHeight: "72px", letterSpacing: "0.05em" }}
            onClick={onClose}
          >
            💰 PAYER
          </button>
        </div>
      </div>
    </div>
  );
}