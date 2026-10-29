import React, { useRef } from "react";
import { buildRepeatCourseDraft } from '@/lib/repeatCourseDraft';
import { RotateCcw } from "lucide-react";

/**
 * Bouton "Refaire cette course" — affiché sur les courses livrées dans l'historique.
 * Navigue vers le formulaire de création avec les données réutilisables pré-remplies.
 *
 * NE RECOPIE PAS : livreur, dispatch, statut, commission, paiement, prix final garanti.
 */
export default function RefaireCourseButton({ course, clientProfil, position, onNavigate }) {
  const navigating = useRef(false);
  if (!course || course.statut !== "livree") return null;

  const handleClick = () => {
    if (navigating.current || typeof onNavigate !== 'function') return;
    const prefillData = buildRepeatCourseDraft(course);
    if (!prefillData) return;
    const route = `/client/course/${prefillData.type_course}`;
    navigating.current = true;
    try { const result = onNavigate(route, {
      position,
      clientProfil,
      prefillCourse: prefillData,
    }); if (result === false) navigating.current = false; } catch (error) { navigating.current = false; throw error; }
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
