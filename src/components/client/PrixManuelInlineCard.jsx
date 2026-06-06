import React, { useState } from "react";
import { Check, X, AlertCircle, Loader2, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Carte inline affichée à la place du bloc "Recherche de livreur..."
 * quand un livreur propose un prix manuel.
 * Remplace visuellement l'écran d'attente — le client voit directement la proposition.
 */
export default function PrixManuelInlineCard({ course, devise, onAccepted, onRefused, onAnnuler }) {
  const [loading, setLoading] = useState(false);

  const prix = course.manual_price;
  const prixEstime = course.prix_estimate;

  const handleAccepter = async () => {
    setLoading(true);
    try {
      await base44.functions.invoke("dispatchExterneAuto", {
        action: "valider_prix_manuel",
        course_id: course.id,
        accepted: true,
      });
      toast.success("Prix accepté ! Le livreur est en route. 🚀");
      onAccepted();
    } catch {
      toast.error("Erreur lors de l'acceptation");
    } finally {
      setLoading(false);
    }
  };

  const handleRefuser = async () => {
    setLoading(true);
    try {
      await base44.functions.invoke("dispatchExterneAuto", {
        action: "valider_prix_manuel",
        course_id: course.id,
        accepted: false,
      });
      toast.info("Prix refusé. Recherche d'un autre livreur...");
      onRefused();
    } catch {
      toast.error("Erreur lors du refus");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-3xl overflow-hidden shadow-xl border-2 border-amber-300 bg-white">
      {/* Header coloré */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl animate-bounce flex-shrink-0">
            💰
          </div>
          <div>
            <p className="text-white font-black text-lg leading-tight">Prix proposé par le livreur</p>
            <p className="text-white/70 text-xs mt-0.5">Votre accord est requis pour continuer</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Prix proposé */}
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-5 py-4 text-center">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-1">Montant demandé</p>
          <p className="text-4xl font-black text-amber-900">
            {prix?.toLocaleString()}{" "}
            <span className="text-xl font-semibold text-amber-600">{devise}</span>
          </p>
          {prixEstime > 0 && (
            <p className="text-xs text-amber-600 mt-2">
              Prix automatique estimé : {prixEstime.toLocaleString()} {devise}
            </p>
          )}
        </div>

        {/* Livreur */}
        {course.livreur_nom && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-lg flex-shrink-0">🚴</div>
            <div>
              <p className="text-xs text-blue-600 font-semibold">Livreur</p>
              <p className="text-sm font-bold text-blue-900">{course.livreur_nom}</p>
            </div>
          </div>
        )}

        {/* Avertissement */}
        <div className="flex items-start gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
          <AlertCircle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 leading-relaxed">
            Si vous refusez, la course repart en recherche automatique avec le tarif calculé.
          </p>
        </div>

        {/* Boutons Refuser / Accepter */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleRefuser}
            disabled={loading}
            className="h-14 rounded-2xl border-2 border-red-200 text-red-600 font-black text-sm flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all disabled:opacity-50"
          >
            <X className="w-5 h-5" />
            <span className="text-xs">Refuser</span>
          </button>
          <button
            onClick={handleAccepter}
            disabled={loading}
            className="h-14 rounded-2xl bg-gradient-to-b from-green-500 to-green-600 text-white font-black text-sm shadow-lg shadow-green-200 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Check className="w-5 h-5" />
                <span className="text-xs">Accepter</span>
              </>
            )}
          </button>
        </div>

        {/* Annuler la course */}
        <Button
          variant="ghost"
          className="w-full text-red-400 text-xs hover:text-red-600 hover:bg-red-50 h-9"
          onClick={onAnnuler}
          disabled={loading}
        >
          <XCircle className="w-3.5 h-3.5 mr-1.5" />
          Annuler la course
        </Button>
      </div>
    </div>
  );
}