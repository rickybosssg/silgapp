import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Check, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/ui/PullToRefreshIndicator";

import { registerPushToken, subscribeToNotifications } from "@/lib/notifications";
import { requestNativeAppPermissions } from "@/lib/nativePermissions";
import { startNativeBackgroundHeartbeat } from "@/lib/nativeAndroid";
import {
  normalizeLivreurAlertConfig,
  saveLivreurAlertConfig,
  stopUrgentCourseAlert,
} from "@/lib/livreurUrgentAlert";
import LivreurHeader from "@/components/livreur/LivreurHeader";
import LivreurStatsBanner from "@/components/livreur/LivreurStatsBanner";
import LivreurStatutCard from "@/components/livreur/LivreurStatutCard";
import EmptyStateAttente from "@/components/livreur/EmptyStateAttente";
import CourseEnAttenteModalExterne from "@/components/livreur/CourseEnAttenteModalExterne";
import CourseActiveCard from "@/components/livreur/CourseActiveCard";
import LivreurHistorique from "@/components/livreur/LivreurHistorique";
import LivreurExterneOnboarding from "@/components/livreur/LivreurExterneOnboarding";
import LivreurMesInfosModal from "@/components/livreur/LivreurMesInfosModal";
import VenusFloatingButton from "@/components/client/VenusFloatingButton";
import AlertesLivreurModal from "@/components/livreur/AlertesLivreurModal";
import PubliciteCarousel from "@/components/publicite/PubliciteCarousel";
import PubliciteFullscreen from "@/components/publicite/PubliciteFullscreen";
import PricingModeSelector from "@/components/livreur/PricingModeSelector";
import PrixManuelReponseAlert from "@/components/livreur/PrixManuelReponseAlert";

// Haversine — utilisée aussi pour le calcul de prix
function calculerDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const saveLivreur = (id, data) => base44.functions.invoke('updateLivreur', { id, data });

const PROPOSED_DISPATCH_STATUSES = new Set(["propose", "assigne_manuel", "en_attente_reponse"]);
const PROPOSED_COURSE_STATUSES = new Set(["nouvelle", "recherche_livreur", "en_attente_livreur", "en_attente"]);
const FINAL_COURSE_STATUSES = new Set(["livree", "annulee", "completed", "delivered", "canceled"]);

function uniqById(items = []) {
  const map = new Map();
  items.filter(Boolean).forEach((item) => {
    if (item?.id && !map.has(item.id)) map.set(item.id, item);
  });
  return [...map.values()];
}

function listIncludesLivreur(value, livreurId) {
  if (!value || !livreurId) return false;
  if (Array.isArray(value)) return value.map(String).includes(String(livreurId));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).includes(String(livreurId));
    } catch (_) {}
    return value.split(/[,\s]+/).includes(String(livreurId));
  }
  return false;
}

function sameLivreurId(value, livreurId) {
  return !!value && !!livreurId && String(value) === String(livreurId);
}

function isCourseTargetingLivreur(course, livreurId) {
  if (!course || !livreurId) return false;
  return (
    course.__notifiedForCurrentLivreur === true ||
    sameLivreurId(course.livreur_id, livreurId) ||
    sameLivreurId(course.proposed_by_livreur_id, livreurId) ||
    sameLivreurId(course.proposed_livreur_id, livreurId) ||
    listIncludesLivreur(course.dispatch_notified_ids, livreurId) ||
    listIncludesLivreur(course.notified_livreur_ids, livreurId)
  );
}

function isCourseWaitingForLivreur(course, livreurId) {
  if (!isCourseTargetingLivreur(course, livreurId)) return false;
  if (course.manual_price_status === "pending_client_validation") return false;
  if (FINAL_COURSE_STATUSES.has(course.statut)) return false;
  return (
    PROPOSED_DISPATCH_STATUSES.has(course.dispatch_status) &&
    PROPOSED_COURSE_STATUSES.has(course.statut)
  );
}

function isCourseOwnedByLivreur(course, livreurId) {
  if (!course || !livreurId) return false;
  return (
    sameLivreurId(course.livreur_id, livreurId) ||
    sameLivreurId(course.proposed_by_livreur_id, livreurId) ||
    sameLivreurId(course.proposed_livreur_id, livreurId)
  );
}

function logAcceptationLivreur(event, details = {}) {
  try {
    if (localStorage.getItem("silgapp_livreur_acceptation_debug") === "true") {
      console.info(`[LivreurAcceptation] ${event}`, details);
    }
  } catch (_) {}
}

