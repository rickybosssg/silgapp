import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Truck } from "lucide-react";
import { toast } from "sonner";

import { registerPushToken, subscribeToNotifications } from "@/lib/notifications";
import LivreurHeader from "@/components/livreur/LivreurHeader";
import LivreurStatsBanner from "@/components/livreur/LivreurStatsBanner";
import LivreurStatutCard from "@/components/livreur/LivreurStatutCard";
import EmptyStateAttente from "@/components/livreur/EmptyStateAttente";
import CourseEnAttenteModal from "@/components/livreur/CourseEnAttenteModal";
import CourseActiveCard from "@/components/livreur/CourseActiveCard";
import LivreurHistorique from "@/components/livreur/LivreurHistorique";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const saveLivreur = (id, data) => base44.functions.invoke('updateLivreur', { id, data });

export default function LivreurExterneApp({ livreurProfil: initialProfil }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("courses");
  const [gpsActif, setGpsActif] = useState(false);
  const [gpsRequis, setGpsRequis] = useState(true);

  // Recharger le profil livreur en temps réel
  const { data: livreurProfil } = useQuery({
    queryKey: ["livreur-externe-profil", initialProfil?.id],
    queryFn: () => base44.entities.Livreur.filter({ id: initialProfil.id }),
    select: (data) => Array.isArray(data) ? (data[0] || initialProfil) : initialProfil,
    initialData: [initialProfil],
    enabled: !!initialProfil?.id,
    refetchInterval: 10000,
  });

  // Notifications push
  useEffect(() => {
    if (!livreurProfil?.id || !livreurProfil?.user_email) return;
    registerPushToken(livreurProfil.id, { email: livreurProfil.user_email }).catch(() => null);
    const unsub = subscribeToNotifications(
      (n) => toast.info(`${n.titre}: ${n.message}`),
      livreurProfil.user_email
    );
    return () => unsub?.();
  }, [livreurProfil?.id, livreurProfil?.user_email]);

  // Heartbeat app_active
  useEffect(() => {
    if (!initialProfil?.id) return;
    const id = initialProfil.id;

    const pingActif = () =>
      saveLivreur(id, { app_active: true, last_seen_at: new Date().toISOString() }).catch(() => null);

    const pingInactif = () =>
      saveLivreur(id, { app_active: false }).catch(() => null);

    pingActif();
    const interval = setInterval(pingActif, 10 * 1000); // Ping toutes les 10s au lieu de 60s
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') pingInactif();
      else pingActif();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', pingInactif);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', pingInactif);
      pingInactif();
    };
  }, [initialProfil?.id]);

  // Mes courses externes (déjà assignées)
  const { data: mesCourses = [] } = useQuery({
    queryKey: ["mes-courses-externes", livreurProfil?.id],
    queryFn: async () => {
      const courses = await base44.entities.CourseExterne.filter({ 
        livreur_id: livreurProfil.id 
      }, "-created_date", 50);
      console.log('[LIVREUR EXTERNE] 📦 mesCourses query:', {
        livreur_id: livreurProfil.id,
        count: courses?.length || 0,
        courses: courses?.map(c => ({ id: c.id, statut: c.statut, dispatch_status: c.dispatch_status }))
      });
      return courses || [];
    },
    enabled: !!livreurProfil?.id,
    initialData: [],
    refetchInterval: 2000, // Réduit à 2s pour temps réel
  });

  // Course en attente - même logique que livreur interne
  const courseEnAttente = useMemo(() => {
    const course = mesCourses.find(c => c.statut === "recherche_livreur" && c.dispatch_status === "propose");
    console.log('[LIVREUR EXTERNE] 🎯 courseEnAttente:', course ? {
      id: course.id,
      dispatch_status: course.dispatch_status,
      statut: course.statut,
      livreur_id: course.livreur_id
    } : null);
    return course;
  }, [mesCourses]);
  
  const coursesActives = useMemo(() => mesCourses.filter(c => ["livreur_en_route", "colis_recupere", "en_livraison"].includes(c.statut)), [mesCourses]);

  // Calcul des gains (70% du prix final)
  const totalEncaisse = useMemo(() => {
    const today = new Date().toDateString();
    return mesCourses
      .filter(c => c.statut === "livree" && c.montant_livreur && new Date(c.heure_livraison || c.updated_date).toDateString() === today)
      .reduce((sum, c) => sum + (c.montant_livreur || 0), 0);
  }, [mesCourses]);

  const montantDüSilga = livreurProfil?.montant_du_silga || 0;

  // Mutation statut livreur
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

  const handleActiverGPS = () => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible sur cet appareil");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsActif(true);
        setGpsRequis(false);
        saveLivreur(livreurProfil.id, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          derniere_position_date: new Date().toISOString(),
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
          toast.success("GPS activé – vous pouvez accéder au tableau de bord");
        }).catch(() => toast.error("Position GPS non enregistrée"));
      },
      () => { setGpsActif(false); toast.error("Permission GPS refusée – obligatoire pour utiliser l'app"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // GPS tracking périodique (toutes les 15s si disponible)
  useEffect(() => {
    if (!livreurProfil?.id || livreurProfil.statut === "hors_ligne" || !gpsActif) return;
    const interval = setInterval(() => {
      navigator.geolocation?.getCurrentPosition(
        (pos) => saveLivreur(livreurProfil.id, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          derniere_position_date: new Date().toISOString(),
        }).catch(() => null),
        () => setGpsActif(false),
        { enableHighAccuracy: true }
      );
    }, 15000);
    return () => clearInterval(interval);
  }, [livreurProfil?.id, livreurProfil?.statut, gpsActif]);

  // Mutation courses
  const updateCourseMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CourseExterne.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
    },
  });

  const handleAccepter = (course) => {
    // L'acceptation est maintenant gérée par le modal via dispatchExterneAuto
    // Cette fonction est appelée après succès de l'acceptation
    queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles", "mes-courses-externes"] });
    statutMutation.mutate("en_course");
    toast.success("Course acceptée ! 🚀");
  };

  const handleRefuser = async (course, raison) => {
    // Le refus est maintenant géré par le modal via dispatchExterneAuto
    // Cette fonction est appelée après succès du refus
    queryClient.invalidateQueries({ queryKey: ["mes-courses-externes", "courses-externes-disponibles"] });
    toast(`Course refusée (${raison || 'occupé'})`);
  };

  const handleColisRecupere = (course) => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible");
      updateCourseMutation.mutate({ id: course.id, data: { statut: "colis_recupere", heure_recuperation: new Date().toISOString() } });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateCourseMutation.mutate({
          id: course.id,
          data: {
            statut: "colis_recupere",
            heure_recuperation: new Date().toISOString(),
            latitude_recuperation: pos.coords.latitude,
            longitude_recuperation: pos.coords.longitude,
          },
        });
        toast.success("Colis récupéré ! 📦 Position GPS enregistrée");
      },
      (err) => {
        console.error("Erreur GPS:", err);
        updateCourseMutation.mutate({
          id: course.id,
          data: {
            statut: "colis_recupere",
            heure_recuperation: new Date().toISOString(),
          },
        });
        toast.warning("Colis récupéré (GPS non disponible)");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleColisLivre = (course, gpsArrivee) => {
    if (!navigator.geolocation || !gpsArrivee) {
      updateCourseMutation.mutate({
        id: course.id,
        data: {
          statut: "livree",
          heure_livraison: new Date().toISOString(),
        },
      });
    } else {
      const gpsDepart = { lat: course.latitude_recuperation, lng: course.longitude_recuperation };
      const distance = gpsDepart.lat ? 
        Math.sqrt(Math.pow(gpsArrivee.lat - gpsDepart.lat, 2) + Math.pow(gpsArrivee.lng - gpsDepart.lng, 2)) * 111 : 
        null;
      const prixFinal = distance ? Math.round(distance * 100) : course.prix_estimate || 0;
      const commissionSilga = Math.round(prixFinal * 0.3);
      const montantLivreur = prixFinal - commissionSilga;

      updateCourseMutation.mutate({
        id: course.id,
        data: {
          statut: "livree",
          heure_livraison: new Date().toISOString(),
          latitude_livraison: gpsArrivee.lat,
          longitude_livraison: gpsArrivee.lng,
          distance_reelle_km: distance,
          prix_final: prixFinal,
          commission_silga: commissionSilga,
          montant_livreur: montantLivreur,
        },
      });

      // Mettre à jour le montant dû à Silga
      saveLivreur(livreurProfil.id, {
        montant_du_silga: (livreurProfil.montant_du_silga || 0) + commissionSilga
      });
    }
    statutMutation.mutate("disponible");
    toast.success(`Livraison terminée ! 🎉`);
  };

  const handleLogout = () => {
    if (livreurProfil?.id) {
      saveLivreur(livreurProfil.id, { app_active: false }).catch(() => null);
    }
    ['base44_access_token', 'access_token', 'base44_token', 'token'].forEach(k => {
      try { localStorage.removeItem(k); } catch(_) {}
    });
    base44.auth.logout();
    setTimeout(() => window.location.reload(), 300);
  };

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

  // Écran GPS obligatoire
  if (gpsRequis && !gpsActif) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-accent/10 to-green-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-3xl shadow-2xl p-6 space-y-6 text-center">
          <div className="w-20 h-20 rounded-2xl bg-green-50 flex items-center justify-center mx-auto">
            <span className="text-4xl">📍</span>
          </div>
          <div>
            <p className="text-xl font-black text-gray-900 mb-2">GPS Obligatoire</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Activez votre GPS pour accéder à votre tableau de bord et recevoir des courses.
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-xs text-amber-700 font-semibold">
              ⚠️ Sans GPS, vous ne pourrez pas recevoir de courses ni être visible sur la carte.
            </p>
          </div>
          <button
            className="w-full h-14 rounded-2xl bg-gradient-to-b from-accent to-green-600 text-white font-black text-base shadow-lg shadow-green-200 active:scale-95 transition-all"
            onClick={handleActiverGPS}
          >
            Activer le GPS
          </button>
          <p className="text-xs text-gray-400">
            Appuyez sur "Autoriser" lorsque votre appareil vous demande la permission
          </p>
        </div>
      </div>
    );
  }

  const isEnLigne = livreurProfil.statut !== "hors_ligne";
  const livreurVisible = isEnLigne && gpsActif && livreurProfil.latitude && livreurProfil.longitude;

  return (
    <div className="min-h-screen bg-gray-50">
      {courseEnAttente && (
        <CourseEnAttenteModal
          course={courseEnAttente}
          livreurId={livreurProfil.id}
          onAccepter={handleAccepter}
          onRefuser={handleRefuser}
          isPending={updateCourseMutation.isPending}
          onExpire={() => {
            queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles", "mes-courses-externes"] });
          }}
        />
      )}

      <div className="max-w-lg mx-auto p-4 pb-12">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
          <TabsList className="w-full">
            <TabsTrigger value="courses" className="flex-1 text-xs">Courses</TabsTrigger>
            <TabsTrigger value="historique" className="flex-1 text-xs">Historique</TabsTrigger>
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
      </div>
    </div>
  );
}