import React from "react";
import { Banknote, MapPin, Check } from "lucide-react";

/**
 * Pop-up obligatoire affiché une seule fois par course après livraison.
 * Montre le prix final = distance réelle × 100 F
 */
export default function PrixCoursePopup({ course, onClose }) {
  // Distance réelle entre récupération et livraison
  function haversine(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Priorité 1 : distance déjà calculée et stockée
  const distStockee =
    (Number(course.distance_reelle_km) > 0 ? Number(course.distance_reelle_km) : null) ||
    (Number(course.distance_km) > 0 ? Number(course.distance_km) : null);

  // Priorité 2 : calcul Haversine depuis les coords GPS récup → livraison
  const distCalculee =
    haversine(course.latitude_recuperation, course.longitude_recuperation,
              course.latitude_livraison, course.longitude_livraison) ||
    haversine(course.latitude_recuperation, course.longitude_recuperation,
              course.latitude_arrivee_livraison, course.longitude_arrivee_livraison) ||
    haversine(course.latitude_depart_livraison, course.longitude_depart_livraison,
              course.latitude_arrivee_livraison, course.longitude_arrivee_livraison);

  const distanceBrute = distStockee || distCalculee;
  const distance = distanceBrute != null ? Math.max(distanceBrute, 0.1) : null;

  // Prix : distance × 100 F (interne : prix_reel déjà saisi par le livreur, externe : calculé)
  const prixFinal = distance != null
    ? Math.round(distance * 100)
    : (Number(course.prix_final) > 0 ? Number(course.prix_final) : null);

  // Libellé distance
  const distLabel = distance != null
    ? (distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(2)} km`)
    : null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(6px)" }}
    >
      <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
        {/* Header vert */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-500 px-6 py-6 text-center">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
            <Banknote className="w-9 h-9 text-white" />
          </div>
          <p className="text-white font-black text-2xl tracking-wide uppercase">Prix de la course</p>
        </div>

        <div className="p-6 space-y-5">
          {/* Formule distance × 100 F */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-center space-y-2">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Calcul du prix</p>
            {distance !== null ? (
              <>
                <p className="text-3xl font-black text-blue-900">
                  {distLabel} × 100 F
                </p>
                <div className="w-12 h-0.5 bg-blue-200 mx-auto" />
                <p className="text-xl font-black text-blue-700">
                  = {prixFinal?.toLocaleString()} F
                </p>
              </>
            ) : (
              <p className="text-lg font-bold text-blue-700">Distance non disponible</p>
            )}
          </div>

          {/* Montant à payer — très grand */}
          <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-5 text-center">
            <p className="text-sm font-bold text-green-700 uppercase tracking-wide mb-1">
               Montant à encaisser
            </p>
            <p className="text-5xl font-black text-green-900">
              {prixFinal !== null ? `${prixFinal.toLocaleString()} F` : "—"}
            </p>
            <p className="text-xs text-green-600 mt-2">Réclamez ce montant au client avant de partir</p>
          </div>

          {/* Itinéraire court */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
            <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0 text-xs text-gray-600 truncate">
              <span className="font-semibold">{course.adresse_depart || "Récupération"}</span>
              <span className="mx-1 text-gray-400">→</span>
              <span className="font-semibold">{course.adresse_arrivee || "Livraison"}</span>
            </div>
          </div>

          {/* Bouton fermer — impossible à rater */}
          <button
            className="w-full rounded-2xl bg-gradient-to-b from-green-500 to-green-700 text-white font-black text-xl shadow-xl shadow-green-300 active:scale-[0.97] transition-all flex items-center justify-center gap-3"
            style={{ minHeight: "72px" }}
            onClick={onClose}
          >
            <Check className="w-6 h-6" />
            J'ai compris — Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
