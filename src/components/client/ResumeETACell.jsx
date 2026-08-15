import React from "react";
import { Clock } from "lucide-react";
import { useETACourse } from "@/hooks/useETACourse";

/**
 * ResumeETACell — cellule ETA pour la carte résumé du ClientSuiviCourse.
 * Utilise useETACourse (source unique d'ETA) pour les courses actives.
 * Pour les courses livrées, affiche la durée réelle (historique).
 */
export default function ResumeETACell({ course, livreurLat, livreurLng, destGpsLat, destGpsLng, isLivree, dureeReelle, countries }) {
  const isLivraison = ["en_livraison", "arrivee"].includes(course.statut);
  const colisRecupere = ["colis_recupere", "en_livraison"].includes(course.statut);

  const cibleLat = colisRecupere ? (destGpsLat || course.gps_arrivee_lat) : course.gps_depart_lat;
  const cibleLng = colisRecupere ? (destGpsLng || course.gps_arrivee_lng) : course.gps_depart_lng;

  const { etaMinutes, isStale, staleLabel } = useETACourse({
    courseId: course.id,
    phase: isLivraison ? "livraison" : "recuperation",
    fromLat: livreurLat || null,
    fromLng: livreurLng || null,
    toLat: cibleLat || null,
    toLng: cibleLng || null,
    countryCode: course.country_code,
    livreurId: course.livreur_id,
    livreurLastUpdate: course._livreur?.derniere_position_date || course._livreur?.last_seen_at || null,
  });

  // Pour les courses livrées, afficher la durée réelle
  if (isLivree) {
    return (
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-3 text-center shadow-lg">
        <Clock className="w-4 h-4 mx-auto mb-1 text-blue-200" />
        <span className="text-2xl font-black text-white block">{dureeReelle != null ? dureeReelle : "—"}</span>
        <span className="text-[10px] font-bold text-blue-100 uppercase tracking-wide">Durée (min)</span>
      </div>
    );
  }

  // GPS stale critique
  const isCritical = isStale && staleLabel?.includes("indisponible");

  return (
    <div className={`bg-gradient-to-br rounded-xl p-3 text-center shadow-lg ${isCritical ? "from-red-500 to-red-700" : isStale ? "from-orange-500 to-orange-700" : "from-blue-600 to-blue-700"}`}>
      <Clock className="w-4 h-4 mx-auto mb-1 text-blue-200" />
      <span className="text-2xl font-black text-white block">
        {isCritical ? "—" : (etaMinutes != null ? etaMinutes : "—")}
      </span>
      <span className="text-[10px] font-bold text-blue-100 uppercase tracking-wide">
        {isCritical ? "GPS indispo." : isStale ? "ETA figé" : "ETA (min)"}
      </span>
    </div>
  );
}
