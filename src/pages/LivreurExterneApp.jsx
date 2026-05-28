/**
 * LivreurExterneApp — Version Safe
 * Architecture progressive identique au dashboard client :
 * Auth OK → Profil chargé → Dashboard minimal → GPS → Notifications → Courses → Realtime
 */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Truck } from "lucide-react";
import { toast } from "sonner";

// Imports lazy pour éviter les initialisations prématurées
const LivreurExterneOnboarding = React.lazy(() => import("@/components/livreur/LivreurExterneOnboarding"));
const LivreurHeader = React.lazy(() => import("@/components/livreur/LivreurHeader"));
const LivreurStatsBanner = React.lazy(() => import("@/components/livreur/LivreurStatsBanner"));
const LivreurStatutCard = React.lazy(() => import("@/components/livreur/LivreurStatutCard"));
const EmptyStateAttente = React.lazy(() => import("@/components/livreur/EmptyStateAttente"));
const CourseEnAttenteModal = React.lazy(() => import("@/components/livreur/CourseEnAttenteModal"));
const CourseActiveCard = React.lazy(() => import("@/components/livreur/CourseActiveCard"));
const LivreurHistorique = React.lazy(() => import("@/components/livreur/LivreurHistorique"));
const LivreurMesInfosModal = React.lazy(() => import("@/components/livreur/LivreurMesInfosModal"));
const LivreurRecapitulatifPaiement = React.lazy(() => import("@/components/livreur/LivreurRecapitulatifPaiement"));

