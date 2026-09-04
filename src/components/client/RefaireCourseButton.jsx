import React from "react";
import { RotateCcw } from "lucide-react";

/**
 * Bouton "Refaire cette course" — affiché sur les courses livrées dans l'historique.
 * Navigue vers le formulaire de création avec les données réutilisables pré-remplies.
 *
 * NE RECOPIE PAS : livreur, dispatch, statut, commission, paiement, prix final garanti.
 */
export default function RefaireCourseButton({ course, clientProfil, position, onNavigate }) {
  if (!course || course.statut !== "livree") return null;

  const handleClick = () => {
    const route = `/client/course/${course.type_course || "expedier"}`;
    const prefillData = {
      type_course: course.type_course,
      adresse_depart: course.adresse_depart || "",
      adresse_arrivee: course.adresse_arrivee || "",
      quartier_depart: course.quartier_depart || "",
      quartier_arrivee: course.quartier_arrivee || "",
      ville_depart: course.ville_depart || "",
      ville_arrivee: course.ville_arrivee || "",
      gps_depart_lat: course.gps_depart_lat || null,
      gps_depart_lng: course.gps_depart_lng || null,
      gps_arrivee_lat: course.gps_arrivee_lat || null,
      gps_arrivee_lng: course.gps_arrivee_lng || null,
      gps_depart_source: course.gps_depart_source || null,
      gps_arrivee_source: course.gps_arrivee_source || null,
      expediteur_nom: course.expediteur_nom || "",
      expediteur_telephone: course.expediteur_telephone || "",
      destinataire_nom: course.destinataire_nom || "",
      destinataire_telephone: course.destinataire_telephone || "",
      type_colis: course.type_colis || "petit_colis",
      passager_nom: course.passager_nom || "",
      passager_telephone: course.passager_telephone || "",
      nb_passagers: course.nb_passagers || 1,
      notes: "",
      destination_inconnue: course.destination_inconnue || false,
    };

    onNavigate?.(route, {
      position,
      clientProfil,
      prefillCourse: prefillData,
    });
  };

  return (
    <button
      onClick={handleClick}
      className="w-full h-11 rounded-2xl bg-primary text-white font-black text-sm shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
    >
      <RotateCcw className="w-4 h-4" />
      Refaire cette course
    </button>
  );
}