import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Leaf, Phone, Navigation, Package, Check, MapPin, ChevronRight,
  ArrowRight, Clock, Ruler,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  parseRoutePlan, prixCourseEco, totalPriceEco, totalDistanceKm,
  computeActiveStepIndex, getStepCourse,
} from "@/lib/ecoMissionHelpers";
import { haversineKm } from "@/lib/priceEstimate";
import { getCourseContactForPhase, normalizePhoneForWhatsapp } from "@/lib/courseContact";
import { getPrixAffichable, getDeviseAffichable } from "@/utils/getPrixAffichable";

const ACTIVE_STATUSES = new Set([
  "livreur_en_route", "client_contacte", "en_route_expediteur",
  "arrive_prise_en_charge", "colis_recupere", "passager_embarque",
  "pris_en_charge", "en_livraison", "arrivee",
]);

/**
 * EcoMissionDashboard — Affichage d'une mission Éco active dans l'onglet « Courses ».
 *
 * GARANTIES :
 *   - Les DEUX courses sont toujours visibles (recap permanent en bas).
 *   - L'étape actuelle est déterminée par les statuts des courses, pas par un index.
 *   - Le livreur ne perd jamais la 2e course après la 1re livraison.
 *   - Le parcours optimisé (route_plan_json) est respecté.
 */
