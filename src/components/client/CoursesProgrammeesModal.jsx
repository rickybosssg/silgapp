import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { X, Clock, Package, Calendar, Trash2, Loader2, Bell } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export default function CoursesProgrammeesModal({ clientProfil, onClose }) {
  const queryClient = useQueryClient();
  const [cancellingId, setCancellingId] = useState(null);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses-programmees-client", clientProfil?.id],
    queryFn: async () => {
      const user = await base44.auth.me();
      const courses = await base44.entities.CourseExterne.filter(
        { created_by_id: user.id, statut: "programmee" },
        "-created_date",
        50
      );
      return courses || [];
    },
    enabled: !!clientProfil?.id,
    refetchInterval: 30000,
  });

  const now = new Date();

  const handleCancel = async (courseId) => {
    setCancellingId(courseId);
    try {
      await base44.entities.CourseExterne.update(courseId, {
        statut: "annulee",
        notes: "Annulée par le client avant l'heure programmée",
      });
      toast.success("Course programmée annulée");
      queryClient.invalidateQueries({ queryKey: ["courses-programmees-client"] });
    } catch (err) {
      toast.error("Erreur lors de l'annulation");
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-orange-500 to-amber-500 text-white">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            <div>
              <h2 className="font-bold text-sm">Courses programmées</h2>
              <p className="text-xs text-white/80">{courses.length} course(s) à venir</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/20 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            </div>
          ) : courses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mb-3">
                <Calendar className="w-8 h-8 text-orange-400" />
              </div>
              <p className="font-bold text-gray-700 text-sm">Aucune course programmée</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">
                Lors de la création d'une course, sélectionnez une date et heure pour la programmer.
                Elle sera automatiquement lancée à l'heure prévue.
              </p>
            </div>
          ) : (
            courses.map((course) => {
              const scheduledDate = course.date_souhaitee ? new Date(course.date_souhaitee) : null;
              const isPast = scheduledDate && scheduledDate < now;
              const timeUntil = scheduledDate ? scheduledDate.getTime() - now.getTime() : 0;
              const minsUntil = Math.round(timeUntil / 60000);

              return (
                <div
                  key={course.id}
                  className={`rounded-2xl border p-4 shadow-sm transition-all ${
                    isPast
                      ? "border-orange-300 bg-orange-50"
                      : "border-gray-100 bg-white"
                  }`}
                >
                  {/* Status badge */}
                  <div className="flex items-center justify-between mb-3">
                    <Badge
                      className={`text-[10px] ${
                        isPast
                          ? "bg-orange-500 text-white"
                          : "bg-blue-500 text-white"
                      }`}
                    >
                      {isPast ? (
                        <>⏳ Déclenchement imminent...</>
                      ) : minsUntil > 60 ? (
                        <>📅 Dans {Math.round(minsUntil / 60)}h</>
                      ) : (
                        <>⏰ Dans {minsUntil} min</>
                      )}
                    </Badge>
                    <button
                      onClick={() => handleCancel(course.id)}
                      disabled={cancellingId === course.id}
                      className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {cancellingId === course.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Scheduled time */}
                  {scheduledDate && (
                    <div className="flex items-center gap-2 mb-2 text-sm">
                      <Clock className="w-4 h-4 text-orange-500 flex-shrink-0" />
                      <span className="font-bold text-gray-800">
                        {format(scheduledDate, "EEEE d MMMM 'à' HH:mm", { locale: fr })}
                      </span>
                    </div>
                  )}

                  {/* Route */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-gray-500">Départ</p>
                        <p className="font-semibold text-gray-700">{course.adresse_depart || "—"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500 mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-gray-500">Arrivée</p>
                        <p className="font-semibold text-gray-700">{course.adresse_arrivee || "—"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Type + price */}
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Package className="w-3.5 h-3.5" />
                      <span className="capitalize">
                        {course.type_course === "expedier" ? "Expédition" :
                         course.type_course === "recevoir" ? "Réception" :
                         course.type_course === "deplacement" ? "Déplacement" : course.type_course}
                      </span>
                    </div>
                    {course.prix_estimate > 0 && (
                      <div className="flex items-center gap-1 text-xs font-bold text-gray-700 ml-auto">
                        {course.prix_estimate.toLocaleString()} FCFA
                      </div>
                    )}
                  </div>

                  {isPast && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-orange-600 bg-orange-100 rounded-lg px-2 py-1.5">
                      <Bell className="w-3.5 h-3.5" />
                      <span className="font-medium">La course sera lancée automatiquement dans quelques minutes</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t bg-gray-50">
          <p className="text-[11px] text-gray-500 text-center">
            🔔 Les courses programmées sont lancées automatiquement à l'heure prévue (vérification toutes les 5 minutes)
          </p>
        </div>
      </div>
    </div>
  );
}