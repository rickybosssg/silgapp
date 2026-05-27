import React from "react";
import { Clock, Ruler, MapPin } from "lucide-react";

// Haversine distance (km)
function haversine(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeETA(distKm) {
  if (!distKm || distKm <= 0) return null;
  return Math.round((distKm / 25) * 60);
}

/**
 * ETADisplay — affiche l'ETA + distance style Uber/Glovo
 *
 * Props:
 *   livreurLat, livreurLng: position du livreur (mise à jour en temps réel)
 *   targetLat, targetLng: position de la destination (récupération ou livraison)
 *   livreurNom: prénom du livreur
 *   phase: "vers_recuperation" | "vers_livraison"
 *   statut: statut de la course
 */
export default function ETADisplay({ livreurLat, livreurLng, targetLat, targetLng, livreurNom, phase, statut }) {
  if (!livreurLat || !livreurLng) return null;
  if (!targetLat || !targetLng) return null;

  const dist = haversine(livreurLat, livreurLng, targetLat, targetLng);
  const eta = computeETA(dist);

  if (dist === null || eta === null) return null;

  const isRecup = phase === "vers_recuperation";
  const prenom = livreurNom?.split(" ")[0] || "Le livreur";

  let message = "";
  if (isRecup) {
    message = eta <= 1 ? `${prenom} arrive dans moins d'1 min` : `${prenom} arrive dans environ ${eta} min`;
  } else {
    message = eta <= 1 ? `${prenom} arrive chez vous dans moins d'1 min` : `${prenom} arrive chez vous dans ${eta} min`;
  }

  return (
    <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
      <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
        <Clock className="w-5 h-5 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-blue-900 leading-tight">{message}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-xs text-blue-600">
            <Ruler className="w-3 h-3" />
            {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}
          </span>
          <span className="flex items-center gap-1 text-xs text-blue-600">
            <MapPin className="w-3 h-3" />
            {isRecup ? "Récupération" : "Livraison"}
          </span>
        </div>
      </div>
    </div>
  );
}