import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { ThumbsUp, ThumbsDown, CheckCircle2 } from "lucide-react";

/**
 * Feedback simple du destinataire — pouce vert ou rouge.
 * Ne compte pas dans la note officielle du livreur.
 */
export default function DestinataireReactionButton({ course, onDone }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [choix, setChoix] = useState(null);

  if (course.destinataire_feedback) {
    return (
      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-2xl">
        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
        <p className="text-sm font-semibold text-green-800">
          Votre avis a bien été enregistré. Merci !
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-2xl">
        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
        <p className="text-sm font-semibold text-green-800">
          {choix === "bon" ? " Merci pour votre retour positif !" : " Retour enregistré, nous allons nous améliorer."}
        </p>
      </div>
    );
  }

  const handleChoix = async (reaction) => {
    setChoix(reaction);
    setLoading(true);
    try {
      await base44.entities.CourseExterne.update(course.id, {
        destinataire_feedback: reaction,
        destinataire_feedback_date: new Date().toISOString(),
      });
      setDone(true);
      toast.success("Merci pour votre retour !");
      onDone?.();
    } catch (_) {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl space-y-3">
      <p className="text-sm font-bold text-blue-900 text-center">
        La livraison s'est-elle bien passée ?
      </p>
      <div className="flex gap-3">
        <button
          disabled={loading}
          onClick={() => handleChoix("bon")}
          className="flex-1 flex flex-col items-center justify-center gap-1.5 h-16 rounded-2xl bg-green-100 border-2 border-green-200 text-green-700 font-bold text-sm active:scale-95 transition-all hover:bg-green-200 disabled:opacity-50"
        >
          <ThumbsUp className="w-6 h-6" />
          <span className="text-xs font-semibold">Bon</span>
        </button>
        <button
          disabled={loading}
          onClick={() => handleChoix("mauvais")}
          className="flex-1 flex flex-col items-center justify-center gap-1.5 h-16 rounded-2xl bg-red-100 border-2 border-red-200 text-red-700 font-bold text-sm active:scale-95 transition-all hover:bg-red-200 disabled:opacity-50"
        >
          <ThumbsDown className="w-6 h-6" />
          <span className="text-xs font-semibold">Mauvais</span>
        </button>
      </div>
    </div>
  );
}