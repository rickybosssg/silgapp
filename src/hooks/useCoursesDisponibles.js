import { useEffect, useMemo, useState } from "react";
import { selectAvailableCourseOffers } from "@/lib/availableCourseOffers";
import { acquireQuerySubscription, createRealtimeRefresh } from "@/lib/sharedQuerySubscription";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { cityNamesPattern, operationalCityAliases, resolveOperationalName, canSeeOperationalCourse } from "../../base44/shared/cityNames.js";
import { currentDriverGpsCity, gpsFixTime, CITY_GPS_MAX_AGE_MS } from "../../base44/shared/currentGpsCity.js";

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
  const queryClient = useQueryClient();
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

  const { data: zonePolicy = { cities: [], quartiers: [] }, isLoading: cityLoading, isError: cityError } = useQuery({
    queryKey: ['operational-zone-policy', countryCode],
    queryFn: async () => {
      const cities = await base44.entities.OperationalCity.filter({ country_code: countryCode }, undefined, 100);
      const quartiers = cities.some(c => c.actif === true)
        ? await base44.entities.Quartier.filter({ country_code: countryCode, actif: true }, undefined, 1000) : [];
      // Invalid or overlapping aliases are a query error, not a render-time crash.
      if (cities.some(c => c.actif === true)) {
        for (const city of cities) {
          for (const alias of operationalCityAliases(city, quartiers)) {
            resolveOperationalName(alias, cities, quartiers);
          }
        }
      }
      return { cities, quartiers };
    },
    enabled: !!countryCode, staleTime: 30000, refetchInterval: 60000,
  });
  useEffect(() => {
    if (!countryCode) return;
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['operational-zone-policy', countryCode] });
    return acquireQuerySubscription(queryClient, JSON.stringify(['zone-policy', countryCode]), () => {
      const unsubscribeCities = base44.entities.OperationalCity.subscribe(refresh);
      try {
        const unsubscribeQuartiers = base44.entities.Quartier.subscribe(refresh);
        return () => { unsubscribeCities(); unsubscribeQuartiers(); };
      } catch (error) { unsubscribeCities(); throw error; }
    });
  }, [queryClient, countryCode]);
  const cityDispatchEnabled = zonePolicy.cities.some(c => c.actif === true);
  const { data: liveGpsDriver, isError: gpsError } = useQuery({
    queryKey: ['driver-current-gps', livreurId, countryCode],
    queryFn: async () => {
      const driver = await base44.entities.Livreur.get(livreurId);
      if (driver?.country_code !== countryCode || normalizeEnterpriseId(driver?.enterprise_id) !== livreurEnterpriseId) {
        throw new Error('driver_scope_mismatch');
      }
      return driver;
    },
    enabled: !!livreurId && !!countryCode && cityDispatchEnabled && !cityError,
    refetchInterval: 10000, staleTime: 0,
  });
  const [gpsClock, setGpsClock] = useState(() => Date.now());
  useEffect(() => {
    const acquired = gpsFixTime(liveGpsDriver?.gps_fix_date);
    if (!cityDispatchEnabled || !Number.isFinite(acquired) || acquired + CITY_GPS_MAX_AGE_MS < Date.now()) return;
    const timeout = setTimeout(() => setGpsClock(Date.now()), Math.max(0, acquired + CITY_GPS_MAX_AGE_MS - Date.now() + 1));
    return () => clearTimeout(timeout);
  }, [cityDispatchEnabled, liveGpsDriver?.gps_fix_date]);
  useEffect(() => {
    if (!cityDispatchEnabled || !livreurId) return;
    return acquireQuerySubscription(queryClient, JSON.stringify(['driver-gps', livreurId, countryCode, livreurEnterpriseId]), () => base44.entities.Livreur.subscribe(event => {
      const changedId = event?.data?.id ?? event?.id;
      if (!changedId || String(changedId) === String(livreurId)) {
        queryClient.invalidateQueries({ queryKey: ['driver-current-gps', livreurId, countryCode] });
      }
    }));
  }, [queryClient, cityDispatchEnabled, livreurId, countryCode, livreurEnterpriseId]);
  const driverZone = cityDispatchEnabled && !gpsError
    ? currentDriverGpsCity(liveGpsDriver, zonePolicy.cities, zonePolicy.quartiers, Math.max(gpsClock, Date.now())) : null;
  const excludedAliases = zonePolicy.cities.filter(c => c.actif === true && c.nom !== driverZone)
    .flatMap(c => operationalCityAliases(c, zonePolicy.quartiers));
  const cityFilter = excludedAliases.length
    ? { ville_depart: { $not: { $regex: cityNamesPattern(excludedAliases), $options: 'i' } } } : {};
  const policyKey = JSON.stringify(zonePolicy);
  const { data: courses = [], isLoading: coursesLoading, isError: coursesError } = useQuery({
    queryKey: ["courses-externes-disponibles", livreurId, countryCode, livreurEnterpriseId, isV2Enabled, driverZone, policyKey],
    queryFn: async () => {
      if (!livreurPeutVoirFil || !isV2Enabled) return [];
      if (!countryCode || !isV2Enabled) return [];
      const all = await base44.entities.CourseExterne.filter(
        { dispatch_status: { $in: ["disponible_push", "propose"] }, country_code: countryCode, ...cityFilter },
        "-created_date", 50
      );
      const ecoIsolated = await base44.entities.CourseExterne.filter(
        {
          country_code: countryCode,
          enterprise_id: null,
          delivery_mode: "eco",
          eco_status: "isolated",
          dispatch_status: "en_attente",
          ...cityFilter,
        },
        "-created_date",
        30
      );
      const byId = new Map();
      [...(all || []), ...(ecoIsolated || [])].forEach((course) => {
        if (course?.id) byId.set(course.id, course);
      });
      return Array.from(byId.values()).filter(c => canSeeOperationalCourse(c, driverZone, zonePolicy.cities, zonePolicy.quartiers));
    },
    enabled: !!livreurId && !!countryCode && livreurPeutVoirFil && isV2Enabled && !cityLoading && !cityError,
    refetchInterval: 10000,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const { data: ecoMissions = [], isLoading: missionsLoading, isError: missionsError } = useQuery({
    queryKey: ["eco-missions-disponibles", livreurId, countryCode, livreurEnterpriseId, isV2Enabled, driverZone, policyKey, "members-v2"],
    queryFn: async () => {
      if (!livreurPeutVoirFil || !isV2Enabled || !countryCode) return [];
      if (livreurEnterpriseId !== null) return [];
      const missions = await base44.entities.EcoMission.filter(
        { status: "available", country_code: countryCode, enterprise_id: null },
        "-created_date",
        20
      );
      if (!missions?.length) return [];
      const ids = [...new Set(missions.flatMap(m => m.course_ids || []))];
      if (!ids.length) return [];
      const records = await base44.entities.CourseExterne.filter({ id: { $in: ids }, country_code: countryCode, enterprise_id: null }, undefined, ids.length);
      const byId = new Map((records || []).map(c => [c.id, c]));
      return missions.filter(m => m.course_ids?.length && m.course_ids.every(id => {
        const c = byId.get(id);
        return c && canSeeOperationalCourse(c, driverZone, zonePolicy.cities, zonePolicy.quartiers);
      })).map(m => ({ ...m, __available_courses: m.course_ids.map(id => byId.get(id)) }));
    },
    enabled: !!livreurId && !!countryCode && livreurPeutVoirFil && isV2Enabled && !cityLoading && !cityError,
    refetchInterval: 10000,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  useEffect(() => {
    if (!livreurId || !countryCode || !livreurPeutVoirFil) return;
    return acquireQuerySubscription(queryClient, JSON.stringify(['available-feed', livreurId, countryCode, livreurEnterpriseId]), () => {
      const refreshQueue = createRealtimeRefresh(() => Promise.all([
        queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles", livreurId, countryCode] }, { cancelRefetch: false }),
        queryClient.invalidateQueries({ queryKey: ["eco-missions-disponibles", livreurId, countryCode] }, { cancelRefetch: false }),
      ]));
      const refresh = event => {
        // Partial/delete events still refresh: missing metadata is not proof
        // that the changed record belongs to another country.
        if (event?.data?.country_code && event.data.country_code !== countryCode) return;
        refreshQueue.schedule();
      };
      const unsubscribeCourses = base44.entities.CourseExterne.subscribe(refresh);
      try {
        const unsubscribeMissions = livreurEnterpriseId === null ? base44.entities.EcoMission.subscribe(refresh) : null;
        return () => { refreshQueue.stop(); unsubscribeCourses?.(); unsubscribeMissions?.(); };
      } catch (error) { refreshQueue.stop(); unsubscribeCourses?.(); throw error; }
    });
  }, [queryClient, livreurId, countryCode, livreurEnterpriseId, livreurPeutVoirFil]);

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
    if (cityLoading || cityError) return [];
    const standardAndEcoCourses = courses.filter(course => {
      if (course.country_code !== countryCode || !canSeeOperationalCourse(course, driverZone, zonePolicy.cities, zonePolicy.quartiers)) return false;
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
  }, [courses, refusedIds, refusedCourseIds, livreurId, livreurEnterpriseId, countryCode, driverZone, zonePolicy, cityLoading, cityError]);

  const availableFeed = useMemo(() => selectAvailableCourseOffers({
    courses: eligibleCourses, missions: cityLoading || cityError ? [] : ecoMissions,
    countryCode, enterpriseId: livreurEnterpriseId, refusedIds: [...refusedIds, ...refusedCourseIds],
  }), [eligibleCourses, ecoMissions, countryCode, livreurEnterpriseId, refusedIds, refusedCourseIds, cityLoading, cityError]);

  return {
    eligibleCourses: availableFeed.individualCourses,
    availableOffers: availableFeed.offers,
    availableOffersCount: availableFeed.count,
    courses,
    isLoading: cityLoading || coursesLoading || missionsLoading,
    isError: cityError || coursesError || missionsError,
    isV2Enabled,
    livreurDisponible,
    livreurPeutVoirFil,
    raisonBlocage,
    refusedCourseIds,
    setRefusedIds,
    ecoMissions: availableFeed.missions,
  };
}
