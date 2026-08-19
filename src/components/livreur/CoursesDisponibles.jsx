import { useState, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Check, X, Clock, Package, Flame, Navigation } from "lucide-react";
import { toast } from "sonner";
import { startUrgentCourseAlert, stopUrgentCourseAlert } from "@/lib/livreurUrgentAlert";
import { getPrixAffichable } from "@/utils/getPrixAffichable";
import { useCoursesDisponibles } from "@/hooks/useCoursesDisponibles";

function calculerDistance(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(value => value == null || Number.isNaN(Number(value)))) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const FINAL_COURSE_STATUSES = new Set(["livree", "annulee", "completed", "delivered", "canceled"]);
const DISMISSED_COURSES_KEY = "silgapp_dismissed_courses";
const DISMISS_TTL_MS = 30 * 60 * 1000;

function persistDismissedCourse(courseId) {
  if (!courseId) return;
  try {
    const now = Date.now();
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_COURSES_KEY) || "{}");
    const activeEntries = Object.fromEntries(
      Object.entries(parsed || {}).filter(([, dismissedAt]) => now - Number(dismissedAt) < DISMISS_TTL_MS)
    );
    activeEntries[courseId] = now;
    localStorage.setItem(DISMISSED_COURSES_KEY, JSON.stringify(activeEntries));
  } catch {
    // Le refus serveur reste la source de verite si le stockage local est indisponible.
  }
}

