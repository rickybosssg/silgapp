import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Truck } from "lucide-react";
import { toast } from "sonner";
import { useSilgappAuth } from "@/lib/silgappAuth";
import { registerPushToken, subscribeToNotifications } from "@/lib/notifications";
import LivreurHeader from "@/components/livreur/LivreurHeader";
import LivreurStatsBanner from "@/components/livreur/LivreurStatsBanner";
import LivreurStatutCard from "@/components/livreur/LivreurStatutCard";
import EmptyStateAttente from "@/components/livreur/EmptyStateAttente";
import CourseEnAttenteModal from "@/components/livreur/CourseEnAttenteModal";
import CourseActiveCard from "@/components/livreur/CourseActiveCard";
import LivreurHistorique from "@/components/livreur/LivreurHistorique";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Sauvegarde livreur via le SDK base44 (inclut le token d'app automatiquement)
const saveLivreur = (id, data) => base44.functions.invoke('updateLivreur', { id, data });

export default function LivreurApp() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoadingAuth, logout } = useSilgappAuth();
  const [activeTab, setActiveTab] = useState("courses");

  // ---- GPS local state ----
  const [gpsActif, setGpsActif] = useState(false);

  // Rediriger les admins
  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated && user?.role === "admin") {
      navigate("/", { replace: true });
    }
  }, [isLoadingAuth, isAuthenticated, user, navigate]);

  // ---- Chargement du profil livreur ----
  const { data: livreurProfil, error: livreurProfilError, isLoading: isLoadingLivreurProfil } = useQuery({
    queryKey: ["livreur-profil", user?.livreur_id || user?.email],
    queryFn: async () => {
      // Connexion par code : profil dans la session
      if (user?.livreur) return [user.livreur];
      // Connexion Base44 standard : recherche par email
      if (user?.email) {
        const result = await base44.entities.Livreur.filter({ user_email: user.email });
        return result || [];
      }
      return [];
    },
    enabled: !!user,
    refetchInterval: 10000,
    select: (data) => data?.[0] || null,
  });

  // Déconnecter si compte désactivé
  useEffect(() => {
    if (livreurProfil?.actif === false) {
      toast.error("Votre compte a été désactivé.");
      logout();
    }
  }, [livreurProfil?.actif]);

  // Notifications push
  useEffect(() => {
    if (!livreurProfil?.id) return;
    const email = user?.email || livreurProfil?.user_email;
    registerPushToken(livreurProfil.id, user).catch(() => null);
    if (!email) return;
    const unsub = subscribeToNotifications(
      (n) => toast.info(`${n.titre}: ${n.message}`),
      email
    );
    return () => unsub?.();
  }, [livreurProfil?.id, user?.email, livreurProfil?.user_email]);

  // ---- Courses ----
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

  // ---- Mutation statut livreur ----
  const statutMutation = useMutation({
    mutationFn: (newStatut) => saveLivreur(livreurProfil.id, { statut: newStatut }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["livreur-profil"] });
      toast.success("Statut mis à jour");
    },
    onError: (err) => toast.error("Erreur : " + (err?.message || "inconnue")),
  });

  // ---- Handler toggle en ligne / hors ligne ----
  const handleToggleLigne = () => {
    const estHorsLigne = livreurProfil.statut === "hors_ligne";
    const newStatut = estHorsLigne ? "disponible" : "hors_ligne";
    statutMutation.mutate(newStatut);
  };

  // ---- Handler GPS ----
  const handleActiverGPS = () => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible sur cet appareil");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGpsActif(true);
        saveLivreur(livreurProfil.id, {
          latitude,
          longitude,
          derniere_position_date: new Date().toISOString(),
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["livreur-profil"] });
          toast.success("GPS activé – position enregistrée");
        }).catch(() => {
          toast.error("Position GPS non enregistrée");
        });
      },
      () => {
        setGpsActif(false);
        toast.error("Permission GPS refusée");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // GPS tracking périodique si en ligne et GPS actif
  useEffect(() => {
    if (!livreurProfil?.id || livreurProfil.statut === "hors_ligne" || !gpsActif) return;
    const interval = setInterval(() => {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          saveLivreur(livreurProfil.id, {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            derniere_position_date: new Date().toISOString(),
          }).catch(() => null);
        },
        () => setGpsActif(false),
        { enableHighAccuracy: true }
      );
    }, 30000);
    return () => clearInterval(interval);
  }, [livreurProfil?.id, livreurProfil?.statut, gpsActif]);

  // ---- Mutation courses ----
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

  const handleRefuser = (course) => {
    updateCourseMutation.mutate({ id: course.id, data: { statut: "nouvelle", livreur_id: "", livreur_nom: "" } });
    toast("Course refusée");
  };

  const handleColisRecupere = (course) => {
    updateCourseMutation.mutate({ id: course.id, data: { statut: "colis_recupere", heure_recuperation: new Date().toISOString() } });
    toast.success("Colis récupéré ! 📦");
  };

  const handleColisLivre = (course, prixReel) => {
    updateCourseMutation.mutate({ id: course.id, data: { statut: "livree", heure_livraison: new Date().toISOString(), prix_reel: prixReel } });
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

  // ---- LOADING ----
  if (isLoadingAuth || isLoadingLivreurProfil) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Truck className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (livreurProfilError) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="w-20 h-20 rounded-3xl bg-red-50 flex items-center justify-center text-4xl shadow">⚠️</div>
        <h1 className="text-xl font-black text-gray-900">Erreur de chargement</h1>
        <button className="px-6 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-semibold" onClick={logout}>
          Se déconnecter
        </button>
      </div>
    );
  }

  if (!isLoadingLivreurProfil && livreurProfil === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="w-20 h-20 rounded-3xl bg-red-50 flex items-center justify-center text-4xl shadow">🚫</div>
        <h1 className="text-xl font-black text-gray-900">Accès non autorisé</h1>
        <p className="text-gray-500 text-sm max-w-xs">Votre compte n'est pas autorisé par Silga Livraison.</p>
        <button className="px-6 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-semibold" onClick={logout}>
          Se déconnecter
        </button>
      </div>
    );
  }

  if (!livreurProfil) return null;

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
              onLogout={logout}
            />

            {/* Avertissement GPS */}
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