export default function EcoMissionDashboard({ mission, livreurProfil, onAllDelivered }) {
  const queryClient = useQueryClient();
  const [actionPending, setActionPending] = useState(false);
  const livreurId = livreurProfil?.id;

  // ── Fetch les courses de la mission (refetch automatique toutes les 5s) ──
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["eco-mission-active-courses", mission?.id],
    queryFn: async () => {
      if (!mission?.course_ids?.length) return [];
      const results = await Promise.all(
        mission.course_ids.map(id =>
          base44.entities.CourseExterne.get(id).catch(() => null)
        )
      );
      return results.filter(Boolean);
    },
    enabled: !!mission?.id,
    refetchInterval: 5000,
    staleTime: 2000,
  });

  // ── Realtime : refetch immédiat sur update CourseExterne ──
  useEffect(() => {
    if (!mission?.id) return;
    const unsub = base44.entities.CourseExterne.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ["eco-mission-active-courses", mission.id] });
    });
    return unsub;
  }, [mission?.id, queryClient]);

  const routePlan = useMemo(() => parseRoutePlan(mission), [mission]);
  const activeStepIndex = useMemo(
    () => computeActiveStepIndex(routePlan, courses),
    [routePlan, courses]
  );
  const totalSteps = routePlan.length || courses.length * 2;
  const currentStep = routePlan[activeStepIndex] || null;
  const currentCourse = useMemo(
    () => getStepCourse(routePlan, activeStepIndex, courses),
    [routePlan, activeStepIndex, courses]
  );

  const total = Number(mission?.total_price) || totalPriceEco(courses);
  const totalDist = useMemo(() => totalDistanceKm(courses, routePlan), [courses, routePlan]);
  const devise = courses[0]?.devise || "FCFA";

  // ── Détection de fin de mission ──
  const allDone = courses.length > 0 && courses.every(c =>
    c.statut === "livree" || c.statut === "annulee"
  );
  useEffect(() => {
    if (allDone && onAllDelivered) onAllDelivered();
  }, [allDone, onAllDelivered]);

  // ── Handlers ──
  const handleTransition = async (courseId, statutCible, extraData = {}) => {
    if (actionPending) return;
    setActionPending(true);
    try {
      await base44.functions.invoke("transitionStatutLivreur", {
        course_id: courseId,
        statut_cible: statutCible,
        ...extraData,
      });
      queryClient.invalidateQueries({ queryKey: ["eco-mission-active-courses", mission.id] });
      queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
    } catch (err) {
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setActionPending(false);
    }
  };

  const handleFinalize = async (courseId) => {
    if (actionPending) return;
    setActionPending(true);
    try {
      const res = await base44.functions.invoke("finaliserLivraisonLivreur", {
        course_id: courseId,
      });
      if (res?.success || res?.skipped) {
        queryClient.invalidateQueries({ queryKey: ["eco-mission-active-courses", mission.id] });
        queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
        queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
        toast.success("Livraison terminée !");
      } else {
        throw new Error(res?.error || "Erreur finalisation");
      }
    } catch (err) {
      toast.error(err?.message || "Erreur lors de la finalisation");
    } finally {
      setActionPending(false);
    }
  };

  const handleCall = (tel) => {
    if (tel) window.location.href = `tel:${tel}`;
  };

  const handleWhatsApp = (course, phase) => {
    const contact = getCourseContactForPhase(course, phase);
    const num = normalizePhoneForWhatsapp(contact.telephone, course.country_code);
    const prix = getPrixAffichable(course);
    const devise = getDeviseAffichable(course);
    const prixLabel = prix > 0 ? `Prix : ${prix.toLocaleString()} ${devise}.` : "";
    const msg = encodeURIComponent(
      phase === "recuperation"
        ? `Bonjour, je suis votre livreur SILGAPP. Je viens récupérer votre colis. ${prixLabel}`
        : `Bonjour, je suis votre livreur SILGAPP. Je suis en route pour vous livrer votre colis. ${prixLabel}`
    );
    window.open(`https://wa.me/${num}?text=${msg}`, "_blank", "noopener,noreferrer");
  };

  const handleItineraire = (lat, lng) => {
    if (lat != null && lng != null) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, "_blank");
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
    <div className="space-y-3">
      {/* ── Header Mission ── */}
      <div className="overflow-hidden rounded-2xl border-2 border-green-200 bg-card shadow-[0_8px_22px_rgba(15,23,42,0.07)]">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Leaf className="w-5 h-5 text-white" />
            <div>
              <p className="text-[11px] font-bold uppercase text-green-100">Mission Éco</p>
              <p className="text-sm font-bold text-white">{courses.length} livraisons</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase text-green-100">Total</p>
            <p className="text-lg font-black text-white">{total.toLocaleString()}</p>
            <p className="text-[10px] font-bold text-green-100">{devise}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-4 py-2.5 bg-green-50 border-b border-green-100">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-green-700">
              Étape {Math.min(activeStepIndex + 1, totalSteps)} / {totalSteps}
            </span>
            <span className="text-[10px] text-green-600 font-medium">
              {allDone ? "Mission terminée" : "En cours"}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-green-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${allDone ? 100 : (activeStepIndex / totalSteps) * 100}%` }}
            />
          </div>
          {totalDist != null && (
            <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-green-600">
              <Ruler className="w-3 h-3" />
              <span>Distance totale : ~{totalDist.toFixed(1)} km</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Étape actuelle ── */}
      {!allDone && currentCourse && currentStep && (
        <CurrentStepCard
          course={currentCourse}
          step={currentStep}
          stepIndex={activeStepIndex}
          totalSteps={totalSteps}
          courses={courses}
          actionPending={actionPending}
          onTransition={handleTransition}
          onFinalize={handleFinalize}
          onCall={handleCall}
          onWhatsApp={handleWhatsApp}
          onItineraire={handleItineraire}
        />
      )}

      {/* ── Recap permanent des deux colis ── */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-[0_8px_22px_rgba(15,23,42,0.06)] p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase text-slate-400">Récapitulatif des colis</p>
        {courses.map((course, idx) => {
          const prix = prixCourseEco(course);
          const isLivre = course.statut === "livree";
          const isAnnule = course.statut === "annulee";
          const isRecupere = ["colis_recupere", "en_livraison", "arrivee", "livree"].includes(course.statut);

          return (
            <div key={course.id} className={cn(
              "rounded-xl border p-3 space-y-1.5",
              isLivre ? "bg-green-50 border-green-200" :
              isAnnule ? "bg-red-50 border-red-200" :
              isRecupere ? "bg-blue-50 border-blue-200" :
              "bg-amber-50 border-amber-200"
            )}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700">Colis {idx + 1}</span>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                  isLivre ? "bg-green-100 text-green-700" :
                  isAnnule ? "bg-red-100 text-red-700" :
                  isRecupere ? "bg-blue-100 text-blue-700" :
                  "bg-amber-100 text-amber-700"
                )}>
                  {isLivre ? "✓ Livré" : isAnnule ? "Annulé" : isRecupere ? "Récupéré" : "À récupérer"}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[11px]">
                  <MapPin className="w-3 h-3 text-green-600 flex-shrink-0" />
                  <span className="font-semibold text-slate-700">{course.quartier_depart || "—"}</span>
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                  <span className="font-semibold text-slate-700">{course.quartier_arrivee || "—"}</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-snug pl-5">
                  {course.adresse_depart || "Adresse à confirmer"} → {course.adresse_arrivee || "Adresse à confirmer"}
                </p>
              </div>
              {prix > 0 && (
                <p className="text-[11px] font-bold text-slate-600">{prix.toLocaleString()} {course.devise || "FCFA"}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * CurrentStepCard — Affiche l'étape actuelle avec actions (Appeler, Itinéraire, Valider).
 */
function CurrentStepCard({ course, step, stepIndex, totalSteps, courses, actionPending, onTransition, onFinalize, onCall, onWhatsApp, onItineraire }) {
  const isPickup = step.type === "pickup";
  const phase = isPickup ? "recuperation" : "livraison";
  const contact = getCourseContactForPhase(course, phase);
  const courseIdx = courses.indexOf(course) + 1;

  const lat = isPickup ? course.gps_depart_lat : course.gps_arrivee_lat;
  const lng = isPickup ? course.gps_depart_lng : course.gps_arrivee_lng;
  const quartier = isPickup ? course.quartier_depart : course.quartier_arrivee;
  const adresse = isPickup ? course.adresse_depart : course.adresse_arrivee;

  const isColisRecupere = ["colis_recupere", "en_livraison", "arrivee", "livree"].includes(course.statut);

  return (
    <div className="bg-white rounded-2xl border-2 border-green-300 shadow-[0_8px_22px_rgba(15,23,42,0.07)] overflow-hidden">
      {/* Header */}
      <div className={cn(
        "px-4 py-2.5 flex items-center justify-between",
        isPickup ? "bg-gradient-to-r from-amber-500 to-amber-600" : "bg-gradient-to-r from-green-500 to-emerald-600"
      )}>
        <div className="flex items-center gap-2">
          {isPickup ? <Package className="w-5 h-5 text-white" /> : <Check className="w-5 h-5 text-white" />}
          <div>
            <p className="text-[10px] font-bold uppercase text-white/80">
              Étape {stepIndex + 1}/{totalSteps} — Colis {courseIdx}
            </p>
            <p className="text-sm font-black text-white">
              {isPickup ? "Récupérer le colis" : "Livrer le colis"}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Adresse */}
        <div className={cn(
          "rounded-xl p-3 border",
          isPickup ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"
        )}>
          <p className="text-[10px] font-bold uppercase text-slate-400">
            {isPickup ? "Point de récupération" : "Point de livraison"}
          </p>
          {quartier && <p className="text-sm font-bold text-slate-800">{quartier}</p>}
          <p className="text-xs text-slate-600">{adresse || "Adresse à confirmer"}</p>
        </div>

        {/* Contact */}
        <div className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl p-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase text-slate-400">{contact.role}</p>
            <p className="font-bold text-slate-800 text-sm truncate">{contact.nom}</p>
            <p className="text-xs text-slate-500 truncate">{contact.telephone || "—"}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {contact.telephone && (
              <button
                onClick={() => onCall(contact.telephone)}
                className="flex flex-col items-center gap-0.5"
              >
                <div className="w-11 h-11 rounded-2xl bg-blue-100 border-2 border-blue-300 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-blue-700" />
                </div>
                <span className="text-[9px] font-bold text-blue-700">Appeler</span>
              </button>
            )}
            <button
              onClick={() => onWhatsApp(course, phase)}
              className="flex flex-col items-center gap-0.5"
            >
              <div className="w-11 h-11 rounded-2xl bg-green-100 border-2 border-green-300 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-green-700" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              <span className="text-[9px] font-bold text-green-700">WhatsApp</span>
            </button>
            {lat != null && lng != null && (
              <button
                onClick={() => onItineraire(lat, lng)}
                className="flex flex-col items-center gap-0.5"
              >
                <div className="w-11 h-11 rounded-2xl bg-purple-100 border-2 border-purple-300 flex items-center justify-center">
                  <Navigation className="w-5 h-5 text-purple-700" />
                </div>
                <span className="text-[9px] font-bold text-purple-700">Itinéraire</span>
              </button>
            )}
          </div>
        </div>

        {/* Bouton de validation */}
        {isPickup && !isColisRecupere ? (
          <button
            onClick={() => onTransition(course.id, "colis_recupere", { confirmation_method: "bouton" })}
            disabled={actionPending}
            className="w-full h-14 rounded-2xl bg-gradient-to-b from-amber-500 to-amber-600 text-white font-black text-base shadow-lg shadow-amber-200 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
          >
            <Package className="w-6 h-6" />
            Colis récupéré
            <ChevronRight className="w-5 h-5" />
          </button>
        ) : isPickup && isColisRecupere ? (
          <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center">
            <Check className="w-6 h-6 text-green-600 mx-auto mb-1" />
            <p className="text-sm font-bold text-green-700">Colis récupéré</p>
            <p className="text-[11px] text-green-600">Passez à l'étape suivante</p>
          </div>
        ) : (
          <button
            onClick={() => onFinalize(course.id)}
            disabled={actionPending}
            className="w-full h-14 rounded-2xl bg-primary text-white font-black text-base shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {actionPending ? (
              <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <>
                <Check className="w-6 h-6" />
                Colis livré
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}