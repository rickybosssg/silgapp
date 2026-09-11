import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * useCoursesDisponibles — SOURCE UNIQUE DE VÉRITÉ pour les courses disponibles
 * à un livreur. Utilisé par CoursesDisponibles (onglet fil) et ActiviteTempsReel
 * (compteur résumé) afin de garantir qu'ils affichent exactement les mêmes courses.
 *
 * Règles d'éligibilité (identiques au dispatch V2 — ne pas modifier sans validation) :
 *   - statut === "recherche_livreur" (course active)
 *   - dispatch_status === "disponible_push" (V2) ou "propose" (V1 négociation prix)
 *   - pas de livreur_id déjà assigné
 *   - pas de timeout expiré
 *   - pas de course refusée (DispatchNotification statut "refuse")
 *   - pas de course dismissée localement (localStorage, TTL 30 min)
 *
 * NE PAS MODIFIER SANS VALIDATION DU RESPONSABLE PRODUIT.
 */

const FINAL_COURSE_STATUSES = new Set(["livree", "annulee", "completed", "delivered", "canceled"]);
const DISMISSED_COURSES_KEY = "silgapp_dismissed_courses";
const DISMISS_TTL_MS = 30 * 60 * 1000;

function readActiveDismissedCourseIds() {
  try {
    const now = Date.now();
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_COURSES_KEY) || "{}");
    const activeEntries = Object.fromEntries(
      Object.entries(parsed || {}).filter(([, dismissedAt]) => now - Number(dismissedAt) < DISMISS_TTL_MS)
    );
    localStorage.setItem(DISMISSED_COURSES_KEY, JSON.stringify(activeEntries));
    return Object.keys(activeEntries);
  } catch {
    return [];
  }
}

export function useCoursesDisponibles(livreurProfil) {
  const livreurId = livreurProfil?.id;
  const countryCode = livreurProfil?.country_code;

  const livreurDisponible =
    livreurProfil?.type_livreur === "externe" &&
    livreurProfil?.validation === "valide" &&
    livreurProfil?.actif === true &&
    livreurProfil?.statut === "disponible" &&
    livreurProfil?.bloque_encours !== true &&
    livreurProfil?.manual_hors_ligne !== true &&
    livreurProfil?.admin_hors_ligne !== true;

  // ── Visibilité du fil : tous les livreurs validés/actifs du pays voient les courses ──
  // Exclus : admin_hors_ligne, validation != valide, actif=false, autre pays
  const livreurPeutVoirFil =
    livreurProfil?.type_livreur === "externe" &&
    livreurProfil?.validation === "valide" &&
    livreurProfil?.actif === true &&
    livreurProfil?.admin_hors_ligne !== true;

  // ── Raison de blocage d'acceptation (null si le livreur peut accepter) ──
  const raisonBlocage = !livreurPeutVoirFil
    ? null
    : livreurDisponible
      ? null
      : livreurProfil?.bloque_encours === true
        ? "Régularisez votre situation avant d'accepter"
        : livreurProfil?.statut === "en_course"
          ? "Vous êtes déjà en course"
          : "Passez en ligne pour accepter";

  // ── Feature flag V2 ──
  const { data: isV2Enabled = true } = useQuery({
    queryKey: ["dispatch-v2-enabled", livreurId],
    queryFn: async () => {
      const configs = await base44.entities.AppConfig.filter({ cle: "DISPATCH_V2_ENABLED" });
      return configs?.[0] ? configs[0].valeur !== "false" : true;
    },
    enabled: !!livreurId,
    staleTime: 60000,
  });

  // ── Courses disponibles (fetch brut) ──
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses-externes-disponibles", livreurId, countryCode, isV2Enabled],
    queryFn: async () => {
      if (!countryCode || !isV2Enabled) return [];
      const all = await base44.entities.CourseExterne.filter(
        { dispatch_status: { $in: ["disponible_push", "propose"] }, country_code: countryCode },
        "-created_date", 50
      );
      return all || [];
    },
    enabled: !!livreurId && !!countryCode && livreurPeutVoirFil && isV2Enabled,
    refetchInterval: 10000,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // ── Courses refusées (DispatchNotification) ──
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

  // ── Courses dismissées localement (localStorage, TTL 30 min) ──
  const [refusedIds, setRefusedIds] = useState(readActiveDismissedCourseIds);

  useEffect(() => {
    const refreshDismissedIds = () => setRefusedIds(readActiveDismissedCourseIds());
    window.addEventListener("silgapp:dismissed-courses-changed", refreshDismissedIds);
    const interval = window.setInterval(refreshDismissedIds, 60000);
    return () => {
      window.removeEventListener("silgapp:dismissed-courses-changed", refreshDismissedIds);
      window.clearInterval(interval);
    };
  }, []);

  // ── Filtrage d'éligibilité (SOURCE UNIQUE) ──
  const eligibleCourses = useMemo(() => {
    if (!livreurPeutVoirFil || !isV2Enabled) return [];
    return courses.filter(course => {
      if (course.statut === "en_attente") return false;
      if (FINAL_COURSE_STATUSES.has(course.statut)) return false;
      if (course.statut !== "recherche_livreur") return false;
      if (course.dispatch_status !== "disponible_push" && course.dispatch_status !== "propose") return false;
      if (course.dispatch_status === "redispatch") return false;
      if (course.livreur_id || course.accepted_by_livreur_id) return false;
      if (refusedIds.includes(course.id)) return false;
      if (course.timeout_expires_at) {
        const expires = new Date(course.timeout_expires_at);
        if (!isNaN(expires.getTime()) && expires < new Date()) return false;
      }
      if (refusedCourseIds.includes(course.id)) return false;
      return true;
    });
  }, [courses, refusedIds, refusedCourseIds, livreurPeutVoirFil, isV2Enabled]);

  return {
    eligibleCourses,
    courses,
    isLoading,
    isV2Enabled,
    livreurDisponible,
    livreurPeutVoirFil,
    raisonBlocage,
    refusedCourseIds,
    setRefusedIds,
  };
}
