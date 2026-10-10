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

function readDismissedCourseIds() {
  try {
    const stored = localStorage.getItem(DISMISSED_COURSES_KEY);
    if (!stored) return [];
    const now = Date.now();
    const parsed = JSON.parse(stored);
    const activeEntries = Object.fromEntries(
      Object.entries(parsed || {}).filter(([, dismissedAt]) => now - Number(dismissedAt) < DISMISS_TTL_MS)
    );
    if (Object.keys(activeEntries).length !== Object.keys(parsed || {}).length) {
      localStorage.setItem(DISMISSED_COURSES_KEY, JSON.stringify(activeEntries));
    }
    return Object.keys(activeEntries);
  } catch {
    return [];
  }
}

/**
 * Normalise un enterprise_id en valeur canonique pour comparaison.
 * Identique à normalizeEnterpriseId du backend (enterpriseFinance.ts).
 * null/undefined/"" → null (réseau public SILGAPP).
 * Toute autre valeur → string non vide (entreprise privée).
 */
function normalizeEnterpriseId(val) {
  if (val === null || val === undefined || val === "") return null;
  return String(val).trim();
}

export function useCoursesDisponibles(livreurProfil) {
  const livreurId = livreurProfil?.id;
  const countryCode = livreurProfil?.country_code;
  const livreurEnterpriseId = normalizeEnterpriseId(livreurProfil?.enterprise_id);

  const livreurDisponible =
    livreurProfil?.type_livreur === "externe" &&
    livreurProfil?.validation === "valide" &&
    livreurProfil?.actif === true &&
    livreurProfil?.statut === "disponible" &&
    livreurProfil?.bloque_encours !== true &&
    livreurProfil?.manual_hors_ligne !== true &&
    livreurProfil?.admin_hors_ligne !== true;

  // ── Visibilité du fil : tous les livreurs validés du pays voient les courses ──
  // Un livreur bloqué par l'Admin voit le fil mais ne peut pas accepter.
  // Exclus : validation != valide, autre pays
  const livreurPeutVoirFil =
    livreurProfil?.type_livreur === "externe" &&
    livreurProfil?.validation === "valide";

  // ── Raison de blocage d'acceptation (null si le livreur peut accepter) ──
  const raisonBlocage = !livreurPeutVoirFil
    ? null
    : livreurDisponible
      ? null
      : livreurProfil?.bloque_encours === true
        ? "Régularisez votre situation avant d'accepter"
        : livreurProfil?.admin_hors_ligne === true || livreurProfil?.actif === false
          ? "Votre compte est bloqué par l'administrateur. Vous pouvez consulter les courses disponibles, mais vous ne pouvez pas les accepter tant que votre compte n'est pas débloqué."
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
  // La requête ne filtre pas par enterprise_id car MongoDB ne peut pas matcher
  // null + undefined + "" dans une seule requête SDK. Le filtrage enterprise_id
  // est fait côté client dans eligibleCourses (normalisation canonique).
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses-externes-disponibles", livreurId, countryCode, livreurEnterpriseId, isV2Enabled],
    queryFn: async () => {
      if (!livreurPeutVoirFil || !isV2Enabled) return [];
      if (!countryCode || !isV2Enabled) return [];
      const all = await base44.entities.CourseExterne.filter(
        { dispatch_status: { $in: ["disponible_push", "propose"] }, country_code: countryCode },
        "-created_date", 50
      );
      const ecoIsolated = await base44.entities.CourseExterne.filter(
        {
          country_code: countryCode,
          enterprise_id: null,
          delivery_mode: "eco",
          eco_status: "isolated",
          dispatch_status: "en_attente",
        },
        "-created_date",
        30
      ).catch(() => []);
      const byId = new Map();
      [...(all || []), ...(ecoIsolated || [])].forEach((course) => {
        if (course?.id) byId.set(course.id, course);
      });
      return Array.from(byId.values());
    },
    enabled: !!livreurId && !!countryCode && livreurPeutVoirFil && isV2Enabled,
    refetchInterval: 10000,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const { data: ecoMissions = [] } = useQuery({
    queryKey: ["eco-missions-disponibles", livreurId, countryCode, livreurEnterpriseId, isV2Enabled],
    queryFn: async () => {
      if (!livreurPeutVoirFil || !isV2Enabled || !countryCode) return [];
      if (livreurEnterpriseId !== null) return [];
      return await base44.entities.EcoMission.filter(
        { status: "available", country_code: countryCode, enterprise_id: null },
        "-created_date",
        20
      ).catch(() => []);
    },
    enabled: !!livreurId && !!countryCode && livreurPeutVoirFil && isV2Enabled,
    refetchInterval: 10000,
    staleTime: 0,
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
  const [refusedIds, setRefusedIds] = useState(readDismissedCourseIds);

  useEffect(() => {
    const refreshDismissed = () => setRefusedIds(readDismissedCourseIds());
    window.addEventListener("storage", refreshDismissed);
    window.addEventListener("silgapp:dismissed-courses-changed", refreshDismissed);
    return () => {
      window.removeEventListener("storage", refreshDismissed);
      window.removeEventListener("silgapp:dismissed-courses-changed", refreshDismissed);
    };
  }, []);

  // ── Filtrage d'éligibilité (SOURCE UNIQUE) ──
  // [ENTERPRISE ISOLATION] Filtrage enterprise_id côté client (défense en profondeur).
  // Le backend (dispatchV2.ts accepterCourseV2) vérifie déjà enterprise_id, mais
  // ce filtre empêche la course d'apparaître dans le fil "Disponibles" du livreur.
  // Normalisation canonique : null/undefined/"" → null (réseau public).
  const eligibleCourses = useMemo(() => {
    const standardAndEcoCourses = courses.filter(course => {
      // [ENTERPRISE] Isolation stricte : le livreur ne voit que les courses de son périmètre.
      const courseEnterpriseId = normalizeEnterpriseId(course.enterprise_id);
      if (courseEnterpriseId !== livreurEnterpriseId) return false;
      const isEcoIsolated =
        course.delivery_mode === "eco" &&
        course.eco_status === "isolated" &&
        course.dispatch_status === "en_attente" &&
        courseEnterpriseId === null;

      if (!isEcoIsolated && course.statut === "en_attente") return false;
      if (FINAL_COURSE_STATUSES.has(course.statut)) return false;
      if (!isEcoIsolated && course.statut !== "recherche_livreur") return false;
      if (!isEcoIsolated && course.dispatch_status !== "disponible_push" && course.dispatch_status !== "propose") return false;
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
    return standardAndEcoCourses;
  }, [courses, refusedIds, refusedCourseIds, livreurId, livreurEnterpriseId]);

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
    ecoMissions,
  };
}
