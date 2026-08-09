import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Check, X, MapPin, Clock, Package, Flame, Navigation } from "lucide-react";
import { toast } from "sonner";
import { playNotificationSound } from "@/hooks/useSonEtVibration";

function calculerDistance(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const FINAL_COURSE_STATUSES = new Set(["livree", "annulee", "completed", "delivered", "canceled"]);

export default function CoursesDisponibles({ livreurProfil, onAcceptSuccess, onNewCourse }) {
  const queryClient = useQueryClient();
  const [acceptingId, setAcceptingId] = useState(null);
  const knownCourseIdsRef = useRef(new Set());
  const [refusedIds, setRefusedIds] = useState(() => {
    try {
      const stored = localStorage.getItem("silgapp_dismissed_courses");
      return stored ? Object.keys(JSON.parse(stored)) : [];
    } catch { return []; }
  });

  const livreurId = livreurProfil?.id;
  const countryCode = livreurProfil?.country_code;
  const livreurLat = livreurProfil?.latitude;
  const livreurLng = livreurProfil?.longitude;

  // ── Vérifier si le dispatch V2 est activé globalement ──
  const { data: isV2Enabled = false } = useQuery({
    queryKey: ["dispatch-v2-enabled", livreurId],
    queryFn: async () => {
      if (!livreurId) return false;
      const configs = await base44.entities.AppConfig.filter({ cle: "DISPATCH_V2_ENABLED" });
      return configs?.[0]?.valeur === "true";
    },
    enabled: !!livreurId,
    staleTime: 60000,
  });

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses-externes-disponibles", livreurId, countryCode, isV2Enabled],
    queryFn: async () => {
      if (!countryCode || !isV2Enabled) return [];
      // Toutes les courses visibles : propose (V1) + disponible_push (V2) + en_attente (admin manuel)
      const all = await base44.entities.CourseExterne.filter(
        { dispatch_status: { $in: ["disponible_push", "propose", "en_attente"] }, country_code: countryCode },
        "-created_date", 50
      );
      return all || [];
    },
    enabled: !!livreurId && !!countryCode && isV2Enabled,
    staleTime: 30000,
  });

  // ── Rechargement ponctuel (pas de polling permanent) ──
  // Se déclenche au retour au premier plan ou après reconnexion réseau
  useEffect(() => {
    if (!livreurId) return;
    const reload = () => {
      queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles", livreurId, countryCode] });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") reload();
    };
    const handleOnline = () => reload();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [livreurId, countryCode, queryClient]);

  // ── Récupérer les courses refusées par ce livreur depuis DispatchNotification ──
  // (remplace l'ancien champ JSON dispatch_refused_ids qui n'est plus mis à jour)
  const { data: refusedCourseIds = [] } = useQuery({
    queryKey: ["dispatch-refused-courses", livreurId],
    queryFn: async () => {
      if (!livreurId) return [];
      const refused = await base44.entities.DispatchNotification.filter(
        { livreur_id: livreurId, statut: "refuse" },
        "-date_reponse", 50
      );
      return (refused || []).map(n => n.course_id);
    },
    enabled: !!livreurId,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // ── Détection de nouvelles courses → sonnerie + notification ──
  useEffect(() => {
    const currentIds = new Set(courses.map(c => c.id));
    if (currentIds.size === 0) return;

    const newIds = [...currentIds].filter(id => !knownCourseIdsRef.current.has(id));

    // Premier chargement — juste enregistrer, pas de son
    if (knownCourseIdsRef.current.size === 0) {
      knownCourseIdsRef.current = currentIds;
      return;
    }

    // Nouvelles courses détectées
    if (newIds.length > 0) {
      knownCourseIdsRef.current = new Set([...knownCourseIdsRef.current, ...currentIds]);
      playNotificationSound();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      if (onNewCourse) onNewCourse(newIds.length);
    }
  }, [courses, onNewCourse]);

  // Realtime subscription — mise à jour instantanée
  useEffect(() => {
    if (!livreurId) return;
    const unsubscribe = base44.entities.CourseExterne.subscribe((event) => {
      if (event.type === "update" || event.type === "delete") {
        queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles", livreurId, countryCode] });
      }
    });
    return unsubscribe;
  }, [livreurId, countryCode, queryClient]);

  // Filtrer les courses éligibles
  const eligibleCourses = useMemo(() => {
    return courses.filter(course => {
      if (FINAL_COURSE_STATUSES.has(course.statut)) return false;
      if (course.livreur_id) return false;
      if (refusedIds.includes(course.id)) return false;
      // Exclure si timeout expiré
      if (course.timeout_expires_at) {
        const expires = new Date(course.timeout_expires_at);
        if (!isNaN(expires.getTime()) && expires < new Date()) return false;
      }
      // Exclure si le livreur a déjà refusé cette course (via DispatchNotification)
      if (refusedCourseIds.includes(course.id)) return false;
      return true;
    });
  }, [courses, refusedIds, refusedCourseIds, livreurId]);

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
      const data = res?.data;
      if (data?.success && data?.accepted !== false) {
        toast.success("Course acceptée ! 🎉");
        queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
        queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
        if (onAcceptSuccess) onAcceptSuccess();
      } else if (data?.already_taken || data?.reason === "already_taken" || data?.accepted === false) {
        toast.error("Cette course vient d'être acceptée par un autre livreur.");
        queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
      } else if (data?.reason === "deja_en_course") {
        toast.error("Vous avez déjà une course en cours. Terminez-la avant d'en accepter une nouvelle.");
      } else if (data?.expired) {
        toast.error("Cette course a expiré.");
        queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
      } else {
        toast.error(data?.error || "Erreur lors de l'acceptation");
      }
    } catch (error) {
      toast.error("Erreur réseau lors de l'acceptation");
    } finally {
      setAcceptingId(null);
    }
  };

  const handleRefuser = (course) => {
    setRefusedIds(prev => [...prev, course.id]);
    // Appel backend en arrière-plan
    base44.functions.invoke("dispatchExterneAuto", {
      action: "refuser_course",
      course_id: course.id,
      livreur_id: livreurId,
      raison: "Refusé depuis Courses disponibles",
    }).catch(() => null);
  };

  if (!isV2Enabled) {
    return (
      <div className="rounded-3xl bg-gradient-to-br from-[#1a1f2e] via-[#1f2429] to-[#16191d] border border-white/8 p-10 text-center space-y-4 shadow-xl">
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 flex items-center justify-center mx-auto border border-orange-500/20">
          <Flame className="w-10 h-10 text-orange-400/50" />
          <div className="absolute inset-0 rounded-3xl bg-orange-500/5 animate-pulse" />
        </div>
        <p className="text-base font-black text-white/80">Fil non disponible</p>
        <p className="text-xs text-white/40 leading-relaxed max-w-[220px] mx-auto">
          Le fil de courses disponibles est actuellement désactivé. L'administrateur peut l'activer depuis le panneau de configuration.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 rounded-full border-2 border-[#00a86b] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (coursesWithDistance.length === 0) {
    return (
      <div className="rounded-3xl bg-gradient-to-br from-[#1a1f2e] via-[#1f2429] to-[#16191d] border border-white/8 p-10 text-center space-y-4 shadow-xl">
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 flex items-center justify-center mx-auto border border-orange-500/20">
          <Flame className="w-10 h-10 text-orange-400/50" />
          <div className="absolute inset-0 rounded-3xl bg-orange-500/5 animate-pulse" />
        </div>
        <p className="text-base font-black text-white/80">Aucune course disponible</p>
        <p className="text-xs text-white/40 leading-relaxed max-w-[220px] mx-auto">
          Les courses non acceptées par le dispatch automatique apparaîtront ici automatiquement.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Flame className="w-4 h-4 text-white" />
        </div>
        <h2 className="text-base font-black text-white">Courses disponibles</h2>
        <span className="w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] font-black flex items-center justify-center shadow-md shadow-orange-500/30">
          {coursesWithDistance.length}
        </span>
      </div>

      {coursesWithDistance.map(course => (
        <div
          key={course.id}
          className={`relative overflow-hidden rounded-3xl border shadow-xl ${
            course.priority === "urgente"
              ? "bg-gradient-to-br from-red-950/40 via-[#1f2429] to-[#181b20] border-red-500/30"
              : course.priority === "haute"
              ? "bg-gradient-to-br from-orange-950/30 via-[#1f2429] to-[#181b20] border-orange-500/25"
              : "bg-gradient-to-br from-[#1f2429] via-[#1c2128] to-[#181b20] border-white/8"
          }`}
        >
          {/* Bandeau priorité */}
          {(course.priority === "urgente" || course.priority === "haute") && (
            <div className={`flex items-center gap-1.5 px-4 py-1.5 ${
              course.priority === "urgente"
                ? "bg-gradient-to-r from-red-600 to-red-500"
                : "bg-gradient-to-r from-orange-600 to-orange-500"
            }`}>
              <Flame className="w-3.5 h-3.5 text-white" />
              <span className="text-[10px] font-black text-white tracking-wider uppercase">
                {course.priority === "urgente" ? "URGENTE" : "PRIORITÉ HAUTE"}
              </span>
            </div>
          )}

          <div className="p-4 space-y-3.5">
            {/* Trajet */}
            <div className="space-y-2.5">
              {/* Départ */}
              <div className="flex items-start gap-3">
                <div className="relative flex-shrink-0 mt-0.5">
                  <div className="w-8 h-8 rounded-xl bg-[#00a86b]/15 border border-[#00a86b]/30 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-[#00a86b]" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Récupération</p>
                  <p className="text-sm text-white font-bold leading-tight">
                    {course.quartier_depart || course.adresse_depart || "Adresse à confirmer"}
                  </p>
                </div>
              </div>

              {/* Ligne de liaison */}
              <div className="flex justify-start pl-4">
                <div className="w-0.5 h-4 bg-gradient-to-b from-[#00a86b]/40 to-blue-400/40" />
              </div>

              {/* Arrivée */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-400/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Navigation className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Livraison</p>
                  <p className="text-sm text-white font-bold leading-tight">
                    {course.quartier_arrivee || course.adresse_arrivee || "Adresse à confirmer"}
                  </p>
                </div>
              </div>
            </div>

            {/* Métadonnées */}
            <div className="flex items-center gap-3 flex-wrap pt-1">
              {course.__distance !== null && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#00a86b]/10 text-[#00a86b] text-[11px] font-bold">
                  <Navigation className="w-3 h-3" />
                  {course.__distance.toFixed(1)} km
                </span>
              )}
              {course.type_colis && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 text-white/70 text-[11px] font-semibold border border-white/8">
                  <Package className="w-3 h-3" />
                  {course.type_colis.replace(/_/g, " ")}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 text-white/70 text-[11px] font-semibold border border-white/8">
                <Clock className="w-3 h-3" />
                {new Date(course.created_date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            {/* Prix proposé */}
            {(() => {
              const prix = course.prix_propose_admin || course.prix_estimate;
              return prix > 0 ? (
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-[#00a86b]/12 to-emerald-500/8 border border-[#00a86b]/20">
                  <span className="text-[11px] text-white/50 font-semibold">Prix proposé</span>
                  <span className="text-lg font-black text-[#00a86b]">
                    {prix.toLocaleString()} <span className="text-[10px] font-bold">FCFA</span>
                  </span>
                </div>
              ) : null;
            })()}

            {/* Boutons */}
            <div className="grid grid-cols-3 gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => handleAccept(course)}
                disabled={acceptingId === course.id}
                className="col-span-2 h-12 rounded-2xl bg-gradient-to-r from-[#00a86b] to-[#008f5a] text-white text-sm font-black flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-500/20"
              >
                {acceptingId === course.id ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Accepter
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleRefuser(course)}
                disabled={acceptingId === course.id}
                className="h-12 rounded-2xl bg-gradient-to-br from-white/5 to-white/8 text-white/50 text-sm font-bold flex items-center justify-center active:scale-[0.97] transition-all border border-white/10 disabled:opacity-50 hover:from-red-500/15 hover:to-red-600/10 hover:text-red-400 hover:border-red-500/25"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}