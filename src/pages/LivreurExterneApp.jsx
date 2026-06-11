import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Truck } from "lucide-react";
import { toast } from "sonner";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/ui/PullToRefreshIndicator";

import { registerPushToken, subscribeToNotifications } from "@/lib/notifications";
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
import DebugCoursesPanel from "@/components/livreur/DebugCoursesPanel";
import { Bell } from "lucide-react";

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
  // Test notification
  const [testingNotif, setTestingNotif] = useState(false);
  const [testResult, setTestResult] = useState(null);
  // Test modal
  const [showTestModal, setShowTestModal] = useState(false);
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
  });

  // ─── Notifications push ───────────────────────────────────────────────────
  const livreurId = livreurProfil?.id;
  const livreurEmail = livreurProfil?.user_email;
  useEffect(() => {
    if (!livreurId || !livreurEmail) return;
    registerPushToken(livreurId, { email: livreurEmail, livreur_id: livreurId }).catch(() => null);
    const unsub = subscribeToNotifications(
      (n) => toast.info(n.titre, { description: n.message }),
      livreurEmail
    );
    return () => unsub?.();
  }, [livreurId, livreurEmail]);

  // ─── Heartbeat app_active ─────────────────────────────────────────────────
  // Géré par useHeartbeat hook + heartbeatAuto backend — supprimé pour éviter doublon

  // ─── Mes courses ──────────────────────────────────────────────────────────
  const { data: mesCourses = [] } = useQuery({
    queryKey: ["mes-courses-externes", livreurId],
    queryFn: async () => {
      const courses = await base44.entities.CourseExterne.filter(
        { livreur_id: livreurId },
        "-updated_date",
        50
      );
      return courses || [];
    },
    enabled: !!livreurId,
    initialData: [],
    refetchInterval: 4000,
    staleTime: 2000,
  });



  // ─── Course en attente de réponse du livreur ───────────────────────────────
  const courseEnAttente = useMemo(
    () => mesCourses.find(
      c => c.statut === "recherche_livreur" && c.dispatch_status === "propose"
    ) || null,
    [mesCourses]
  );

  // ─── Course en attente de validation prix par le client ───────────────────
  const courseEnAttenteValidationPrix = useMemo(() => {
    return mesCourses.find(
      c => c.pricing_mode === "manual" && c.manual_price_status === "pending_client_validation"
        && c.proposed_by_livreur_id === livreurProfil?.id
    ) || null;
  }, [mesCourses, livreurProfil?.id]);

  // ─── Courses actives ──────────────────────────────────────────────────────
  const coursesActives = useMemo(
    () => mesCourses.filter(c => ["livreur_en_route", "colis_recupere", "en_livraison"].includes(c.statut)),
    [mesCourses]
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
        (pos) => saveLivreur(livreurId, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          derniere_position_date: new Date().toISOString(),
        }).catch(() => null),
        () => setGpsActif(false),
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
    queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
    queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
    toast("Course refusée – recherche du prochain livreur...");
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

  const handleTestNotification = async () => {
    setTestingNotif(true);
    setTestResult(null);
    try {
      const response = await base44.functions.invoke("envoiNotificationPush", {
        destinataire_email: livreurProfil.user_email,
        titre: "🧪 Test Notification SILGAPP",
        message: "Si vous voyez ceci, les notifications push fonctionnent ! ✅",
        type: "test",
      });
      
      setTestResult(response);
      
      if (response.success) {
        toast.success(`Notification envoyée ! Tokens: ${response.tokens_found || 0}`);
      } else {
        toast.error(response.error || "Échec de l'envoi");
      }
    } catch (err) {
      setTestResult({ error: err.message, details: err.toString() });
      toast.error("Erreur: " + (err.message || "inconnue"));
    } finally {
      setTestingNotif(false);
    }
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
          onAccepter={handleAccepter}
          onRefuser={handleRefuser}
          onExpire={() => {
            if (coursesActives.length === 0 && livreurProfil?.statut !== "hors_ligne") {
              saveLivreur(livreurProfil.id, { statut: "disponible" }).catch(() => null);
            }
            queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
            queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
            queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
          }}
        />
      )}

      {/* Modal TEST pour Aissam */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}>
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-5 pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">✅</div>
                <div>
                  <p className="text-white font-black text-xl leading-tight">MODAL TEST</p>
                  <p className="text-white/70 text-xs">Pour Aissam uniquement</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                Si tu vois ce modal, alors l'affichage des modals fonctionne correctement sur ton appareil ! 🎉
              </p>
              <button
                onClick={() => setShowTestModal(false)}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black text-base shadow-lg active:scale-[0.98] transition-all"
              >
                Fermer le test
              </button>
            </div>
          </div>
        </div>
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
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
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

            {/* Bannière : en attente validation prix par le client */}
            {courseEnAttenteValidationPrix && (
              <div className="rounded-2xl bg-blue-50 border-2 border-blue-300 px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <p className="text-sm font-black text-blue-800">En attente du client</p>
                </div>
                <p className="text-xs text-blue-600">
                  Votre prix de <strong>{courseEnAttenteValidationPrix.manual_price?.toLocaleString()} {courseEnAttenteValidationPrix.devise || "FCFA"}</strong> est en cours de validation par le client.
                </p>
                <button
                  onClick={async () => {
                    if (!confirm("Voulez-vous vraiment annuler cette course ?")) return;
                    try {
                      const res = await base44.functions.invoke('annulerCourseExterne', {
                        course_id: courseEnAttenteValidationPrix.id,
                      });
                      if (res.data?.success) {
                        toast.success("Course annulée");
                        queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
                      } else {
                        toast.error(res.data?.error || "Erreur lors de l'annulation");
                      }
                    } catch (err) {
                      toast.error("Erreur: " + (err.message || "inconnue"));
                    }
                  }}
                  className="w-full h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
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

            {/* Bouton test notification */}
            <button
              onClick={handleTestNotification}
              disabled={testingNotif}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-black text-base shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 disabled:opacity-60"
            >
              <Bell className={`w-5 h-5 ${testingNotif ? "animate-bounce" : ""}`} />
              {testingNotif ? "Envoi en cours..." : "🧪 Tester Notification Push"}
            </button>

            {/* Bouton test modal */}
            <button
              onClick={() => setShowTestModal(true)}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black text-base shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2.5"
            >
              🧪 TEST MODAL (Aissam)
            </button>

            {/* DEBUG PANEL */}
            <DebugCoursesPanel livreurEmail={livreurEmail} livreurId={livreurId} />

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