import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, MapPin, User, Truck, Calendar, Wallet, Navigation, MessageSquare, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { STATUS_LABELS, PROGRESSION_STEPS, getProgressionStep } from "./courseStatus.js";
import EnterpriseCourseMessages from "./EnterpriseCourseMessages.jsx";

const DISPATCH_LABELS = {
  en_attente: "En attente",
  propose: "Proposée",
  accepte: "Acceptée",
  expire: "Expirée",
  redispatch: "Redispatch",
  cycle_epuise: "Cycle épuisé",
  disponible_push: "Disponible (push)",
};

export default function CourseDetailModal({ course, open, onClose, onRefresh }) {
  const [showMessages, setShowMessages] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (!course) return null;

  const currentStep = getProgressionStep(course);
  const isCancellable = course.statut !== "annulee" && course.statut !== "livree";

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await base44.functions.invoke("annulerCourseExterne", {
        course_id: course.id,
        source: "admin",
        motif: "annulation_admin_enterprise",
      });
      if (res?.success) {
        toast.success("Course annulée avec succès");
        setShowCancelConfirm(false);
        onClose();
        onRefresh?.();
      } else {
        toast.error(res?.error || "Échec de l'annulation");
      }
    } catch (err) {
      toast.error(err?.message || "Erreur lors de l'annulation");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Navigation className="w-4 h-4" />
            Course #{course.id?.slice(-8)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Progression visuelle */}
          {course.statut === "annulee" ? (
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <span className="text-sm font-bold text-red-600">❌ Course annulée</span>
            </div>
          ) : course.statut === "programmee" ? (
            <div className="bg-indigo-50 rounded-lg p-3 text-center">
              <span className="text-sm font-bold text-indigo-600">📅 Course programmée</span>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-start justify-between">
                {PROGRESSION_STEPS.map((step, idx) => {
                  const isDone = idx <= currentStep;
                  const isCurrent = idx === currentStep;
                  return (
                    <div key={step.key} className="flex flex-col items-center gap-1" style={{ flex: 1 }}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isDone ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"
                      } ${isCurrent ? "ring-2 ring-blue-300 ring-offset-1" : ""}`}>
                        {isDone ? "✓" : idx + 1}
                      </div>
                      <span className={`text-[8px] text-center leading-tight ${
                        isDone ? "text-gray-700 font-semibold" : "text-gray-400"
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Statut */}
          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2">
            <span className="text-xs text-gray-500">Statut</span>
            <span className="text-xs font-bold text-gray-900">
              {STATUS_LABELS[course.statut] || course.statut}
            </span>
          </div>

          {course.dispatch_status && (
            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2">
              <span className="text-xs text-gray-500">Dispatch</span>
              <span className="text-xs font-bold text-gray-900">
                {DISPATCH_LABELS[course.dispatch_status] || course.dispatch_status}
              </span>
            </div>
          )}

          {/* Date */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Calendar className="w-3 h-3" />
            {course.created_date ? new Date(course.created_date).toLocaleString("fr-FR") : "—"}
          </div>

          {/* Client */}
          <div className="border-t pt-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Client</p>
            <div className="flex items-center gap-2">
              <User className="w-3 h-3 text-gray-400" />
              <span className="text-sm text-gray-900">{course.client_nom || "—"}</span>
            </div>
            {course.client_telephone && (
              <div className="flex items-center gap-2 mt-1">
                <Phone className="w-3 h-3 text-gray-400" />
                <a href={`tel:${course.client_telephone}`} className="text-sm text-blue-600">{course.client_telephone}</a>
              </div>
            )}
          </div>

          {/* Livreur */}
          <div className="border-t pt-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Livreur</p>
            {course.livreur_nom ? (
              <>
                <div className="flex items-center gap-2">
                  <Truck className="w-3 h-3 text-gray-400" />
                  <span className="text-sm text-gray-900">{course.livreur_nom}</span>
                </div>
                {course.livreur_telephone && (
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="w-3 h-3 text-gray-400" />
                    <a href={`tel:${course.livreur_telephone}`} className="text-sm text-blue-600">{course.livreur_telephone}</a>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-amber-600 italic">En attente d'un livreur</p>
            )}
          </div>

          {/* Trajet */}
          <div className="border-t pt-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Trajet</p>
            <div className="flex items-start gap-2">
              <MapPin className="w-3 h-3 text-gray-400 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">{course.adresse_depart || "—"}</p>
                <p className="text-xs text-gray-400">↓</p>
                <p className="text-sm text-gray-900">{course.adresse_arrivee || "—"}</p>
              </div>
            </div>
          </div>

          {/* Prix */}
          <div className="border-t pt-2 space-y-1">
            {course.prix_propose_admin != null && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Prix proposé</span>
                <span className="font-semibold text-gray-900">{course.prix_propose_admin.toLocaleString("fr-FR")} F</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Prix final</span>
              <span className="text-lg font-bold text-gray-900">
                {course.prix_final ? `${course.prix_final.toLocaleString("fr-FR")} F` : "Non défini"}
              </span>
            </div>
          </div>

          {course.notes && (
            <div className="border-t pt-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Notes</p>
              <p className="text-xs text-gray-600">{course.notes}</p>
            </div>
          )}

          {/* Messagerie — supervision lecture seule */}
          <div className="border-t pt-3">
            <button
              onClick={() => setShowMessages(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-50 text-blue-600 text-sm font-semibold hover:bg-blue-100 transition"
            >
              <MessageSquare className="w-4 h-4" />
              Messagerie
            </button>
          </div>

          {/* Annulation course — visible uniquement si non terminée */}
          {isCancellable && !showCancelConfirm && (
            <div className="border-t pt-3">
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 transition"
              >
                <XCircle className="w-4 h-4" />
                Annuler la course
              </button>
            </div>
          )}

          {/* Confirmation d'annulation */}
          {showCancelConfirm && (
            <div className="border-t pt-3 space-y-3">
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-red-700">Voulez-vous vraiment annuler cette course ?</p>
                  <p className="text-xs text-red-600 mt-1">
                    Cette action est définitive. {course.livreur_nom ? "Le livreur sera libéré et notifié." : "La course sera retirée du fil des livreurs."}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={cancelling}
                  className="flex-1 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-600 text-sm font-semibold hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Retour
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 py-2.5 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {cancelling ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Annulation...
                    </>
                  ) : (
                    "Confirmer l'annulation"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      <EnterpriseCourseMessages
        courseId={course.id}
        open={showMessages}
        onClose={() => setShowMessages(false)}
      />
    </Dialog>
  );
}