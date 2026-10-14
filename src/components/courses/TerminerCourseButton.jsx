import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Bouton "Terminer la course" — clôture administrative exceptionnelle.
 *
 * Affiché uniquement pour les courses actives non terminées (réseau externe).
 * Au clic, ouvre une confirmation. Après confirmation, invoque la fonction
 * backend `terminerCourseAdmin` qui :
 * - passe la course au statut `livree`
 * - calcule la commission si non figée
 * - comptabilise via `verifierEncoursLivreur` (idempotent)
 * - libère le livreur s'il n'a aucune autre course active
 * - expire les notifications de dispatch encore actives
 *
 * Masqué lorsque la course est déjà `livree` ou `annulee`.
 */
export default function TerminerCourseButton({ course, reseau = "externe" }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  // Masquer pour les courses déjà terminées ou annulées
  if (!course || course.statut === "livree" || course.statut === "annulee") {
    return null;
  }

  // Réservé au réseau externe (courses CourseExterne)
  if (reseau !== "externe") {
    return null;
  }

  const handleTerminer = async () => {
    setLoading(true);
    try {
      const result = await base44.functions.invoke("terminerCourseAdmin", {
        course_id: course.id,
      });
      const data = result?.data || result;

      if (!data?.success && data?.error) {
        throw new Error(data.error);
      }

      toast.success(
        `Course clôturée — commission ${data.commission_silga || 0} FCFA comptabilisée`
      );
      queryClient.invalidateQueries();
      setConfirming(false);
    } catch (error) {
      toast.error("Erreur : " + (error?.message || "clôture impossible"));
    } finally {
      setLoading(false);
    }
  };

  if (!confirming) {
    return (
      <Button
        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold"
        disabled={loading}
        onClick={() => setConfirming(true)}
      >
        <CheckCircle2 className="w-4 h-4 mr-2" />
        Terminer la course
      </Button>
    );
  }

  return (
    <div className="bg-green-50 border-2 border-green-400 rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-green-600" />
        <p className="text-sm font-bold text-green-800">
          Terminer administrativement cette course ?
        </p>
      </div>
      <p className="text-xs text-green-700">
        La course passera au statut « livrée », la commission sera comptabilisée
        une seule fois, et le livreur sera libéré s'il n'a aucune autre course active.
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          disabled={loading}
          onClick={() => setConfirming(false)}
        >
          Non
        </Button>
        <Button
          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold"
          disabled={loading}
          onClick={handleTerminer}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Clôture...
            </>
          ) : (
            "Oui, terminer"
          )}
        </Button>
      </div>
    </div>
  );
}