export default function CoursesDisponibles({ livreurProfil, onAcceptSuccess, onNewCourse }) {
  const queryClient = useQueryClient();
  const [acceptingId, setAcceptingId] = useState(null);
  const knownCourseIdsRef = useRef(new Set());
  const courseFeedInitializedRef = useRef(false);

  const livreurId = livreurProfil?.id;
  const countryCode = livreurProfil?.country_code;
  const livreurLat = livreurProfil?.latitude;
  const livreurLng = livreurProfil?.longitude;

  // ── Source unique de vérité : hook partagé avec ActiviteTempsReel ──
  const { eligibleCourses, courses, isLoading, isV2Enabled, livreurDisponible, refusedCourseIds, setRefusedIds } = useCoursesDisponibles(livreurProfil);

  // ── Enregistrer les vues de courses dans DispatchNotification ──
  // Crée un enregistrement "notifie" par livreur+course (idempotent) pour
  // que les compteurs admin (Notifiés/Refusés/Expirés) reflètent la réalité.
  useEffect(() => {
    if (!livreurId || courses.length === 0) return;
    (async () => {
      // Récupérer les notifications déjà existantes pour ce livreur
      const existing = await base44.entities.DispatchNotification.filter(
        { livreur_id: livreurId }, "-date_notification", 200
      ).catch(() => []);
      const existingCourseIds = new Set((existing || []).map(n => n.course_id));
      // Créer uniquement pour les courses pas encore notifiées
      courses.forEach((course) => {
        if (existingCourseIds.has(course.id)) return;
        base44.entities.DispatchNotification.create({
          course_id: course.id,
          livreur_id: livreurId,
          country_code: course.country_code,
          statut: "notifie",
          date_notification: new Date().toISOString(),
          priorite_dispatch: course.priorite_dispatch || 0,
        }).catch(() => {});
      });
    })();
  }, [courses, livreurId]);

  // Realtime subscription — mise à jour instantanée
  useEffect(() => {
    if (!livreurId) return;
    const unsubscribe = base44.entities.CourseExterne.subscribe((event) => {
      if (event.type === "create" || event.type === "update" || event.type === "delete") {
        queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles", livreurId, countryCode] });
      }
    });
    return unsubscribe;
  }, [livreurId, countryCode, queryClient]);

  // ── eligibleCourses provient du hook useCoursesDisponibles (source unique) ──

  useEffect(() => {
    const currentIds = new Set(eligibleCourses.map(course => course.id));
    if (!courseFeedInitializedRef.current) {
      if (isLoading) return;
      knownCourseIdsRef.current = currentIds;
      courseFeedInitializedRef.current = true;
      return;
    }

    const newCourses = eligibleCourses.filter(course => !knownCourseIdsRef.current.has(course.id));
    knownCourseIdsRef.current = new Set([...knownCourseIdsRef.current, ...currentIds]);
    if (newCourses.length === 0) return;

    const newestCourse = newCourses[0];
    startUrgentCourseAlert({
      courseId: newestCourse.id,
      source: "dispatch-v2-available",
      durationSeconds: 10,
      intervalSeconds: 5,
      showNotification: true,
      title: "Nouvelle course SILGAPP",
      body: `${newestCourse.quartier_depart || newestCourse.adresse_depart || "Départ"} vers ${newestCourse.quartier_arrivee || newestCourse.adresse_arrivee || "destination"}`,
    });
    onNewCourse?.(newCourses.length);
  }, [eligibleCourses, isLoading, onNewCourse]);

  // Calculer la distance pour chaque course
  const coursesWithDistance = useMemo(() => {
    return eligibleCourses.map(course => {
      const distance = calculerDistance(
        livreurLat, livreurLng,
        course.gps_depart_lat, course.gps_depart_lng
      );
      return { ...course, __distance: distance };
    }).sort((a, b) => {
      // Trier par priorité puis par distance
      const prioA = a.priority === "urgente" ? 3 : a.priority === "haute" ? 2 : 1;
      const prioB = b.priority === "urgente" ? 3 : b.priority === "haute" ? 2 : 1;
      if (prioA !== prioB) return prioB - prioA;
      if (a.__distance === null) return 1;
      if (b.__distance === null) return -1;
      return a.__distance - b.__distance;
    });
  }, [eligibleCourses, livreurLat, livreurLng]);

  const handleAccept = async (course) => {
    if (!course?.id || !livreurId) return;
    setAcceptingId(course.id);
    try {
      const res = await base44.functions.invoke("dispatchExterneAuto", {
        action: "accepter_course_v2",
        course_id: course.id,
        livreur_id: livreurId,
      });
      const data = res;
      if (data?.success && data?.accepted !== false) {
        stopUrgentCourseAlert("v2-course-accepted");
        toast.success("Course acceptée !");
        queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
        queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
        if (onAcceptSuccess) onAcceptSuccess();
      } else if (data?.reason === "deja_en_course") {
        toast.error("Vous avez déjà une course en cours. Terminez-la avant d'en accepter une nouvelle.");
      } else if (data?.already_taken || data?.reason === "already_taken" || data?.accepted === false) {
        toast.error(data?.error || "Cette course vient d'être acceptée par un autre livreur.");
        queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
      } else if (data?.expired) {
        toast.error("Cette course a expiré.");
        queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
      } else {
        toast.error(data?.error || "Erreur lors de l'acceptation");
      }
    } catch {
      toast.error("Erreur réseau lors de l'acceptation");
    } finally {
      setAcceptingId(null);
    }
  };

  const handleRefuser = async (course) => {
    if (!course?.id || !livreurId) return;
    stopUrgentCourseAlert("v2-course-refused");
    persistDismissedCourse(course.id);
    setRefusedIds(prev => prev.includes(course.id) ? prev : [...prev, course.id]);
    try {
      const res = await base44.functions.invoke("dispatchExterneAuto", {
        action: "refuser_course",
        course_id: course.id,
        livreur_id: livreurId,
        raison: "Refusé depuis Courses disponibles",
      });
      const data = res;
      if (data?.success !== true) {
        toast.error(data?.error || "Le refus n'a pas pu être confirmé par le serveur.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["dispatch-refused-courses", livreurId] });
      queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
    } catch {
      toast.error("Course masquée. La synchronisation du refus sera retentée.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!livreurDisponible) {
    return (
      <div className="rounded-2xl bg-white border border-black/5 p-8 text-center space-y-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto">
          <Navigation className="w-7 h-7 text-primary" />
        </div>
        <p className="text-sm font-bold text-slate-800">Passez en ligne pour voir les courses</p>
        <p className="text-xs text-slate-500">
          Les courses disponibles sont réservées aux livreurs actifs, validés et libres.
        </p>
      </div>
    );
  }

  if (coursesWithDistance.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-black/5 p-8 text-center space-y-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto">
          <Flame className="w-7 h-7 text-orange-400" />
        </div>
        <p className="text-sm font-bold text-slate-800">Aucune course disponible</p>
        <p className="text-xs text-slate-500">
          Les courses non acceptées par le dispatch automatique apparaîtront ici.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg bg-muted p-3">
      <div className="flex items-center justify-between px-1 py-0.5">
        <div>
          <p className="text-[11px] font-bold uppercase text-primary">Dispatch en direct</p>
          <h2 className="mt-0.5 text-lg font-bold text-foreground">Courses disponibles</h2>
        </div>
        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-foreground px-2 text-xs font-bold text-white">
          {coursesWithDistance.length}
        </span>
      </div>

      {coursesWithDistance.map(course => (
        <div
          key={course.id}
          className="overflow-hidden rounded-lg border border-border bg-card shadow-[0_8px_22px_rgba(15,23,42,0.07)]"
        >
          <div className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase text-slate-400">Nouvelle mission</span>
                  {course.priority === "urgente" && (
                    <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600">Urgente</span>
                  )}
                  {course.priority === "haute" && (
                    <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-bold text-orange-600">Prioritaire</span>
                  )}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(course.created_date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {(() => {
                const prix = getPrixAffichable(course);
                const devise = course.devise || "FCFA";
                return prix > 0 ? (
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-semibold uppercase text-slate-400">
                      {Number(course.prix_propose_client) > 0 ? "Prix client" : "Proposition"}
                    </p>
                    <p className="mt-0.5 text-xl font-bold text-success">
                      {prix.toLocaleString()}
                    </p>
                    <p className="text-[10px] font-bold text-success">{devise}</p>
                  </div>
                ) : null;
              })()}
            </div>

            <div className="mt-4 grid grid-cols-[22px_1fr] gap-x-2.5">
              <div className="flex flex-col items-center pt-1">
                <span className="h-3 w-3 rounded-full border-[3px] border-success bg-white" />
                <span className="my-1 min-h-8 w-px flex-1 bg-slate-200" />
                <span className="h-3 w-3 rounded-[3px] bg-primary" />
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Récupération</p>
                  <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">
                    {course.quartier_depart || course.adresse_depart || "Adresse à confirmer"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Livraison</p>
                  <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">
                    {course.quartier_arrivee || course.adresse_arrivee || "Adresse à confirmer"}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[11px] font-medium text-slate-600">
              {course.__distance !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5">
                  <Navigation className="h-3.5 w-3.5 text-primary" />
                  {course.__distance.toFixed(1)} km de vous
                </span>
              )}
              {course.type_colis && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5">
                  <Package className="h-3.5 w-3.5" />
                  {course.type_colis.replace("_", " ")}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_52px] gap-2.5 border-t border-slate-100 bg-muted p-3">
            <button
              type="button"
              onClick={() => handleAccept(course)}
              disabled={acceptingId === course.id}
              className="h-12 rounded-lg bg-primary text-sm font-bold text-white shadow-[0_6px_14px_rgba(0,122,255,0.2)] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {acceptingId === course.id ? (
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <>
                  <Check className="h-5 w-5" />
                  Accepter la course
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleRefuser(course)}
              disabled={acceptingId === course.id}
              aria-label="Refuser cette course"
              title="Refuser"
              className="h-12 rounded-lg border border-slate-200 bg-white text-slate-500 transition-all active:scale-[0.96] disabled:opacity-50 flex items-center justify-center"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}