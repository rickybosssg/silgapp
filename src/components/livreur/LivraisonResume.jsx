import React, { useState, useEffect } from "react";
import { MapPin, Navigation, Clock, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Calcule la distance entre 2 points GPS (formule Haversine)
 */
function calculerDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Rayon terre en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function LivraisonResume({
  course,
  gpsDepart,
  gpsArrivee,
  onContinuer,
  onCancel,
}) {
  const [distance, setDistance] = useState(null);
  const [duree, setDuree] = useState(null);
  const [typeDistance, setTypeDistance] = useState("estimee");

  useEffect(() => {
    if (!gpsDepart || !gpsArrivee) return;

    // Calcul distance
    const dist = calculerDistance(
      gpsDepart.lat,
      gpsDepart.lng,
      gpsArrivee.lat,
      gpsArrivee.lng
    );
    setDistance(dist);

    // Calcul durée
    if (course.colis_recupere_at && course.colis_livre_at) {
      const debut = new Date(course.colis_recupere_at).getTime();
      const fin = new Date(course.colis_livre_at).getTime();
      const dureeMinutes = Math.round((fin - debut) / 60000);
      setDuree(dureeMinutes);
    }

    // TODO: Si on implémente le suivi GPS continu, on pourrait calculer la distance réelle
    // en additionnant les segments entre chaque point GPS enregistré
    setTypeDistance("estimee");
  }, [gpsDepart, gpsArrivee, course]);

  if (!gpsDepart || !gpsArrivee) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3">
            <Navigation className="w-8 h-8 text-green-600" />
          </div>
          <p className="text-xl font-black text-gray-900">Résumé de livraison</p>
          <p className="text-sm text-gray-500 mt-1">
            Distance et durée réelles
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 rounded-2xl p-4 text-center">
            <div className="flex items-center justify-center gap-1 mb-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              <p className="text-xs font-bold text-blue-600 uppercase">Distance</p>
            </div>
            <p className="text-2xl font-black text-blue-700">
              {distance != null ? Number(distance).toFixed(2) : "--"} <span className="text-sm font-semibold">km</span>
            </p>
            <p className="text-[10px] text-blue-400 mt-1 uppercase font-bold">
              {typeDistance === "reelle" ? "GPS réel" : "Estimée"}
            </p>
          </div>

          <div className="bg-purple-50 rounded-2xl p-4 text-center">
            <div className="flex items-center justify-center gap-1 mb-2">
              <Clock className="w-4 h-4 text-purple-600" />
              <p className="text-xs font-bold text-purple-600 uppercase">Durée</p>
            </div>
            <p className="text-2xl font-black text-purple-700">
              {duree ?? "--"} <span className="text-sm font-semibold">min</span>
            </p>
          </div>
        </div>

        {/* Points GPS */}
        <div className="space-y-3 bg-gray-50 rounded-2xl p-4">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-[10px] text-gray-400 font-semibold uppercase">Départ</p>
              <p className="text-xs font-medium text-gray-700">
                {(gpsDepart.lat ?? 0).toFixed(6)}, {(gpsDepart.lng ?? 0).toFixed(6)}
              </p>
              {course.colis_recupere_at && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {format(new Date(course.colis_recupere_at), "HH:mm:ss")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-accent mt-0.5" />
            <div className="flex-1">
              <p className="text-[10px] text-gray-400 font-semibold uppercase">Arrivée</p>
              <p className="text-xs font-medium text-gray-700">
                {(gpsArrivee.lat ?? 0).toFixed(6)}, {(gpsArrivee.lng ?? 0).toFixed(6)}
              </p>
              {course.colis_livre_at && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {format(new Date(course.colis_livre_at), "HH:mm:ss")}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-12 rounded-2xl font-bold"
            onClick={onCancel}
          >
            Annuler
          </Button>
          <Button
            className="h-12 rounded-2xl bg-gradient-to-b from-primary to-red-700 font-black shadow-lg shadow-red-200"
            onClick={onContinuer}
          >
            Continuer <Check className="w-5 h-5 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}