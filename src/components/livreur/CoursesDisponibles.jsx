import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Check, X, MapPin, Clock, Package, Flame, Navigation } from "lucide-react";
import { toast } from "sonner";

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

export default function CoursesDisponibles({ livreurProfil, onAcceptSuccess }) {
  const queryClient = useQueryClient();
  const [acceptingId, setAcceptingId] = useState(null);
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

  // ── Vérifier si ce livreur fait partie du pilote V2 ──
  const { data: isPilot = false } = useQuery({
    queryKey: ["dispatch-v2-pilot", livreurId],
    queryFn: async () => {
      if (!livreurId) return false;
      const configs = await base44.entities.AppConfig.filter(
        { cle: { $in: ["DISPATCH_V2_PILOT_ENABLED", "DISPATCH_V2_PILOT_LIVREUR_IDS"] } }
      );
      const enabled = configs.find(c => c.cle === "DISPATCH_V2_PILOT_ENABLED")?.valeur === "true";
      const idsStr = configs.find(c => c.cle === "DISPATCH_V2_PILOT_LIVREUR_IDS")?.valeur || "";
      const ids = idsStr.split(",").map(s => s.trim()).filter(Boolean);
      return enabled && ids.includes(livreurId);
    },
    enabled: !!livreurId,
    staleTime: 60000,
  });

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses-externes-disponibles", livreurId, countryCode, isPilot],
    queryFn: async () => {
      if (!countryCode || !isPilot) return [];
      // Pilote : voir les courses en propose (V1) + disponible_push (V2)
      const all = await base44.entities.CourseExterne.filter(
        { dispatch_status: { $in: ["disponible_push", "propose"] }, country_code: countryCode },
        "-created_date", 50
      );
      return all || [];
    },
    enabled: !!livreurId && !!countryCode && isPilot,
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

  if (!isPilot) {
    return (
      <div className="rounded-2xl bg-[#1f2429] border border-white/8 p-8 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
          <Flame className="w-7 h-7 text-white/30" />
        </div>
        <p className="text-sm font-bold text-white/70">Fil V2 non disponible</p>
        <p className="text-xs text-white/40">
          Le fil de courses disponibles est actuellement en phase de test pilote.
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
      <div className="rounded-2xl bg-[#1f2429] border border-white/8 p-8 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
          <Flame className="w-7 h-7 text-white/30" />
        </div>
        <p className="text-sm font-bold text-white/70">Aucune course disponible</p>
        <p className="text-xs text-white/40">
          Les courses non acceptées par le dispatch automatique apparaîtront ici.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Flame className="w-5 h-5 text-orange-400" />
        <h2 className="text-base font-black text-white">Courses disponibles</h2>
        <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-black flex items-center justify-center">
          {coursesWithDistance.length}
        </span>
      </div>

      {coursesWithDistance.map(course => (
        <div
          key={course.id}
          className="rounded-2xl bg-[#1f2429] border border-white/8 p-4 space-y-3 shadow-sm"
        >
          {/* Priorité badge */}
          {course.priority === "urgente" && (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-black">
              URGENTE
            </div>
          )}
          {course.priority === "haute" && (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-black">
              PRIORITÉ HAUTE
            </div>
          )}

          {/* Départ */}
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-[#00a86b] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-white/40 font-semibold uppercase">Récupération</p>
              <p className="text-sm text-white font-semibold truncate">
                {course.quartier_depart || course.adresse_depart || "Adresse à confirmer"}
              </p>
            </div>
          </div>

          {/* Arrivée */}
          <div className="flex items-start gap-2">
            <Navigation className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-white/40 font-semibold uppercase">Livraison</p>
              <p className="text-sm text-white font-semibold truncate">
                {course.quartier_arrivee || course.adresse_arrivee || "Adresse à confirmer"}
              </p>
            </div>
          </div>

          {/* Métadonnées */}
          <div className="flex items-center gap-3 text-[11px] text-white/50">
            {course.__distance !== null && (
              <span className="flex items-center gap-1">
                <Navigation className="w-3 h-3" />
                {course.__distance.toFixed(1)} km
              </span>
            )}
            {course.type_colis && (
              <span className="flex items-center gap-1">
                <Package className="w-3 h-3" />
                {course.type_colis.replace("_", " ")}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(course.created_date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          {/* Boutons */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleAccept(course)}
              disabled={acceptingId === course.id}
              className="col-span-2 h-11 rounded-xl bg-[#00a86b] text-white text-sm font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {acceptingId === course.id ? (
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Accepter
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleRefuser(course)}
              disabled={acceptingId === course.id}
              className="h-11 rounded-xl bg-white/5 text-white/60 text-sm font-bold flex items-center justify-center active:scale-95 transition-all border border-white/8 disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}