import React, { useRef, useState } from "react";
import { X, AlertCircle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { normalizeCourseFunctionResult } from '@/lib/courseFunctionResult';
import ClientDecisionNotice from './ClientDecisionNotice';
import ClientRelaunchActions from './ClientRelaunchActions';
import { clientDecisionView } from '../../../base44/shared/clientDecisionView.js';

/**
 * Modale affichée au client quand un livreur a annulé une course qu'il avait acceptée.
 * Le client choisit entre :
 *   - "Chercher un autre livreur" (relance le dispatch)
 *   - "Terminer la course" (annulation définitive)
 *
 * La modale reste affichée jusqu'à ce que le client prenne une décision.
 * Elle est persistante : survit aux fermetures/rouvertures de l'app tant que
 * course.client_decision_attendue === true.
 */
export default function LivreurAnnulationDecisionModal({ course, onDecided, guestActions = null, onClose = null }) {
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);

  if (!clientDecisionView(course).waiting) return null;

  const handleDecide = async (action) => {
    if (pending.current) return;
    if (!guestActions && action === 'terminer_course' && !window.confirm('Confirmer l’annulation de cette course ?')) return;
    pending.current = true;
    setLoading(true);
    try {
      const raw = guestActions ? await guestActions.cancel() : await base44.functions.invoke("deciderApresAnnulationLivreur", {
        course_id: course.id,
        action,
      });
      const res = normalizeCourseFunctionResult(raw);

      if (res?.success) {
        toast.success(
          action === "chercher_autre_livreur"
            ? "Recherche d'un nouveau livreur lancée"
            : "Course terminée"
        );
        onDecided?.(action);
      } else if (res?.already_decided) {
        toast.info("Vous avez déjà pris une décision pour cette course.");
        onDecided?.(res.action);
      } else {
        toast.error(res?.error || "Erreur lors de la décision");
      }
    } catch (err) {
      toast.error("Erreur réseau lors de la décision");
      console.error("[LivreurAnnulationDecisionModal]", err);
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
    >
      <div className="w-full max-w-sm max-h-[calc(100dvh-2rem)] bg-white rounded-3xl shadow-2xl overflow-y-auto animate-in slide-in-from-bottom duration-300">

        {/* Header coloré */}
        <div className="bg-gradient-to-r from-red-500 to-orange-500 px-6 pt-8 pb-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-black text-white leading-tight">
            Votre course est en attente
          </h2>
          <p className="text-white/85 text-sm mt-1">
            Choisissez la suite à donner à votre commande.
          </p>
        </div>

        {/* Motif */}
        <div className="px-6 py-4 border-b border-gray-100">
          <ClientDecisionNotice course={course} />
        </div>

        {/* Détails course */}
        <div className="px-6 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <MapPin className="w-4 h-4 flex-shrink-0 text-gray-400" />
            <span className="font-medium truncate">
              {course.adresse_depart || "Départ"} → {course.adresse_arrivee || "Destination"}
            </span>
          </div>
        </div>

        {/* Question + Actions */}
        <div className="p-5 space-y-3">
          <p className="text-xs text-center text-gray-400 font-medium mb-4">
            Que souhaitez-vous faire ?
          </p>

          <ClientRelaunchActions identity={guestActions?.identity || course.id} disabled={loading}
            context={guestActions?.context || null}
            readContext={guestActions ? null : () => base44.functions.invoke('relaunchClientCourse', { action: 'context', course_id: course.id })}
            execute={guestActions ? guestActions.relaunch : input => base44.functions.invoke('relaunchClientCourse', { ...input, course_id: course.id })}
            onConfirmed={() => { toast.success('Decision confirmee. Actualisation du suivi.'); onDecided?.('chercher_autre_livreur'); }} />

          <Button
            disabled={loading}
            variant="outline"
            onClick={() => handleDecide("terminer_course")}
            className="w-full h-12 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-gray-50"
          >
            <X className="w-4 h-4" />
            Annuler la course
          </Button>
          {onClose && <button type="button" className="w-full min-h-11 text-sm" disabled={loading} onClick={onClose}>Revenir au suivi</button>}
        </div>

        <p className="text-center text-xs text-gray-400 pb-5 px-6">
          Cette décision est définitive. Le motif d'annulation reste dans l'historique.
        </p>
      </div>
    </div>
  );
}
