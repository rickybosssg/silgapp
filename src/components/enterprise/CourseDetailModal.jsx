import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, MapPin, User, Truck, Calendar, Navigation, MessageSquare } from "lucide-react";
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

export default function CourseDetailModal({ course, open, onClose }) {
  const [showMessages, setShowMessages] = useState(false);
  if (!course) return null;

  const currentStep = getProgressionStep(course);

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
