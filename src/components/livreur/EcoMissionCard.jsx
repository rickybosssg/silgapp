import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Check, Leaf, MapPin, Navigation } from "lucide-react";
import { toast } from "sonner";
import { parseRoutePlan, prixCourseEco, totalPriceEco, totalDistanceKm } from "@/lib/ecoMissionHelpers";

/**
 * EcoMissionCard — Affiche une mission SILGAPP Éco (2 courses regroupées)
 * dans le fil "Disponibles" du livreur.
 *
 * Affiche pour CHAQUE course :
 *   - Quartier ET adresse de récupération
 *   - Quartier ET adresse de livraison
 *   - Prix individuel
 *
 * Affiche pour la mission :
 *   - Prix total (somme des deux prix)
 *   - Distance totale du trajet optimisé
 *   - Parcours optimisé (ordre des étapes)
 *
 * L'acceptation est atomique : le backend verrouille la mission et les deux courses.
 */
export default function EcoMissionCard({ mission, livreurProfil, onAcceptSuccess }) {
  const queryClient = useQueryClient();
  const [accepting, setAccepting] = useState(false);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["eco-mission-courses", mission?.id],
    queryFn: async () => {
      if (!mission?.course_ids?.length) return [];
      const results = await Promise.all(
        mission.course_ids.map(id => base44.entities.CourseExterne.get(id).catch(() => null))
      );
      return results.filter(Boolean);
    },
    enabled: !!mission?.id,
    staleTime: 10000,
  });

  const routePlan = useMemo(() => parseRoutePlan(mission), [mission]);
  const devise = courses[0]?.devise || "FCFA";
  const total = Number(mission?.total_price) || totalPriceEco(courses);
  const totalDist = useMemo(() => totalDistanceKm(courses, routePlan), [courses, routePlan]);

  const handleAccept = async () => {
    if (!mission?.id || !livreurProfil?.id || accepting) return;
    setAccepting(true);
    try {
      const res = await base44.functions.invoke("ecoOptimizationOrchestrator", {
        action: "accept_eco_mission",
        mission_id: mission.id,
        livreur_id: livreurProfil.id,
      });
      if (res?.success && res?.accepted) {
        toast.success("Mission Éco acceptée !");
        queryClient.invalidateQueries({ queryKey: ["eco-missions-available"] });
        queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
        onAcceptSuccess?.();
      } else {
        toast.error(res?.error || res?.reason || "Erreur lors de l'acceptation");
      }
    } catch (err) {
      toast.error("Erreur réseau lors de l'acceptation");
    } finally {
      setAccepting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (courses.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border-2 border-green-200 bg-card shadow-[0_8px_22px_rgba(15,23,42,0.07)]">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Leaf className="w-5 h-5 text-white" />
          <div>
            <p className="text-[11px] font-bold uppercase text-green-100">Mission SILGAPP Éco</p>
            <p className="text-sm font-bold text-white">{courses.length} livraisons regroupées</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase text-green-100">Total</p>
          <p className="text-lg font-black text-white">{total.toLocaleString()}</p>
          <p className="text-[10px] font-bold text-green-100">{devise}</p>
        </div>
      </div>

      {/* Courses détaillées */}
      <div className="p-4 space-y-3">
        {courses.map((course, index) => {
          const prix = prixCourseEco(course);
          return (
            <div key={course.id} className="border border-gray-100 rounded-lg p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase text-gray-400">Colis {index + 1}</span>
                <span className="text-sm font-bold text-success">
                  {prix > 0 ? `${prix.toLocaleString()} ${course.devise || "FCFA"}` : "Prix à confirmer"}
                </span>
              </div>

              {/* Récupération : quartier + adresse */}
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center pt-0.5">
                  <span className="h-2.5 w-2.5 rounded-full border-[2px] border-success bg-white flex-shrink-0" />
                  <span className="my-1 min-h-5 w-px flex-1 bg-slate-200" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold uppercase text-slate-400">Récupération</p>
                  {course.quartier_depart && (
                    <p className="text-xs font-bold text-foreground">{course.quartier_depart}</p>
                  )}
                  <p className="text-[11px] text-slate-600 leading-snug">
                    {course.adresse_depart || "Adresse à confirmer"}
                  </p>
                </div>
              </div>

              {/* Livraison : quartier + adresse */}
              <div className="flex items-start gap-2">
                <span className="h-2.5 w-2.5 rounded-[2px] bg-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold uppercase text-slate-400">Livraison</p>
                  {course.quartier_arrivee && (
                    <p className="text-xs font-bold text-foreground">{course.quartier_arrivee}</p>
                  )}
                  <p className="text-[11px] text-slate-600 leading-snug">
                    {course.adresse_arrivee || "Adresse à confirmer"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Parcours optimisé + distance */}
      {routePlan.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          <p className="text-[10px] font-bold uppercase text-slate-400">Parcours optimisé</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {routePlan.map((step, i) => {
              const course = courses.find(c => c.id === step.course_id);
              const label = step.type === "pickup" ? "Récup" : "Livraison";
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <div className={`px-2 py-1 rounded-md text-[9px] font-bold ${
                    step.type === "pickup" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"
                  }`}>
                    {label} {course ? courses.indexOf(course) + 1 : "?"}
                  </div>
                  {i < routePlan.length - 1 && <span className="text-slate-300 text-[10px]">→</span>}
                </div>
              );
            })}
          </div>
          {totalDist != null && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Navigation className="w-3.5 h-3.5" />
              <span>Distance totale : ~{totalDist.toFixed(1)} km</span>
            </div>
          )}
        </div>
      )}

      {/* Accept button */}
      <div className="border-t border-slate-100 bg-green-50 p-3">
        <button
          type="button"
          onClick={handleAccept}
          disabled={accepting}
          className="w-full h-12 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-sm font-bold text-white shadow-lg shadow-green-200 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {accepting ? (
            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <>
              <Check className="h-5 w-5" />
              Accepter la mission ({total.toLocaleString()} {devise})
            </>
          )}
        </button>
      </div>
    </div>
  );
}