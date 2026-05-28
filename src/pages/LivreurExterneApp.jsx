import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Truck } from "lucide-react";
import { toast } from "sonner";
import { useHeartbeat } from "@/hooks/useHeartbeat";

import { registerPushToken, subscribeToNotifications } from "@/lib/notifications";
import LivreurHeader from "@/components/livreur/LivreurHeader";
import LivreurStatsBanner from "@/components/livreur/LivreurStatsBanner";
import LivreurStatutCard from "@/components/livreur/LivreurStatutCard";
import EmptyStateAttente from "@/components/livreur/EmptyStateAttente";
import CourseEnAttenteModal from "@/components/livreur/CourseEnAttenteModal";
import CourseActiveCard from "@/components/livreur/CourseActiveCard";
import LivreurHistorique from "@/components/livreur/LivreurHistorique";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LivreurExterneOnboarding from "@/components/livreur/LivreurExterneOnboarding";
import LivreurMesInfosModal from "@/components/livreur/LivreurMesInfosModal";
import LivreurRecapitulatifPaiement from "@/components/livreur/LivreurRecapitulatifPaiement";
import PrixCoursePopup from "@/components/livreur/PrixCoursePopup";

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
  const [showRecapitulatif, setShowRecapitulatif] = useState(null);
  const [courseLivreePopup, setCourseLivreePopup] = useState(null);

  // ─── Profil livreur ───────────────────────────────────────────────────────
  const { data: livreurProfil } = useQuery({
    queryKey: ["livreur-externe-profil", initialProfil?.id],
    queryFn: () => base44.entities.Livreur.filter({ id: initialProfil.id }),
    select: (data) => Array.isArray(data) ? (data[0] || initialProfil) : initialProfil,
    initialData: [initialProfil],
    enabled: !!initialProfil?.id,
    refetchInterval: 2000,
    staleTime: 0,
    cacheTime: 0,
  });

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
    registerPushToken(livreurId, { email: livreurEmail }).catch(() => null);
    const unsub = subscribeToNotifications(
      (n) => toast.info(n.titre, { description: n.message }),
      livreurEmail
    );
    return () => unsub?.();
  }, [livreurId, livreurEmail]);

  // ─── Heartbeat app_active ─────────────────────────────────────────────────
  useEffect(() => {
    if (!initialProfil?.id) return;
    const id = initialProfil.id;

    const pingActif = () => {
      const now = new Date().toISOString();
      saveLivreur(id, {
        app_active: true,
        last_seen_at: now,
        statut: livreurProfil?.statut === "hors_ligne" ? "hors_ligne" : (livreurProfil?.statut || "disponible")
      }).catch(() => null);
    };
    const pingInactif = () =>
      saveLivreur(id, { app_active: false, statut: "hors_ligne" }).catch(() => null);

    pingActif();
    const interval = setInterval(pingActif, 5000);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        pingInactif();
      } else {
        pingActif();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', pingInactif);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', pingInactif);
      pingInactif();
    };
  }, [initialProfil?.id, livreurProfil?.statut]);

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
    refetchInterval: 1000,
    staleTime: 0,
    cacheTime: 0,
  });

  // ─── Course en attente de réponse ─────────────────────────────────────────
  const courseEnAttente = useMemo(() => {
    return mesCourses.find(
      c => c.statut === "recherche_livreur" && c.dispatch_status === "propose"
    ) || null;
  }, [mesCourses]);

  // ─── Courses actives ──────────────────────────────────────────────────────
  const coursesActives = useMemo(
    () => mesCourses.filter(c => ["livreur_en_route", "colis_recupere", "en_livraison"].includes(c.statut)),
    [mesCourses]
  );

  // ─── Auto-resync statut ───────────────────────────────────────────────────
  useEffect(() => {
    if (!livreurProfil || !livreurId || mesCourses.length === 0) return;
    if (livreurProfil.statut === "en_course" && coursesActives.length === 0) {
      const timer = setTimeout(() => {
        saveLivreur(livreurId, { statut: "disponible" }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
        }).catch(() => null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [livreurProfil?.statut, coursesActives.length, livreurId]);

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
      if (c.montant_livreur > 0) return sum + c.montant_livreur;
      return sum + Math.round((c.prix_final || 0) * 0.7);
    }, 0),
    [livreesToday]
  );

  const montantDüSilga = useMemo(() =>
    livreesToday.reduce((sum, c) => {
      if (c.commission_silga > 0) return sum + c.commission_silga;
      return sum + Math.round((c.prix_final || 0) * 0.3);
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

  const handleAccepter = () => {
    queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
    queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
    statutMutation.mutate("en_course");
    toast.success("Course acceptée ! 🚀");
  };

  const handleRefuser = () => {
    queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
    queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
    toast("Course refusée – recherche du prochain livreur...");
  };

  const handleColisRecupere = (course) => {
    const doUpdate = (extraData = {}) => updateCourseMutation.mutate({
      id: course.id,
      data: { statut: "colis_recupere", heure_recuperation: new Date().toISOString(), ...extraData },
    });

    if (!navigator.geolocation) {
      doUpdate();
      toast.warning("Colis récupéré (GPS non disponible)");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        doUpdate({ latitude_recuperation: pos.coords.latitude, longitude_recuperation: pos.coords.longitude });
        toast.success("Colis récupéré ! 📦 Position GPS enregistrée");
      },
      () => { doUpdate(); toast.warning("Colis récupéré (GPS non disponible)"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleColisLivre = (course, gpsArrivee) => {
    if (course.statut === "livree") {
      queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
      queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
      // Afficher popup prix une seule fois
      const seenKey = `prix_popup_seen_${course.id}`;
      if (!localStorage.getItem(seenKey)) {
        setCourseLivreePopup(course);
      }
      setShowRecapitulatif(course);
      return;
    }

    const baseData = { statut: "livree", heure_livraison: new Date().toISOString() };

    if (gpsArrivee && course.latitude_recuperation && course.longitude_recuperation) {
      const distance = calculerDistance(
        course.latitude_recuperation, course.longitude_recuperation,
        gpsArrivee.lat, gpsArrivee.lng
      );
      const distanceVal = Number(distance || 0);
      const prixFinal = Math.round(distanceVal * 100);
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
    statutMutation.mutate("disponible");
    toast.success("Livraison terminée ! 🎉");
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

  // ─── Modal plein écran si course en attente ───────────────────────────────
  if (courseEnAttente) {
    return (
      <CourseEnAttenteModal
        course={courseEnAttente}
        livreurId={livreurProfil.id}
        onAccepter={handleAccepter}
        onRefuser={handleRefuser}
        isPending={updateCourseMutation.isPending}
        onExpire={() => {
          queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
          queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
        }}
      />
    );
  }

  // ─── Dashboard principal ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Popup prix de course — affiché une seule fois après livraison */}
      {courseLivreePopup && (
        <PrixCoursePopup
          course={courseLivreePopup}
          onClose={() => {
            localStorage.setItem(`prix_popup_seen_${courseLivreePopup.id}`, "1");
            setCourseLivreePopup(null);
          }}
        />
      )}
      <div className="max-w-lg mx-auto p-4 pb-12">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
          <TabsList className="w-full">
            <TabsTrigger value="courses" className="flex-1 text-xs">Courses</TabsTrigger>
            <TabsTrigger value="historique" className="flex-1 text-xs">Historique</TabsTrigger>
            <TabsTrigger value="infos" className="flex-1 text-xs">Mes infos</TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab === "courses" && (
          <div className="space-y-4">
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
              <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
                <span className="text-xl">📍</span>
                <p className="text-sm text-amber-700 font-medium leading-tight">
                  Activez votre GPS pour être visible sur la carte
                </p>
              </div>
            )}

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
                  />
                ))}
              </div>
            )}

            {coursesActives.length === 0 && isEnLigne && <EmptyStateAttente />}
          </div>
        )}

        {activeTab === "historique" && (
          <LivreurHistorique mesCourses={mesCourses} livreurProfil={livreurProfil} isExterne={true} />
        )}

        {showRecapitulatif && (
          <LivreurRecapitulatifPaiement
            course={showRecapitulatif}
          />
        )}

        {activeTab === "infos" && livreurProfil && (
          <LivreurMesInfosModal
            livreurProfil={livreurProfil}
            onSave={(updated) => {
              queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
              toast.success("Profil mis à jour ✓");
            }}
          />
        )}
      </div>
    </div>
  );
}