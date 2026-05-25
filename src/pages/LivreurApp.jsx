import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Truck } from "lucide-react";
import { toast } from "sonner";

/**
 * Calcule la distance entre 2 points GPS (formule Haversine)
 */
function calculerDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Rayon terre en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
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

/**
 * LivreurApp — reçoit livreurProfil directement depuis AuthGate via App.jsx
 * Plus de sélecteur localStorage, plus de codes livreur
 */
export default function LivreurApp({ livreurProfil: initialProfil }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("courses");
  const [gpsActif, setGpsActif] = useState(false);
  const [gpsRequis, setGpsRequis] = useState(true);

  // Recharger le profil livreur en temps réel
  const { data: livreurProfil } = useQuery({
    queryKey: ["livreur-profil", initialProfil?.id],
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

  // ── Heartbeat app_active ──────────────────────────────────────────────────
  // Marque le livreur comme actif dans l'app et met à jour last_seen_at
  useEffect(() => {
    if (!initialProfil?.id) return;
    const id = initialProfil.id;

    const pingActif = () =>
      saveLivreur(id, { app_active: true, last_seen_at: new Date().toISOString() }).catch(() => null);

    const pingInactif = () =>
      saveLivreur(id, { app_active: false }).catch(() => null);

    // Ping immédiat à l'ouverture
    pingActif();

    // Heartbeat toutes les 60 secondes
    const interval = setInterval(pingActif, 60 * 1000);

    // Inactif quand l'onglet/app passe en arrière-plan
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        pingInactif();
      } else {
        pingActif();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Inactif à la fermeture de la fenêtre (best-effort)
    window.addEventListener('beforeunload', pingInactif);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', pingInactif);
      pingInactif();
    };
  }, [initialProfil?.id]);

  // Courses
  const { data: mesCourses = [] } = useQuery({
    queryKey: ["mes-courses", livreurProfil?.id],
    queryFn: () => base44.entities.Course.filter({ livreur_id: livreurProfil.id }, "-created_date", 50),
    enabled: !!livreurProfil?.id,
    initialData: [],
    refetchInterval: 5000,
  });

  const courseEnAttente = useMemo(() => mesCourses.find(c => c.statut === "en_attente_livreur"), [mesCourses]);
  const coursesActives = useMemo(() => mesCourses.filter(c => ["acceptee", "colis_recupere", "en_livraison"].includes(c.statut)), [mesCourses]);

  const totalEncaisse = useMemo(() => {
    const today = new Date().toDateString();
    return mesCourses
      .filter(c => c.statut === "livree" && c.prix_reel && new Date(c.heure_livraison || c.updated_date).toDateString() === today)
      .reduce((sum, c) => sum + (c.prix_reel || 0), 0);
  }, [mesCourses]);

  // Mutation statut livreur
  const statutMutation = useMutation({
    mutationFn: (newStatut) => saveLivreur(livreurProfil.id, { statut: newStatut }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["livreur-profil"] });
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
          queryClient.invalidateQueries({ queryKey: ["livreur-profil"] });
          toast.success("GPS activé – vous pouvez accéder au tableau de bord");
        }).catch(() => toast.error("Position GPS non enregistrée"));
      },
      () => { setGpsActif(false); toast.error("Permission GPS refusée – obligatoire pour utiliser l'app"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // GPS tracking périodique
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
    }, 30000);
    return () => clearInterval(interval);
  }, [livreurProfil?.id, livreurProfil?.statut, gpsActif]);

  // Mutation courses
  const updateCourseMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Course.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mes-courses"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
  });

  const handleAccepter = (course) => {
    updateCourseMutation.mutate({ id: course.id, data: { statut: "acceptee", heure_acceptation: new Date().toISOString() } });
    saveLivreur(livreurProfil.id, { statut: "en_course" }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["livreur-profil"] })
    );
    toast.success("Course acceptée ! 🚀");
  };

  const handleRefuser = (course, raison) => {
    const remarque = raison 
      ? `Livreur occupé : ${raison === "en_course" ? "déjà en cours de livraison" : "indisponible"}`
      : "Course refusée";
    
    updateCourseMutation.mutate({ 
      id: course.id, 
      data: { 
        statut: "nouvelle", 
        livreur_id: "", 
        livreur_nom: "",
        remarque_livreur: remarque,
        dispatch_status: "en_attente_admin",
        dispatch_mode: "manuel"
      } 
    });
    // Invalider les queries immédiatement pour que la course réapparaisse dans "Courses à dispatcher"
    queryClient.invalidateQueries({ queryKey: ["courses"] });
    toast("Course renvoyée à l'admin");
  };

  const handleColisRecupere = (course) => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible");
      updateCourseMutation.mutate({ id: course.id, data: { statut: "colis_recupere", heure_recuperation: new Date().toISOString(), colis_recupere_at: new Date().toISOString() } });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateCourseMutation.mutate({
          id: course.id,
          data: {
            statut: "colis_recupere",
            heure_recuperation: new Date().toISOString(),
            colis_recupere_at: new Date().toISOString(),
            latitude_depart_livraison: pos.coords.latitude,
            longitude_depart_livraison: pos.coords.longitude,
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
            colis_recupere_at: new Date().toISOString(),
          },
        });
        toast.warning("Colis récupéré (GPS non disponible)");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleColisLivre = (course, prixReel, gpsArrivee) => {
    if (!navigator.geolocation || !gpsArrivee) {
      updateCourseMutation.mutate({
        id: course.id,
        data: {
          statut: "livree",
          heure_livraison: new Date().toISOString(),
          colis_livre_at: new Date().toISOString(),
          prix_reel: prixReel,
        },
      });
    } else {
      // Calcul distance et durée
      const gpsDepart = { lat: course.latitude_depart_livraison, lng: course.longitude_depart_livraison };
      const distance = gpsDepart.lat ? calculerDistance(gpsDepart.lat, gpsDepart.lng, gpsArrivee.lat, gpsArrivee.lng) : null;
      const duree = course.colis_recupere_at ? Math.round((new Date().getTime() - new Date(course.colis_recupere_at).getTime()) / 60000) : null;

      updateCourseMutation.mutate({
        id: course.id,
        data: {
          statut: "livree",
          heure_livraison: new Date().toISOString(),
          colis_livre_at: new Date().toISOString(),
          latitude_arrivee_livraison: gpsArrivee.lat,
          longitude_arrivee_livraison: gpsArrivee.lng,
          distance_km: distance,
          duree_livraison_minutes: duree,
          gps_distance_type: distance ? "estimee" : null,
          prix_reel: prixReel,
        },
      });
    }
    saveLivreur(livreurProfil.id, { statut: "disponible" }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["livreur-profil"] })
    );
    toast.success(`Livraison terminée ! 🎉 ${prixReel.toLocaleString()} FCFA encaissés`);
  };

  const handleClientAnnule = (course) => {
    updateCourseMutation.mutate({ id: course.id, data: { statut: "annulee", remarque_livreur: "Annulé par le client" } });
    saveLivreur(livreurProfil.id, { statut: "disponible" }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["livreur-profil"] })
    );
    toast("Course annulée par le client");
  };

  const handleLogout = () => {
    // Marquer inactif avant déconnexion
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
      <div className="fixed inset-0 bg-gradient-to-br from-primary/10 to-red-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-3xl shadow-2xl p-6 space-y-6 text-center">
          <div className="w-20 h-20 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
            <span className="text-4xl">📍</span>
          </div>
          <div>
            <p className="text-xl font-black text-gray-900 mb-2">GPS Obligatoire</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Pour des raisons de sécurité et de suivi, l'activation du GPS est requise pour accéder à votre tableau de bord.
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-xs text-amber-700 font-semibold">
              ⚠️ Sans GPS, vous ne pourrez pas recevoir de courses ni être visible sur la carte.
            </p>
          </div>
          <button
            className="w-full h-14 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-base shadow-lg shadow-red-200 active:scale-95 transition-all"
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
          onAccepter={handleAccepter}
          onRefuser={handleRefuser}
          isPending={updateCourseMutation.isPending}
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

            <LivreurStatsBanner mesCourses={mesCourses} totalEncaisse={totalEncaisse} />
            <LivreurStatutCard statut={livreurProfil.statut} livreur={livreurProfil} />

            {coursesActives.length > 0 && (
              <div className="space-y-3">
                {coursesActives.map(course => (
                  <CourseActiveCard
                    key={course.id}
                    course={course}
                    onColisRecupere={handleColisRecupere}
                    onColisLivre={handleColisLivre}
                    onClientAnnule={handleClientAnnule}
                    isPending={updateCourseMutation.isPending}
                  />
                ))}
              </div>
            )}

            {coursesActives.length === 0 && isEnLigne && <EmptyStateAttente />}

            {totalEncaisse > 0 && (
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl p-5 border border-amber-100 shadow-sm">
                <p className="text-xs text-amber-600 font-bold uppercase tracking-wide mb-1">Bilan du jour</p>
                <p className="text-3xl font-black text-amber-700">{totalEncaisse.toLocaleString()} <span className="text-base font-semibold text-amber-500">FCFA</span></p>
                <p className="text-xs text-amber-500 mt-1">Montant à reverser à Silga Livraison</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "historique" && (
          <LivreurHistorique mesCourses={mesCourses} livreurProfil={livreurProfil} />
        )}
      </div>
    </div>
  );
}