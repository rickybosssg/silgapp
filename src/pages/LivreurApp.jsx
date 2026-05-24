import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Truck } from "lucide-react";
import { toast } from "sonner";
import { useSilgappAuth } from "@/lib/silgappAuth";
import { registerPushToken, subscribeToNotifications } from "@/lib/notifications";
import {
  getNativeLivreurState,
  isNativeLivreurRuntime,
  updateNativeLivreur,
  updateNativeLivreurCourse,
} from "@/lib/nativeLivreurApi";

import LivreurHeader from "@/components/livreur/LivreurHeader";
import LivreurStatsBanner from "@/components/livreur/LivreurStatsBanner";
import LivreurStatutCard from "@/components/livreur/LivreurStatutCard";
import EmptyStateAttente from "@/components/livreur/EmptyStateAttente";
import CourseEnAttenteModal from "@/components/livreur/CourseEnAttenteModal";
import CourseActiveCard from "@/components/livreur/CourseActiveCard";
import LivreurHistorique from "@/components/livreur/LivreurHistorique";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LivreurApp() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoadingAuth, logout } = useSilgappAuth();
  const [activeTab, setActiveTab] = useState("courses");
  const isNativeLivreur = isNativeLivreurRuntime();

  // Rediriger les admins
  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated && user?.role === "admin") {
      console.log('[LivreurApp] Admin detected, redirecting to dashboard');
      navigate("/", { replace: true });
    }
  }, [isLoadingAuth, isAuthenticated, user, navigate]);

  const { data: nativeState } = useQuery({
    queryKey: ["native-livreur-state", user?.livreur_id],
    queryFn: () => getNativeLivreurState(user.livreur_id),
    enabled: isNativeLivreur && !!user?.livreur_id,
    refetchInterval: 5000,
  });

  const { data: livreurProfil, error: livreurProfilError, isLoading: isLoadingLivreurProfil } = useQuery({
    queryKey: ["livreur-profil", user?.livreur_id || user?.email, isNativeLivreur],
    queryFn: async () => {
      // Priorité 1 : données natives (APK)
      if (isNativeLivreur) {
        const result = [nativeState?.livreur || user?.livreur].filter(Boolean);
        return result;
      }
      // Priorité 2 : profil dans la session livreur (connexion par code)
      if (user?.livreur) {
        return [user.livreur];
      }
      // Priorité 3 : recherche via backend pour les admins/comptes Base44
      if (!user?.email) return [];
      const direct = await base44.entities.Livreur.filter({ user_email: user.email });
      return direct || [];
    },
    enabled: !!user,
    refetchInterval: 10000,
    select: (data) => data?.[0] || null,
  });

  useEffect(() => {
    if (isNativeLivreur && nativeState?.livreur) {
      queryClient.invalidateQueries({ queryKey: ["livreur-profil"] });
    }
  }, [isNativeLivreur, nativeState?.livreur?.id, nativeState?.livreur?.statut, nativeState?.livreur?.updated_date, queryClient]);

  useEffect(() => {
    if (livreurProfil?.actif === false) {
      toast.error("Votre compte a été désactivé.");
      logout();
    }
  }, [livreurProfil?.actif]);

  // Enregistrer token push et s'abonner aux notifications
  useEffect(() => {
    if (!livreurProfil?.id) return;

    const notificationEmail = user?.email || livreurProfil?.user_email;

    const setupNotifications = async () => {
      // Enregistrer le token
      const token = await registerPushToken(livreurProfil.id, user);
      if (token) {
        console.log('Token push livreur enregistré:', token);
      }

      if (!notificationEmail) return undefined;

      // S'abonner aux notifications
      const unsubscribe = subscribeToNotifications(
        (notification) => {
          toast.info(`${notification.titre}: ${notification.message}`);
        },
        notificationEmail
      );

      return () => unsubscribe();
    };

    setupNotifications();
  }, [livreurProfil?.id, user?.email, livreurProfil?.user_email]);

  const { data: webMesCourses = [] } = useQuery({
    queryKey: ["mes-courses", livreurProfil?.id, isNativeLivreur],
    queryFn: () => base44.entities.Course.filter({ livreur_id: livreurProfil.id }, "-created_date", 50),
    enabled: !!livreurProfil?.id && !isNativeLivreur,
    initialData: [],
    refetchInterval: 5000,
  });
  const mesCourses = isNativeLivreur ? (nativeState?.courses || []) : webMesCourses;

  const courseEnAttente = useMemo(() => mesCourses.find(c => c.statut === "en_attente_livreur"), [mesCourses]);
  const coursesActives = useMemo(() => mesCourses.filter(c => ["acceptee", "colis_recupere", "en_livraison"].includes(c.statut)), [mesCourses]);

  const totalEncaisse = useMemo(() => {
    const today = new Date().toDateString();
    return mesCourses
      .filter(c => c.statut === "livree" && c.prix_reel && new Date(c.heure_livraison || c.updated_date).toDateString() === today)
      .reduce((sum, c) => sum + (c.prix_reel || 0), 0);
  }, [mesCourses]);

  const toggleDispoMutation = useMutation({
    mutationFn: (newStatut) => (
      isNativeLivreur
        ? updateNativeLivreur(livreurProfil.id, { statut: newStatut })
        : base44.entities.Livreur.update(livreurProfil.id, { statut: newStatut })
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["native-livreur-state"] });
      queryClient.invalidateQueries({ queryKey: ["livreur-profil"] });
    },
  });

  const updateCourseMutation = useMutation({
    mutationFn: ({ id, data }) => (
      isNativeLivreur
        ? updateNativeLivreurCourse(livreurProfil.id, id, data)
        : base44.entities.Course.update(id, data)
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["native-livreur-state"] });
      queryClient.invalidateQueries({ queryKey: ["mes-courses"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
  });

  const handleAccepter = (course) => {
    updateCourseMutation.mutate({ id: course.id, data: { statut: "acceptee", heure_acceptation: new Date().toISOString() } });
    if (isNativeLivreur) {
      updateNativeLivreur(livreurProfil.id, { statut: "en_course" });
    } else {
      base44.entities.Livreur.update(livreurProfil.id, { statut: "en_course" });
    }
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
    if (isNativeLivreur) {
      updateNativeLivreur(livreurProfil.id, { statut: "disponible" });
    } else {
      base44.entities.Livreur.update(livreurProfil.id, { statut: "disponible" });
    }
    queryClient.invalidateQueries({ queryKey: ["livreur-profil"] });
    toast.success(`Livraison terminée ! 🎉 ${prixReel.toLocaleString()} FCFA encaissés`);
  };

  const handleClientAnnule = (course) => {
    updateCourseMutation.mutate({ id: course.id, data: { statut: "annulee", remarque_livreur: "Annulé par le client" } });
    if (isNativeLivreur) {
      updateNativeLivreur(livreurProfil.id, { statut: "disponible" });
    } else {
      base44.entities.Livreur.update(livreurProfil.id, { statut: "disponible" });
    }
    queryClient.invalidateQueries({ queryKey: ["livreur-profil"] });
    toast("Course annulée par le client");
  };

  const handleToggleLigne = (enLigne) => {
    toggleDispoMutation.mutate(enLigne ? "disponible" : "hors_ligne");
  };

  // GPS tracking
  useEffect(() => {
    if (!livreurProfil || livreurProfil.statut === "hors_ligne") return;
    const updatePos = () => {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          const positionData = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            derniere_position_date: new Date().toISOString(),
          };
          if (isNativeLivreur) {
            updateNativeLivreur(livreurProfil.id, positionData);
          } else {
            base44.entities.Livreur.update(livreurProfil.id, positionData);
          }
        },
        () => {},
        { enableHighAccuracy: true }
      );
    };
    updatePos();
    const interval = setInterval(updatePos, 30000);
    return () => clearInterval(interval);
  }, [livreurProfil?.id, livreurProfil?.statut, isNativeLivreur]);

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

  // ---- NON CONNECTE ----
  if (!isAuthenticated) return null;

  // ---- ERREUR DE CHARGEMENT ----
  if (livreurProfilError) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="w-20 h-20 rounded-3xl bg-red-50 flex items-center justify-center text-4xl shadow">⚠️</div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Erreur de chargement</h1>
          <p className="text-gray-500 text-sm mt-1 max-w-md leading-relaxed">
            Impossible de charger votre profil livreur.
          </p>
        </div>
        <button className="px-6 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-semibold" onClick={() => logout()}>
          Se déconnecter
        </button>
      </div>
    );
  }

  // ---- PAS DE PROFIL LIVREUR (seulement si la query est terminée) ----
  if (!isLoadingLivreurProfil && livreurProfil === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="w-20 h-20 rounded-3xl bg-red-50 flex items-center justify-center text-4xl shadow">🚫</div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Accès non autorisé</h1>
          <p className="text-gray-500 text-sm mt-1 max-w-xs leading-relaxed">
            Votre compte n'est pas autorisé par Silga Livraison. Contactez un administrateur.
          </p>
        </div>
        <button className="px-6 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-semibold" onClick={() => logout()}>
          Se déconnecter
        </button>
      </div>
    );
  }

  // En cours de chargement du profil (après auth OK)
  if (!livreurProfil) return null;

  const isEnLigne = livreurProfil.statut !== "hors_ligne";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modal nouvelle course */}
      {courseEnAttente && (
        <CourseEnAttenteModal
          course={courseEnAttente}
          onAccepter={handleAccepter}
          onRefuser={handleRefuser}
          isPending={updateCourseMutation.isPending}
        />
      )}

      <div className="max-w-lg mx-auto p-4 pb-12">
        {/* Onglets */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
          <TabsList className="w-full">
            <TabsTrigger value="courses" className="flex-1 text-xs">Courses</TabsTrigger>
            <TabsTrigger value="historique" className="flex-1 text-xs">Historique</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Contenu onglet Courses */}
        {activeTab === "courses" && (
          <div className="space-y-4">
        {/* Header */}
        <LivreurHeader
          livreur={livreurProfil}
          isEnLigne={isEnLigne}
          onToggleLigne={handleToggleLigne}
          onLogout={logout}
        />

        {/* Stats du jour */}
        <LivreurStatsBanner mesCourses={mesCourses} totalEncaisse={totalEncaisse} />

        {/* Carte statut */}
        <LivreurStatutCard statut={livreurProfil.statut} livreur={livreurProfil} />

        {/* Courses actives */}
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

        {/* Etat vide - en ligne mais pas de course */}
        {coursesActives.length === 0 && isEnLigne && (
          <EmptyStateAttente />
        )}

        {/* Résumé financier du jour si totalEncaisse > 0 */}
        {totalEncaisse > 0 && (
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl p-5 border border-amber-100 shadow-sm">
            <p className="text-xs text-amber-600 font-bold uppercase tracking-wide mb-1">Bilan du jour</p>
            <p className="text-3xl font-black text-amber-700">{totalEncaisse.toLocaleString()} <span className="text-base font-semibold text-amber-500">FCFA</span></p>
            <p className="text-xs text-amber-500 mt-1">Montant à reverser à Silga Livraison</p>
          </div>
        )}
          </div>
        )}

        {/* Contenu onglet Historique */}
        {activeTab === "historique" && (
          <div>
            <LivreurHistorique mesCourses={mesCourses} livreurProfil={livreurProfil} />
          </div>
        )}
      </div>
    </div>
  );
}