export default function LivreurExterneApp({ livreurProfil: initialProfil }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("courses");
  const [gpsActif, setGpsActif] = useState(false);
  const [onboardingTermine, setOnboardingTermine] = useState(false);
  const [showMesInfos, setShowMesInfos] = useState(false);
  const [pricingMode, setPricingMode] = useState(() => {
    try { return localStorage.getItem("silgapp_pricing_mode") || "automatic"; } catch { return "automatic"; }
  });
  // Réponse du client à une proposition de prix manuel
  const [prixManuelReponse, setPrixManuelReponse] = useState(null); // { accepted, prix, devise }
  const prixManuelWatchedRef = useRef({}); // track les course_id déjà notifiés

  // Pull-to-refresh
  const { pulling, refreshing } = usePullToRefresh(async () => {
    await queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
    await queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
  });


  // ─── Profil livreur ───────────────────────────────────────────────────────
  const { data: livreurProfil } = useQuery({
    queryKey: ["livreur-externe-profil", initialProfil?.id],
    queryFn: () => base44.entities.Livreur.filter({ id: initialProfil.id }),
    select: (data) => Array.isArray(data) ? (data[0] || initialProfil) : initialProfil,
    initialData: [initialProfil],
    enabled: !!initialProfil?.id,
    refetchInterval: 8000, // ⚡ 2s → 8s : profil change rarement
    staleTime: 4000,
  });

  // Synchroniser le pricingMode depuis le profil BDD au chargement
  useEffect(() => {
    if (livreurProfil?.pricing_mode && livreurProfil.pricing_mode !== pricingMode) {
      setPricingMode(livreurProfil.pricing_mode);
      try { localStorage.setItem("silgapp_pricing_mode", livreurProfil.pricing_mode); } catch {}
    }
  }, [livreurProfil?.pricing_mode, livreurProfil?.id]);

  // Heartbeat automatique
  const { syncHeartbeat } = useHeartbeat({
    user_type: "livreur",
    position: livreurProfil?.latitude && livreurProfil?.longitude ? { latitude: livreurProfil.latitude, longitude: livreurProfil.longitude } : null,
    enabled: onboardingTermine && gpsActif && livreurProfil?.statut !== "hors_ligne",
    debugLabel: "LivreurExterneGPS",
  });

  const { data: dispatchConfigs = [] } = useQuery({
    queryKey: ["dispatch-config"],
    queryFn: () => base44.entities.DispatchConfig.list(),
    initialData: [],
    refetchInterval: 30000,
  });

  const livreurAlertConfig = useMemo(() => {
    const config = normalizeLivreurAlertConfig(dispatchConfigs?.[0] || {});
    saveLivreurAlertConfig(config);
    return config;
  }, [dispatchConfigs]);

  useEffect(() => {
    if (!onboardingTermine || !gpsActif || livreurProfil?.statut === "hors_ligne") return;
    let stopNativeHeartbeat = null;
    let cancelled = false;

    startNativeBackgroundHeartbeat({
      userType: "livreur",
      intervalMs: 5000,
      distanceFilter: 0,
    }).then((stop) => {
      if (cancelled) stop?.();
      else stopNativeHeartbeat = stop;
    }).catch((error) => {
      console.warn("[LivreurExterneGPS] native background heartbeat unavailable:", error?.message);
    });

    return () => {
      cancelled = true;
      stopNativeHeartbeat?.();
    };
  }, [onboardingTermine, gpsActif, livreurProfil?.statut]);

  // ─── Notifications push ───────────────────────────────────────────────────
  const livreurId = livreurProfil?.id;
  const livreurEmail = livreurProfil?.user_email;
  const [notificationCourseId, setNotificationCourseId] = useState(null);
  const [notificationCourseCandidate, setNotificationCourseCandidate] = useState(null);
  const [courseProposeeDirecte, setCourseProposeeDirecte] = useState(null);
  useEffect(() => {
    if (!livreurId || !livreurEmail) return;
    registerPushToken(livreurId, {
      email: livreurEmail,
      user_email: livreurEmail,
      user_type: "livreur",
      livreur_id: livreurId,
    }).catch(() => null);
    const unsub = subscribeToNotifications(
      (n) => {
        toast.info(n.titre, { description: n.message });
        if ((n.type === "nouvelle_course" || n.type === "course_assignee") && n.course_id) {
          setNotificationCourseId(n.course_id);
          setActiveTab("courses");
          queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
          logAcceptationLivreur("realtime-notification-course", {
            course_id: n.course_id,
            current_livreur_id: livreurId,
          });
        }
      },
      livreurEmail,
      { userType: "livreur", livreurId }
    );
    return () => unsub?.();
  }, [livreurId, livreurEmail, queryClient]);

  useEffect(() => {
    const handleNotificationOpened = (event) => {
      const data = event?.detail || {};
      if (data.type !== "nouvelle_course" && data.type !== "course_assignee") return;
      stopUrgentCourseAlert("app-opened");
      if (data.course_id) setNotificationCourseId(data.course_id);
      setActiveTab("courses");
      queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
      queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
      logAcceptationLivreur("notification-opened", {
        course_id: data.course_id || null,
        livreur_id: data.livreur_id || null,
        current_livreur_id: livreurId || null,
      });
      toast.info("Course proposee", { description: "Ouverture de la course en attente..." });
    };
    window.addEventListener("silgapp:notification-opened", handleNotificationOpened);
    return () => window.removeEventListener("silgapp:notification-opened", handleNotificationOpened);
  }, [queryClient, livreurId]);

  useEffect(() => {
    const handleUrgentAlertStarted = (event) => {
      const courseId = event?.detail?.courseId;
      if (!courseId) return;
      setNotificationCourseId(courseId);
      setActiveTab("courses");
      queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
      logAcceptationLivreur("urgent-alert-started", {
        course_id: courseId,
        source: event?.detail?.source || null,
        current_livreur_id: livreurId || null,
      });
    };
    window.addEventListener("silgapp:livreur-urgent-alert-started", handleUrgentAlertStarted);
    return () => window.removeEventListener("silgapp:livreur-urgent-alert-started", handleUrgentAlertStarted);
  }, [queryClient, livreurId]);

  useEffect(() => {
    if (!notificationCourseId) {
      setNotificationCourseCandidate(null);
      return;
    }

    let cancelled = false;
    base44.entities.CourseExterne.get(notificationCourseId)
      .then((course) => {
        if (!cancelled) {
          const isUsableForCurrentLivreur = course && (
            isCourseOwnedByLivreur(course, livreurId) ||
            isCourseWaitingForLivreur({ ...course, __notifiedForCurrentLivreur: true }, livreurId)
          );
          setNotificationCourseCandidate(
            isUsableForCurrentLivreur ? { ...course, __notifiedForCurrentLivreur: true } : null
          );
        }
      })
      .catch((error) => {
        logAcceptationLivreur("notification-course-direct-fetch-error", {
          course_id: notificationCourseId,
          error: error?.message || String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [notificationCourseId, livreurId]);

  useEffect(() => {
    const refreshCourses = () => {
      if (!livreurId) return;
      queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
      queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshCourses();
    };
    window.addEventListener("focus", refreshCourses);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", refreshCourses);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [queryClient, livreurId]);

  useEffect(() => {
    if (!livreurId || !livreurEmail || !onboardingTermine) return;

    let alreadyAsked = false;
    try { alreadyAsked = localStorage.getItem(`livreur_native_permissions_requested_${livreurId}`) === "true"; } catch (_) {}
    if (alreadyAsked) return;

    requestNativeAppPermissions({
      email: livreurEmail,
      userType: "livreur",
      livreurId,
      requestContacts: true,
    }).then(() => {
      localStorage.setItem(`livreur_native_permissions_requested_${livreurId}`, "true");
    }).catch((error) => {
      console.warn("[LivreurExterneApp] Permissions natives ignorees:", error?.message);
    });
  }, [livreurId, livreurEmail, onboardingTermine]);

  // ─── Heartbeat app_active ─────────────────────────────────────────────────
  // Géré par useHeartbeat hook + heartbeatAuto backend — supprimé pour éviter doublon

  // ─── Mes courses ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!livreurId) {
      setCourseProposeeDirecte(null);
      return;
    }

    let cancelled = false;

    const checkCourseProposee = async () => {
      try {
        const allCourses = await base44.entities.CourseExterne.list("-created_date", 50);
        if (cancelled) return;

        const found = (allCourses || []).find((course) => (
          course.dispatch_status === "propose" &&
          !course.livreur_id &&
          !course.accepted_by_livreur_id &&
          !FINAL_COURSE_STATUSES.has(course.statut) &&
          course.manual_price_status !== "pending_client_validation" &&
          (!livreurProfil?.country_code || course.country_code === livreurProfil.country_code) &&
          listIncludesLivreur(course.dispatch_notified_ids, livreurId)
        )) || null;

        setCourseProposeeDirecte(
          found ? { ...found, __notifiedForCurrentLivreur: true } : null
        );
      } catch (error) {
        logAcceptationLivreur("direct-proposed-course-poll-error", {
          error: error?.message || String(error),
        });
      }
    };

    checkCourseProposee();
    const interval = setInterval(checkCourseProposee, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [livreurId, livreurProfil?.country_code]);

  const { data: mesCourses = [] } = useQuery({
    queryKey: ["mes-courses-externes", livreurId, livreurEmail, notificationCourseId],
    queryFn: async () => {
      const results = [];
      const allCoursesForLivreur = await base44.functions.invoke("getAllCoursesForLivreur", {
        livreur_id: livreurId,
      }).then((res) => res?.data?.courses || []).catch((error) => {
        logAcceptationLivreur("get-all-courses-for-livreur-error", {
          error: error?.message || String(error),
        });
        return [];
      });

      const [assigned, proposedByLivreur, proposedLivreur, notificationsNouvelleCourse, notificationsCourseAssignee] = await Promise.all([
        base44.entities.CourseExterne.filter({ livreur_id: livreurId }, "-updated_date", 50).catch((error) => {
          logAcceptationLivreur("query-assigned-error", { error: error?.message || String(error) });
          return [];
        }),
        base44.entities.CourseExterne.filter({ proposed_by_livreur_id: livreurId }, "-updated_date", 20).catch((error) => {
          logAcceptationLivreur("query-proposed-error", { error: error?.message || String(error) });
          return [];
        }),
        base44.entities.CourseExterne.filter({ proposed_livreur_id: livreurId }, "-updated_date", 20).catch((error) => {
          logAcceptationLivreur("query-proposed-livreur-error", { error: error?.message || String(error) });
          return [];
        }),
        livreurEmail
          ? base44.entities.Notification.filter({
              destinataire_email: livreurEmail,
              type: "nouvelle_course",
            }, "-created_date", 20).catch((error) => {
              logAcceptationLivreur("query-notifications-nouvelle-course-error", { error: error?.message || String(error) });
              return [];
            })
          : Promise.resolve([]),
        livreurEmail
          ? base44.entities.Notification.filter({
              destinataire_email: livreurEmail,
              type: "course_assignee",
            }, "-created_date", 20).catch((error) => {
              logAcceptationLivreur("query-notifications-course-assignee-error", { error: error?.message || String(error) });
              return [];
            })
          : Promise.resolve([]),
      ]);

      results.push(
        ...(allCoursesForLivreur || []),
        ...(assigned || []),
        ...(proposedByLivreur || []),
        ...(proposedLivreur || [])
      );

      const notificationCourseIds = [
        notificationCourseId,
        ...(notificationsNouvelleCourse || []).map((n) => n.course_id),
        ...(notificationsCourseAssignee || []).map((n) => n.course_id),
      ].filter(Boolean);

      if (notificationCourseIds.length > 0) {
        const fromNotifications = await Promise.all(
          [...new Set(notificationCourseIds)].slice(0, 10).map((courseId) =>
            base44.entities.CourseExterne.get(courseId)
              .then((course) => course ? { ...course, __notifiedForCurrentLivreur: true } : null)
              .catch((error) => {
                logAcceptationLivreur("query-course-by-notification-error", {
                  course_id: courseId,
                  error: error?.message || String(error),
                });
                return null;
              })
          )
        );
        results.push(...fromNotifications.filter(Boolean));
      }

      const merged = uniqById(results);
      const scopedCourses = merged.filter((course) => (
        isCourseOwnedByLivreur(course, livreurId) ||
        isCourseWaitingForLivreur(course, livreurId)
      ));
      logAcceptationLivreur("courses-detected", {
        livreur_id: livreurId,
        all_courses_for_livreur: allCoursesForLivreur?.length || 0,
        assigned: assigned?.length || 0,
        proposed_by_livreur: proposedByLivreur?.length || 0,
        proposed_livreur: proposedLivreur?.length || 0,
        notification_courses: notificationCourseIds.length,
        merged: merged.length,
        scoped: scopedCourses.length,
        ignored_not_owned: merged.length - scopedCourses.length,
        waiting: scopedCourses.filter((course) => isCourseWaitingForLivreur(course, livreurId)).map((course) => ({
          id: course.id,
          statut: course.statut,
          dispatch_status: course.dispatch_status,
          livreur_id: course.livreur_id || "",
          proposed_by_livreur_id: course.proposed_by_livreur_id || "",
        })),
      });

      return scopedCourses;
    },
    enabled: !!livreurId,
    initialData: [],
    refetchInterval: 4000, // ⚡ 1s → 4s : évite le rate limit (était 60 req/min)
    staleTime: 2000,
  });

  // ─── Course en attente de réponse du livreur ──────────────────────────────
  const courseCandidates = useMemo(
    () => uniqById([...(mesCourses || []), notificationCourseCandidate, courseProposeeDirecte].filter(Boolean)),
    [mesCourses, notificationCourseCandidate, courseProposeeDirecte]
  );

  const courseEnAttente = useMemo(() => {
    const waiting = courseCandidates.find((course) => isCourseWaitingForLivreur(course, livreurId)) || null;
    if (waiting) {
      logAcceptationLivreur("modal-triggered", {
        course_id: waiting.id,
        statut: waiting.statut,
        dispatch_status: waiting.dispatch_status,
        livreur_id: waiting.livreur_id || "",
        proposed_by_livreur_id: waiting.proposed_by_livreur_id || "",
      });
    } else if (courseCandidates.length > 0 && livreurId) {
      logAcceptationLivreur("modal-blocked-no-waiting-course", {
        livreur_id: livreurId,
        courses: courseCandidates.slice(0, 8).map((course) => ({
          id: course.id,
          statut: course.statut,
          dispatch_status: course.dispatch_status,
          livreur_id: course.livreur_id || "",
          proposed_by_livreur_id: course.proposed_by_livreur_id || "",
          manual_price_status: course.manual_price_status || "",
          targets_livreur: isCourseTargetingLivreur(course, livreurId),
        })),
      });
    }
    return waiting;
  }, [courseCandidates, livreurId]);

  // ─── Course en attente de validation prix par le client ───────────────────
  const courseEnAttenteValidationPrix = useMemo(() => {
    return mesCourses.find(
      c => c.pricing_mode === "manual" && c.manual_price_status === "pending_client_validation"
        && !FINAL_COURSE_STATUSES.has(c.statut)
        && c.proposed_by_livreur_id === livreurProfil?.id
    ) || null;
  }, [mesCourses, livreurProfil?.id]);

  // ─── Courses actives ──────────────────────────────────────────────────────
  const coursesActives = useMemo(
    () => mesCourses.filter(c =>
      sameLivreurId(c.livreur_id, livreurProfil?.id) &&
      ["livreur_en_route", "colis_recupere", "en_livraison"].includes(c.statut)
    ),
    [mesCourses, livreurProfil?.id]
  );

  // Détecter la réponse du client sur une proposition de prix manuel
  // Statuts finaux pour lesquels on n'affiche JAMAIS la modale
  const FINAL_STATUSES = ['livree', 'annulee', 'completed', 'delivered', 'canceled'];
  
  useEffect(() => {
    if (!mesCourses.length || !livreurProfil?.id) return;
    
    // Étape 1 : Marquer TOUTES les courses terminées comme "dismissed" AVANT toute autre logique
    mesCourses.forEach(course => {
      if (course.proposed_by_livreur_id !== livreurProfil.id) return;
      if (course.pricing_mode !== 'manual') return;
      
      // Si la course est dans un statut final → JAMAIS de notification
      if (FINAL_STATUSES.includes(course.statut)) {
        prixManuelWatchedRef.current[course.id] = 'dismissed_by_final_status';
        return;
      }
    });
    
    // Étape 2 : Détecter les réponses client pour les courses ACTIVES uniquement
    mesCourses.forEach(course => {
      if (course.proposed_by_livreur_id !== livreurProfil.id) return;
      if (course.pricing_mode !== 'manual') return;
      if (FINAL_STATUSES.includes(course.statut)) return;
      
      const watched = prixManuelWatchedRef.current[course.id];
      const status = course.manual_price_status;
      
      // Déclencher notification seulement si :
      // 1. Status accepted/refused
      // 2. Pas déjà watched OU dismissed
      // 3. Pas dans un statut final
      if ((status === 'accepted' || status === 'refused') && watched !== status && watched !== 'dismissed_by_final_status') {
        prixManuelWatchedRef.current[course.id] = status;
        setPrixManuelReponse({
          accepted: status === 'accepted',
          prix: course.manual_price || 0,
          devise: course.devise || 'FCFA',
        });
      }
    });
    
    // Étape 3 : Nettoyer la modale SI AFFICHÉE et qu'une course associée passe en statut final
    if (prixManuelReponse) {
      const courseActuelle = mesCourses.find(c => 
        c.pricing_mode === 'manual' && 
        c.proposed_by_livreur_id === livreurProfil?.id &&
        FINAL_STATUSES.includes(c.statut)
      );
      if (courseActuelle) {
        setPrixManuelReponse(null);
        prixManuelWatchedRef.current[courseActuelle.id] = 'dismissed_by_final_status';
      }
    }
  }, [mesCourses, livreurProfil?.id, prixManuelReponse]);

  // Auto-resync statut supprimé — le statut ne se change QUE manuellement via le bouton

  // ─── Gains du jour ────────────────────────────────────────────────────────
  const livreesToday = useMemo(() => {
    const todayStr = new Date().toDateString();
    return mesCourses.filter(c =>
      c.statut === "livree" &&
      new Date(c.heure_livraison || c.updated_date).toDateString() === todayStr
    );
  }, [mesCourses]);

  const totalEncaisse = useMemo(() =>
    livreesToday.reduce((sum, c) => {
      // ⚠️ CORRECTION PRIX MANUEL : Utiliser montant_livreur si déjà calculé,
      // sinon recalculer en respectant le mode de prix
      if (c.montant_livreur > 0) return sum + c.montant_livreur;
      const isPrixManuel = c.pricing_mode === "manual" && c.manual_price_status === "accepted" && Number(c.manual_price) > 0;
      const prixBase = isPrixManuel ? Number(c.manual_price) : (c.prix_final || 0);
      return sum + Math.round(prixBase * 0.7);
    }, 0),
    [livreesToday]
  );

  const montantDüSilga = useMemo(() =>
    livreesToday.reduce((sum, c) => {
      // ⚠️ CORRECTION PRIX MANUEL : Utiliser commission_silga si déjà calculée,
      // sinon recalculer en respectant le mode de prix
      if (c.commission_silga > 0) return sum + c.commission_silga;
      const isPrixManuel = c.pricing_mode === "manual" && c.manual_price_status === "accepted" && Number(c.manual_price) > 0;
      const prixBase = isPrixManuel ? Number(c.manual_price) : (c.prix_final || 0);
      return sum + Math.round(prixBase * 0.3);
    }, 0),
    [livreesToday]
  );

  // ─── isEnLigne ────────────────────────────────────────────────────────────
  const isEnLigne = livreurProfil ? livreurProfil.statut !== "hors_ligne" : false;
  const livreurVisible = isEnLigne && gpsActif && livreurProfil?.latitude && livreurProfil?.longitude;

  // ─── Statut livreur ───────────────────────────────────────────────────────
  const statutMutation = useMutation({
    mutationFn: (newStatut) => saveLivreur(livreurProfil.id, { statut: newStatut }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
      toast.success("Statut mis à jour");
    },
    onError: (err) => toast.error("Erreur : " + (err?.message || "inconnue")),
  });

  const handleToggleLigne = () => {
    const estHorsLigne = livreurProfil.statut === "hors_ligne";
    statutMutation.mutate(estHorsLigne ? "disponible" : "hors_ligne");
  };

  // ─── GPS ──────────────────────────────────────────────────────────────────
  const handleActiverGPS = () => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible sur cet appareil");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsActif(true);
        saveLivreur(livreurProfil.id, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          derniere_position_date: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          app_active: true,
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
          toast.success("GPS activé");
        }).catch(() => toast.error("Position GPS non enregistrée"));
      },
      () => { setGpsActif(false); toast.error("Permission GPS refusée – obligatoire"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // GPS tracking périodique (15s)
  useEffect(() => {
    if (!livreurId || livreurProfil?.statut === "hors_ligne" || !gpsActif) return;
    const interval = setInterval(() => {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          saveLivreur(livreurId, {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            derniere_position_date: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            app_active: true,
          }).catch(() => null);
        },
        (error) => console.warn("[LivreurExterneApp] GPS update skipped:", error?.message),
        { enableHighAccuracy: true }
      );
    }, 15000);
    return () => clearInterval(interval);
  }, [livreurId, livreurProfil?.statut, gpsActif]);

  // ─── Mutations courses ────────────────────────────────────────────────────
  const updateCourseMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CourseExterne.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
    },
  });

  const handleAccepter = (isPendingPrixManuel = false) => {
    setNotificationCourseCandidate(null);
    setNotificationCourseId(null);
    setCourseProposeeDirecte(null);
    queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
    queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
    if (!isPendingPrixManuel) {
      statutMutation.mutate("en_course");
      toast.success("Course acceptée ! 🚀");
    } else {
      toast.success("Prix proposé au client — en attente de sa validation 💰");
    }
  };

  const handleRefuser = () => {
    setNotificationCourseCandidate(null);
    setNotificationCourseId(null);
    setCourseProposeeDirecte(null);
    queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
    queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
    toast("Course refusée – recherche du prochain livreur...");
  };

  const handleCourseDejaPrise = (source = "accept") => {
    setNotificationCourseCandidate(null);
    setNotificationCourseId(null);
    setCourseProposeeDirecte(null);
    stopUrgentCourseAlert(`${source}-already-taken`);
    queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
    queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
    queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
    logAcceptationLivreur("frontend-already-taken-cleared", {
      source,
      livreur_id: livreurProfil?.id || "",
    });
    toast.error("Cette course a deja ete prise par un autre livreur.");
  };

  const handleFallbackAccepter = async (course) => {
    if (!course?.id || !livreurProfil?.id) return;
    try {
      let payload = {
        action: "accepter_course",
        course_id: course.id,
        livreur_id: livreurProfil.id,
      };

      if (pricingMode === "manual") {
        const montant = window.prompt("Montant propose au client (FCFA)");
        if (!montant) return;
        payload = {
          ...payload,
          pricing_mode: "manual",
          manual_price: Number(montant),
        };
      }

      logAcceptationLivreur("fallback-accept-clicked", {
        course_id: course.id,
        livreur_id: livreurProfil.id,
        pricing_mode: payload.pricing_mode || "automatic",
      });

      const res = await base44.functions.invoke("dispatchExterneAuto", payload);
      const data = res?.data;
      if (data?.success && data?.accepted !== false) {
        stopUrgentCourseAlert("fallback-accepted");
        handleAccepter(data?.pending_client_validation === true);
      } else if (data?.already_taken || data?.reason === "already_taken" || data?.accepted === false) {
        handleCourseDejaPrise("fallback");
      } else if (data?.expired) {
        stopUrgentCourseAlert("fallback-expired");
        toast.error("Course expiree");
      } else {
        toast.error(data?.error || "Erreur lors de l'acceptation");
      }
    } catch (error) {
      logAcceptationLivreur("fallback-accept-error", {
        course_id: course?.id,
        error: error?.message || String(error),
      });
      toast.error("Erreur reseau lors de l'acceptation");
    }
  };

  const handleFallbackRefuser = async (course) => {
    if (!course?.id || !livreurProfil?.id) return;
    try {
      logAcceptationLivreur("fallback-refuse-clicked", {
        course_id: course.id,
        livreur_id: livreurProfil.id,
      });
      const res = await base44.functions.invoke("dispatchExterneAuto", {
        action: "refuser_course",
        course_id: course.id,
        livreur_id: livreurProfil.id,
        raison: "Refuse depuis fallback dashboard",
      });
      const data = res?.data;
      if (data?.success) {
        stopUrgentCourseAlert("fallback-refused");
        handleRefuser();
      } else {
        toast.error(data?.error || "Erreur lors du refus");
      }
    } catch (error) {
      logAcceptationLivreur("fallback-refuse-error", {
        course_id: course?.id,
        error: error?.message || String(error),
      });
      toast.error("Erreur reseau lors du refus");
    }
  };

  const finaliserAnnulationLocale = async (course) => {
    await base44.entities.CourseExterne.update(course.id, {
      statut: "annulee",
      manual_price_status: "refused",
      notes: "Annulation directe livreur - proposition prix manuel en attente client",
      date_annulation: new Date().toISOString(),
    });
    if (livreurProfil?.id) {
      await saveLivreur(livreurProfil.id, { statut: "disponible" }).catch(() => null);
    }
    stopUrgentCourseAlert("pending-price-cancelled-fallback");
    queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
    queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
    logAcceptationLivreur("cancel-pending-price-fallback-updated", { course_id: course.id });
    toast.success("Course annulee");
    return true;
  };

  const handleAnnulerPropositionPrix = async (course) => {
    if (!course?.id) return false;
    try {
      logAcceptationLivreur("cancel-pending-price-clicked", {
        course_id: course.id,
        livreur_id: livreurProfil?.id || "",
        manual_price: course.manual_price || 0,
      });
      const res = await base44.functions.invoke("annulerCourseExterne", {
        course_id: course.id,
        motif: "Annulation demande livreur - proposition prix manuel en attente client",
      });
      const data = res?.data;
      logAcceptationLivreur("cancel-pending-price-result", {
        course_id: course.id,
        success: data?.success === true,
        error: data?.error || null,
        status: data?.statut_final || null,
      });
      if (data?.success) {
        stopUrgentCourseAlert("pending-price-cancelled");
        toast.success("Course annulée");
        queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
        queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
        return true;
      } else {
        return await finaliserAnnulationLocale(course);
      }
    } catch (error) {
      logAcceptationLivreur("cancel-pending-price-error", {
        course_id: course?.id,
        error: error?.message || String(error),
      });
      try {
        return await finaliserAnnulationLocale(course);
      } catch (fallbackError) {
        logAcceptationLivreur("cancel-pending-price-fallback-error", {
          course_id: course?.id,
          error: fallbackError?.message || String(fallbackError),
        });
        toast.error("Erreur reseau lors de l'annulation");
        return false;
      }
      toast.error("Erreur réseau lors de l'annulation");
    }
  };

  // handleColisRecupere — pour le réseau externe, la récupération se fait via QR (GPS déjà capturé par validateQRCode).
  // Cette fonction est appelée APRÈS validation QR avec les données de la course mises à jour.
  const handleColisRecupere = (course) => {
    // Les coordonnées GPS sont déjà dans course (latitude_recuperation, longitude_recuperation)
    // enregistrées par validateQRCode côté backend — rien à faire ici
    queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
  };

  const handleColisLivre = (course, gpsArrivee) => {
    // Cas QR externe : la course est déjà "livree" en DB (validée par le backend validateQRCode)
    // On fait juste les invalidations + statut livreur, le récap est géré dans CourseActiveCard
    if (course.statut === "livree") {
      queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
      queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
      if (livreurProfil?.statut !== "hors_ligne") {
        statutMutation.mutate("disponible");
      }
      toast.success("Livraison terminée ! 🎉");
      return;
    }

    // Cas interne (bouton manuel) : calcul prix via GPS
    const baseData = { statut: "livree", heure_livraison: new Date().toISOString() };

    if (gpsArrivee && course.latitude_recuperation && course.longitude_recuperation) {
      const distance = calculerDistance(
        course.latitude_recuperation, course.longitude_recuperation,
        gpsArrivee.lat, gpsArrivee.lng
      );
      const distanceVal = Number(distance || 0);
      const prixFinal = Math.max(Math.round(distanceVal * 100), 1000);
      const commissionSilga = Math.round(prixFinal * 0.3);
      const montantLivreur = prixFinal - commissionSilga;

      updateCourseMutation.mutate({
        id: course.id,
        data: {
          ...baseData,
          latitude_livraison: gpsArrivee.lat,
          longitude_livraison: gpsArrivee.lng,
          distance_reelle_km: distanceVal,
          prix_final: prixFinal,
          commission_silga: commissionSilga,
          montant_livreur: montantLivreur,
        },
      });
      saveLivreur(livreurProfil.id, {
        montant_du_silga: (livreurProfil.montant_du_silga || 0) + commissionSilga
      });
    } else {
      updateCourseMutation.mutate({ id: course.id, data: baseData });
    }

    if (livreurProfil?.statut !== "hors_ligne") {
      statutMutation.mutate("disponible");
    }
    toast.success("Livraison terminée ! 🎉");
  };

  const handlePricingModeChange = (mode) => {
    setPricingMode(mode);
    try { localStorage.setItem("silgapp_pricing_mode", mode); } catch {}
    // Sauvegarder aussi en BDD pour persistance cross-device
    if (livreurProfil?.id) {
      saveLivreur(livreurProfil.id, { pricing_mode: mode }).catch(() => null);
    }
  };

  const handleLogout = () => {
    if (livreurProfil?.id) {
      saveLivreur(livreurProfil.id, { app_active: false }).catch(() => null);
    }
    ['base44_access_token', 'access_token', 'base44_token', 'token'].forEach(k => {
      try { localStorage.removeItem(k); } catch (_) {}
    });
    base44.auth.logout();
    setTimeout(() => window.location.reload(), 300);
  };

  // ─── Onboarding externe obligatoire ──────────────────────────────────────
  if (!onboardingTermine) {
    return (
      <LivreurExterneOnboarding
        livreurProfil={livreurProfil || initialProfil}
        onComplete={(gpsData, updatedProfil) => {
          setGpsActif(true);
          setOnboardingTermine(true);
          const lid = (livreurProfil || initialProfil)?.id;
          if (gpsData && lid) {
            saveLivreur(lid, {
              latitude: gpsData.lat,
              longitude: gpsData.lng,
              derniere_position_date: new Date().toISOString(),
            }).catch(() => null);
          }
          queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
        }}
      />
    );
  }

  // ─── Guards de rendu ──────────────────────────────────────────────────────
  if (!livreurProfil) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Truck className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <p className="text-sm text-muted-foreground">Chargement du profil...</p>
        </div>
      </div>
    );
  }

  // ─── Dashboard principal ──────────────────────────────────────────────────
  const TABS = [
    { id: "courses",    label: "Courses",    emoji: "🚴" },
    { id: "historique", label: "Historique", emoji: "📋" },
    { id: "infos",      label: "Mon profil", emoji: "👤" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PullToRefreshIndicator pulling={pulling} refreshing={refreshing} />
      <AlertesLivreurModal
        livreurId={livreurProfil?.id}
        livreurNom={`${livreurProfil?.prenom || ""} ${livreurProfil?.nom || ""}`.trim()}
        livreurReseau="externe"
      />

      {/* VENUS — toujours visible */}
      <VenusFloatingButton />

      {/* Réponse prix manuel du client — garde de sécurité */}
      {prixManuelReponse && (
        <PrixManuelReponseAlert
          accepted={prixManuelReponse.accepted}
          prix={prixManuelReponse.prix}
          devise={prixManuelReponse.devise}
          onDismiss={() => setPrixManuelReponse(null)}
        />
      )}

      {/* ── PUBLICITÉ PLEIN ÉCRAN LIVREUR ── */}
      <PubliciteFullscreen
        cible={livreurProfil?.type_livreur === "interne" ? "livreurs_internes" : "livreurs_externes"}
        userId={livreurProfil?.id}
        userType="livreur"
      />

      {/* Modal plein écran si course en attente */}
      {courseEnAttente && (
        <CourseEnAttenteModalExterne
          course={courseEnAttente}
          livreurId={livreurProfil.id}
          pricingMode={pricingMode}
          alertDurationSeconds={livreurAlertConfig.durationSeconds}
          alertIntervalSeconds={livreurAlertConfig.intervalSeconds}
          onAccepter={handleAccepter}
          onRefuser={handleRefuser}
          onExpire={() => {
            setNotificationCourseCandidate(null);
            setNotificationCourseId(null);
            setCourseProposeeDirecte(null);
            if (coursesActives.length === 0 && livreurProfil?.statut !== "hors_ligne") {
              saveLivreur(livreurProfil.id, { statut: "disponible" }).catch(() => null);
            }
            queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
            queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
            queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
          }}
        />
      )}

      {/* ── Navigation sticky en haut ──────────────── */}
      <div className="sticky top-0 z-30 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm px-4 pt-3 pb-2 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-lg mx-auto flex gap-1 bg-white dark:bg-gray-800 rounded-2xl p-1 shadow-sm border border-gray-100 dark:border-gray-700">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-md"
                  : "text-gray-500 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-500"
              }`}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
              {/* Badge courses actives */}
              {tab.id === "courses" && coursesActives.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-primary text-white text-[9px] font-black flex items-center justify-center">
                  {coursesActives.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenu onglets ────────────────────────── */}
      <div className="max-w-lg mx-auto px-4 pt-4 pb-16">

        {activeTab === "courses" && (
          <div className="space-y-4">
            {/* ── PUBLICITÉS CARROUSEL LIVREUR ── */}
            <PubliciteCarousel
              cible={livreurProfil?.type_livreur === "interne" ? "livreurs_internes" : "livreurs_externes"}
              userId={livreurProfil?.id}
              userType="livreur"
            />

            <LivreurHeader
              livreur={livreurProfil}
              isEnLigne={isEnLigne}
              isUpdatingStatut={statutMutation.isPending}
              gpsActif={gpsActif}
              onToggleLigne={handleToggleLigne}
              onActiverGps={handleActiverGPS}
              onLogout={handleLogout}
            />

            {isEnLigne && !livreurVisible && (
              <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 flex items-center gap-3">
                <span className="text-xl flex-shrink-0">📍</span>
                <p className="text-sm text-amber-700 font-semibold leading-tight">
                  Activez votre GPS pour être visible sur la carte
                </p>
              </div>
            )}

            {courseEnAttente && (
              <div className="rounded-3xl bg-red-600 text-white p-5 shadow-xl border-4 border-red-800 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-lg leading-tight">NOUVELLE COURSE DISPONIBLE</p>
                    <p className="text-sm text-white/85 mt-1">
                      {courseEnAttente.adresse_depart || "Depart a confirmer"} → {courseEnAttente.adresse_arrivee || "Destination a confirmer"}
                    </p>
                    <p className="text-xs text-white/70 mt-2">
                      Répondez rapidement pour prendre ou refuser cette course.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleFallbackAccepter(courseEnAttente)}
                    className="h-14 rounded-2xl bg-white text-red-700 font-black flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <Check className="w-5 h-5" />
                    Accepter
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFallbackRefuser(courseEnAttente)}
                    className="h-14 rounded-2xl bg-red-950/50 text-white font-black border border-white/20 flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <X className="w-5 h-5" />
                    Refuser
                  </button>
                </div>
              </div>
            )}

            {/* Bannière : en attente validation prix par le client */}
            {courseEnAttenteValidationPrix && (
              <div className="rounded-2xl bg-blue-50 border-2 border-blue-300 px-4 py-3 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <p className="text-sm font-black text-blue-800">En attente du client</p>
                </div>
                <p className="text-xs text-blue-600">
                  Votre prix de <strong>{courseEnAttenteValidationPrix.manual_price?.toLocaleString()} {courseEnAttenteValidationPrix.devise || "FCFA"}</strong> est en cours de validation par le client.
                </p>
                <button
                  type="button"
                  onClick={() => handleAnnulerPropositionPrix(courseEnAttenteValidationPrix)}
                  className="mt-3 w-full h-11 rounded-xl bg-red-600 text-white text-sm font-black active:scale-[0.98] transition-all"
                >
                  Annuler cette course
                </button>
              </div>
            )}

            {/* ── MODE TARIFAIRE ── */}
            <PricingModeSelector pricingMode={pricingMode} onChange={handlePricingModeChange} />

            <LivreurStatsBanner
              mesCourses={mesCourses}
              totalEncaisse={totalEncaisse}
              montantDüSilga={montantDüSilga}
              isExterne={true}
            />

            <LivreurStatutCard statut={livreurProfil.statut} livreur={livreurProfil} isExterne={true} />

            {coursesActives.length > 0 && (
              <div className="space-y-3">
                {coursesActives.map(course => (
                  <CourseActiveCard
                    key={course.id}
                    course={course}
                    onColisRecupere={handleColisRecupere}
                    onColisLivre={handleColisLivre}
                    isPending={updateCourseMutation.isPending}
                    isExterne={true}
                    livreurLat={livreurProfil?.latitude}
                    livreurLng={livreurProfil?.longitude}
                  />
                ))}
              </div>
            )}

            {coursesActives.length === 0 && isEnLigne && <EmptyStateAttente />}

            {!isEnLigne && (
              <div className="rounded-2xl bg-slate-800 text-white p-5 text-center space-y-2 shadow-lg">
                <p className="text-2xl">😴</p>
                <p className="font-black text-base">Vous êtes hors ligne</p>
                <p className="text-white/60 text-xs">Appuyez sur <strong>Activer</strong> dans le header pour recevoir des courses</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "historique" && (
          <LivreurHistorique mesCourses={mesCourses} livreurProfil={livreurProfil} isExterne={true} />
        )}

        {activeTab === "infos" && livreurProfil && (
          <LivreurMesInfosModal
            livreurProfil={livreurProfil}
            onSave={() => {
              queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
              toast.success("Profil mis à jour ✓");
            }}
          />
        )}
      </div>
    </div>
  );
}