// Haversine locale — pas d'import externe
function calculerDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Spinner minimal
function Spinner({ label = "Chargement..." }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Truck className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function LivreurExterneApp({ livreurProfil: initialProfil }) {
  // PHASE 1 : état minimal — aucune dépendance externe
  const [phase, setPhase] = useState("init"); // init → onboarding → dashboard
  const [profil, setProfil] = useState(null);
  const [activeTab, setActiveTab] = useState("courses");
  const [gpsActif, setGpsActif] = useState(false);
  const [mesCourses, setMesCourses] = useState([]);
  const [showRecapitulatif, setShowRecapitulatif] = useState(null);

  const intervalRefs = useRef({ heartbeat: null, gps: null, courses: null });

  // PHASE 1 : charger le profil depuis initialProfil passé en prop
  useEffect(() => {
    if (!initialProfil?.id) {
      setPhase("error");
      return;
    }
    // Utiliser initialProfil directement — pas d'appel réseau synchrone au démarrage
    setProfil(initialProfil);
    setPhase("onboarding");
  }, [initialProfil?.id]);

  // PHASE 2 : après onboarding terminé → dashboard + services progressifs
  const demarrerDashboard = (gpsData) => {
    setGpsActif(true);
    setPhase("dashboard");
    // Sauvegarder GPS
    if (gpsData && initialProfil?.id) {
      base44.functions.invoke('updateLivreur', {
        id: initialProfil.id,
        data: {
          latitude: gpsData.lat,
          longitude: gpsData.lng,
          derniere_position_date: new Date().toISOString(),
          app_active: true,
          last_seen_at: new Date().toISOString(),
        }
      }).catch(() => null);
    }
  };

  // PHASE 3 : services progressifs — s'activent seulement après dashboard
  useEffect(() => {
    if (phase !== "dashboard" || !initialProfil?.id) return;
    const id = initialProfil.id;

    // Heartbeat app_active toutes les 10s
    const pingActif = () => {
      base44.functions.invoke('updateLivreur', {
        id,
        data: { app_active: true, last_seen_at: new Date().toISOString() }
      }).catch(() => null);
    };
    pingActif();
    intervalRefs.current.heartbeat = setInterval(pingActif, 10000);

    // Polling profil toutes les 3s
    const refreshProfil = () => {
      base44.entities.Livreur.filter({ id })
        .then(data => { if (data?.[0]) setProfil(data[0]); })
        .catch(() => null);
    };
    const profilInterval = setInterval(refreshProfil, 3000);

    // Polling courses toutes les 2s
    const refreshCourses = () => {
      base44.entities.CourseExterne.filter({ livreur_id: id }, "-updated_date", 50)
        .then(data => setMesCourses(data || []))
        .catch(() => null);
    };
    refreshCourses();
    intervalRefs.current.courses = setInterval(refreshCourses, 2000);

    // GPS tracking toutes les 15s
    if (gpsActif) {
      intervalRefs.current.gps = setInterval(() => {
        navigator.geolocation?.getCurrentPosition(
          (pos) => base44.functions.invoke('updateLivreur', {
            id,
            data: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              derniere_position_date: new Date().toISOString(),
            }
          }).catch(() => null),
          () => setGpsActif(false),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }, 15000);
    }

    // Notifications push — chargement différé (500ms)
    const notifTimer = setTimeout(() => {
      import("@/lib/notifications").then(({ registerPushToken, subscribeToNotifications }) => {
        const email = profil?.user_email || initialProfil?.user_email;
        if (id && email) {
          registerPushToken(id, { email }).catch(() => null);
          subscribeToNotifications(
            (n) => toast.info(`${n.titre}: ${n.message}`),
            email
          );
        }
      }).catch(() => null);
    }, 500);

    // Cleanup au départ
    const pingInactif = () => {
      base44.functions.invoke('updateLivreur', {
        id,
        data: { app_active: false, statut: "hors_ligne" }
      }).catch(() => null);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") pingInactif();
      else pingActif();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", pingInactif);

    return () => {
      clearInterval(intervalRefs.current.heartbeat);
      clearInterval(intervalRefs.current.gps);
      clearInterval(intervalRefs.current.courses);
      clearInterval(profilInterval);
      clearTimeout(notifTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", pingInactif);
      pingInactif();
    };
  }, [phase]);

  // ─── Calculs dérivés (stables, pas de dépendances externes) ──────────────
  const courseEnAttente = useMemo(() =>
    mesCourses.find(c =>
      c.statut === "recherche_livreur" && c.dispatch_status === "propose"
    ) || null,
    [mesCourses]
  );

  const coursesActives = useMemo(() =>
    mesCourses.filter(c =>
      ["livreur_en_route", "colis_recupere", "en_livraison"].includes(c.statut)
    ),
    [mesCourses]
  );

  const livreesToday = useMemo(() => {
    const todayStr = new Date().toDateString();
    return mesCourses.filter(c =>
      c.statut === "livree" &&
      new Date(c.heure_livraison || c.updated_date).toDateString() === todayStr
    );
  }, [mesCourses]);

  const totalEncaisse = useMemo(() =>
    livreesToday.reduce((sum, c) =>
      sum + (c.montant_livreur > 0 ? c.montant_livreur : Math.round((c.prix_final || 0) * 0.7)), 0),
    [livreesToday]
  );

  const montantDuSilga = useMemo(() =>
    livreesToday.reduce((sum, c) =>
      sum + (c.commission_silga > 0 ? c.commission_silga : Math.round((c.prix_final || 0) * 0.3)), 0),
    [livreesToday]
  );

  const isEnLigne = profil ? profil.statut !== "hors_ligne" : false;
  const livreurVisible = isEnLigne && gpsActif && profil?.latitude && profil?.longitude;

  // ─── Actions ──────────────────────────────────────────────────────────────
  const updateStatut = (newStatut) => {
    if (!profil?.id) return;
    base44.functions.invoke('updateLivreur', { id: profil.id, data: { statut: newStatut } })
      .then(() => {
        setProfil(p => ({ ...p, statut: newStatut }));
        toast.success("Statut mis à jour");
      })
      .catch(() => toast.error("Erreur mise à jour statut"));
  };

  const updateCourse = (id, data) =>
    base44.entities.CourseExterne.update(id, data)
      .then(() => {
        base44.entities.CourseExterne.filter({ livreur_id: profil.id }, "-updated_date", 50)
          .then(d => setMesCourses(d || [])).catch(() => null);
      });

  const handleAccepter = () => {
    updateStatut("en_course");
    toast.success("Course acceptée ! 🚀");
  };

  const handleRefuser = () => {
    base44.entities.CourseExterne.filter({ livreur_id: profil?.id }, "-updated_date", 50)
      .then(d => setMesCourses(d || [])).catch(() => null);
    toast("Course refusée");
  };

  const handleColisRecupere = (course) => {
    const doUpdate = (extraData = {}) => updateCourse(course.id, {
      statut: "colis_recupere",
      heure_recuperation: new Date().toISOString(),
      ...extraData,
    });
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        doUpdate({ latitude_recuperation: pos.coords.latitude, longitude_recuperation: pos.coords.longitude });
        toast.success("Colis récupéré ! 📦");
      },
      () => { doUpdate(); toast.warning("Colis récupéré (GPS non disponible)"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleColisLivre = (course, gpsArrivee) => {
    if (course.statut === "livree") {
      const gains = course.montant_livreur || 0;
      toast.success(`Livraison confirmée ! 🎉${gains > 0 ? ` +${gains.toLocaleString()} F` : ""}`);
      setShowRecapitulatif(course);
      return;
    }
    const baseData = { statut: "livree", heure_livraison: new Date().toISOString() };
    if (gpsArrivee && course.latitude_recuperation && course.longitude_recuperation) {
      const dist = calculerDistance(
        course.latitude_recuperation, course.longitude_recuperation,
        gpsArrivee.lat, gpsArrivee.lng
      );
      const prixFinal = Math.round(dist * 100);
      updateCourse(course.id, {
        ...baseData,
        latitude_livraison: gpsArrivee.lat,
        longitude_livraison: gpsArrivee.lng,
        distance_reelle_km: dist,
        prix_final: prixFinal,
        commission_silga: Math.round(prixFinal * 0.3),
        montant_livreur: Math.round(prixFinal * 0.7),
      });
    } else {
      updateCourse(course.id, baseData);
    }
    updateStatut("disponible");
    toast.success("Livraison terminée ! 🎉");
  };

  const handleLogout = () => {
    if (profil?.id) {
      base44.functions.invoke('updateLivreur', {
        id: profil.id,
        data: { app_active: false }
      }).catch(() => null);
    }
    ["base44_access_token", "access_token", "base44_token", "token"].forEach(k => {
      try { localStorage.removeItem(k); } catch (_) {}
    });
    base44.auth.logout();
    setTimeout(() => window.location.reload(), 300);
  };

  const handleActiverGPS = () => {
    if (!navigator.geolocation) { toast.error("GPS non disponible"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsActif(true);
        base44.functions.invoke('updateLivreur', {
          id: profil.id,
          data: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, derniere_position_date: new Date().toISOString() }
        }).catch(() => null);
        toast.success("GPS activé");
      },
      () => toast.error("Permission GPS refusée"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // ─── Rendu selon phase ────────────────────────────────────────────────────
  if (phase === "init") return <Spinner label="Initialisation..." />;
  if (phase === "error") return <Spinner label="Erreur de profil — reconnectez-vous" />;

  if (phase === "onboarding") {
    return (
      <React.Suspense fallback={<Spinner label="Chargement onboarding..." />}>
        <LivreurExterneOnboarding
          livreurProfil={profil || initialProfil}
          onComplete={(gpsData, updatedProfil) => {
            if (updatedProfil) setProfil(updatedProfil);
            demarrerDashboard(gpsData);
          }}
        />
      </React.Suspense>
    );
  }

  // Dashboard
  if (!profil) return <Spinner label="Chargement du profil..." />;

  if (courseEnAttente) {
    return (
      <React.Suspense fallback={<Spinner label="Chargement..." />}>
        <CourseEnAttenteModal
          course={courseEnAttente}
          livreurId={profil.id}
          onAccepter={handleAccepter}
          onRefuser={handleRefuser}
          isPending={false}
          onExpire={() => {
            base44.entities.CourseExterne.filter({ livreur_id: profil.id }, "-updated_date", 50)
              .then(d => setMesCourses(d || [])).catch(() => null);
          }}
        />
      </React.Suspense>
    );
  }

  return (
    <React.Suspense fallback={<Spinner label="Chargement dashboard..." />}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-lg mx-auto p-4 pb-12">
          {/* Tabs navigation */}
          <div className="flex gap-1 bg-white rounded-xl p-1 mb-4 shadow-sm">
            {["courses", "historique", "infos"].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all capitalize ${
                  activeTab === tab ? "bg-primary text-white shadow" : "text-gray-500"
                }`}
              >
                {tab === "courses" ? "Courses" : tab === "historique" ? "Historique" : "Mes infos"}
              </button>
            ))}
          </div>

          {activeTab === "courses" && (
            <div className="space-y-4">
              <LivreurHeader
                livreur={profil}
                isEnLigne={isEnLigne}
                isUpdatingStatut={false}
                gpsActif={gpsActif}
                onToggleLigne={() => updateStatut(profil.statut === "hors_ligne" ? "disponible" : "hors_ligne")}
                onActiverGps={handleActiverGPS}
                onLogout={handleLogout}
              />

              {isEnLigne && !livreurVisible && (
                <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
                  <span className="text-xl">📍</span>
                  <p className="text-sm text-amber-700 font-medium">
                    Activez votre GPS pour être visible sur la carte
                  </p>
                </div>
              )}

              <LivreurStatsBanner
                mesCourses={mesCourses}
                totalEncaisse={totalEncaisse}
                montantDüSilga={montantDuSilga}
                isExterne={true}
              />
              <LivreurStatutCard statut={profil.statut} livreur={profil} isExterne={true} />

              {coursesActives.length > 0 && (
                <div className="space-y-3">
                  {coursesActives.map(course => (
                    <CourseActiveCard
                      key={course.id}
                      course={course}
                      onColisRecupere={handleColisRecupere}
                      onColisLivre={handleColisLivre}
                      isPending={false}
                      isExterne={true}
                    />
                  ))}
                </div>
              )}

              {coursesActives.length === 0 && isEnLigne && <EmptyStateAttente />}
            </div>
          )}

          {activeTab === "historique" && (
            <LivreurHistorique mesCourses={mesCourses} livreurProfil={profil} isExterne={true} />
          )}

          {activeTab === "infos" && (
            <LivreurMesInfosModal
              livreurProfil={profil}
              onSave={() => {
                base44.entities.Livreur.filter({ id: profil.id })
                  .then(d => { if (d?.[0]) setProfil(d[0]); }).catch(() => null);
                toast.success("Profil mis à jour ✓");
              }}
            />
          )}

          {showRecapitulatif && (
            <LivreurRecapitulatifPaiement
              course={showRecapitulatif}
              onClose={() => setShowRecapitulatif(null)}
            />
          )}
        </div>
      </div>
    </React.Suspense>
  );
}