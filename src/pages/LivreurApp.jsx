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
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [loadingStep, setLoadingStep] = useState("initial");
  const isNativeLivreur = isNativeLivreurRuntime();

  // Timeout de chargement - afficher l'erreur après 3 secondes
  useEffect(() => {
    console.log('[LivreurApp] Loading timeout started');
    setLoadingStep('auth_check');
    
    const timer = setTimeout(() => {
      console.log('[LivreurApp] LOADING TIMEOUT - Step:', loadingStep);
      setLoadingTimeout(true);
    }, 3000);
    
    return () => clearTimeout(timer);
  }, []);
  
  // Mettre à jour l'étape de chargement (livreurProfil déclaré plus bas — on utilisera un state séparé)
  useEffect(() => {
    if (isAuthenticated) {
      setLoadingStep('session_restored');
    }
    if (!isLoadingAuth && !loadingTimeout) {
      setLoadingStep('ready');
    }
  }, [isAuthenticated, isLoadingAuth, loadingTimeout]);

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
      console.log('[LivreurApp] Fetching livreur profil...');
      console.log('[LivreurApp] Query params:', { user_email: user?.email, livreur_id: user?.livreur_id, isNativeLivreur });
      
      try {
        if (isNativeLivreur) {
          console.log('[LivreurApp] Using native path');
          const result = [nativeState?.livreur || user?.livreur].filter(Boolean);
          console.log('[LivreurApp] Native result:', result);
          return result;
        }
        
        if (user?.livreur) {
          console.log('[LivreurApp] Using user.livreur from session');
          return [user.livreur];
        }
        
        if (!user?.email) {
          console.warn('[LivreurApp] No user email');
          return [];
        }
        
        console.log('[LivreurApp] Calling base44.entities.Livreur.filter...');
        const direct = await base44.entities.Livreur.filter({ user_email: user.email });
        console.log('[LivreurApp] Direct filter result:', direct);
        
        if (direct?.[0]) {
          console.log('[LivreurApp] Direct match found:', direct[0].nom);
          return direct;
        }
        
        console.log('[LivreurApp] Fallback: listing all livreurs...');
        const allLivreurs = await base44.entities.Livreur.list("-created_date", 500);
        console.log('[LivreurApp] Total livreurs:', allLivreurs.length);
        
        const filtered = allLivreurs.filter((livreur) => (livreur.user_email || '').trim().toLowerCase() === user.email.trim().toLowerCase());
        console.log('[LivreurApp] Filtered result:', filtered.length, 'matches');
        
        return filtered;
      } catch (error) {
        console.error('[LivreurApp] Livreur profil fetch FAILED:', error);
        throw error;
      }
    },
    enabled: !!user,
    refetchInterval: 10000,
    select: (data) => {
      console.log('[LivreurApp] Select called with data:', data?.length);
      return data[0] || null;
    },
    onError: (error) => {
      console.error('[LivreurApp] useQuery ERROR:', error);
      console.error('[LivreurApp] Error details:', { message: error?.message, stack: error?.stack });
    },
    onSuccess: (data) => {
      console.log('[LivreurApp] useQuery SUCCESS:', data ? { id: data.id, nom: data.nom } : 'null');
    },
  });

  useEffect(() => {
    if (livreurProfil) {
      setLoadingStep('livreur_found');
    }
  }, [livreurProfil]);

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
  if (isLoadingAuth || loadingTimeout) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 p-6">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto">
            <Truck className="w-8 h-8 text-primary animate-pulse" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-white font-bold">SILGAPP 2 - Chargement</h2>
            
            {/* Logs de chargement */}
            <div className="bg-gray-800 rounded-lg p-3 text-left text-xs font-mono space-y-1">
              <div className={loadingStep !== 'initial' ? 'text-green-400' : 'text-gray-500'}>
                {loadingStep !== 'initial' ? '✅' : '⏳'} 1. Session authentifiée
              </div>
              <div className="text-gray-500">
                Email: {user?.email || 'N/A'}
              </div>
              <div className="text-gray-500">
                Role: {user?.role || 'N/A'}
              </div>
              <div className="text-gray-500">
                Livreur ID: {user?.livreur_id || 'N/A'}
              </div>
              
              <div className={loadingStep !== 'session_restored' ? 'text-green-400' : 'text-gray-500'}>
                {loadingStep !== 'session_restored' ? '✅' : '⏳'} 2. Session restaurée
              </div>
              
              <div className={loadingStep !== 'livreur_found' ? 'text-green-400' : loadingTimeout ? 'text-red-400' : 'text-gray-500'}>
                {loadingStep !== 'livreur_found' ? '✅' : loadingTimeout ? '❌' : '⏳'} 3. Profil livreur chargé
              </div>
              
              {loadingTimeout && (
                <div className="text-red-400 mt-2 pt-2 border-t border-red-800">
                  ⚠️ TIMEOUT APRÈS 3 SECONDES
                  <div className="text-red-500 text-xs mt-1">
                    Étape bloquée: <span className="font-bold">{loadingStep}</span>
                  </div>
                  <div className="text-red-500 text-xs mt-1">
                    isAuthenticated: <span className="font-bold">{isAuthenticated ? 'true' : 'false'}</span>
                  </div>
                  <div className="text-red-500 text-xs mt-1">
                    livreurProfil: <span className="font-bold">{livreurProfil ? 'chargé' : 'undefined/null'}</span>
                  </div>
                  <div className="text-red-500 text-xs mt-1">
                    isLoadingAuth: <span className="font-bold">{isLoadingAuth ? 'true' : 'false'}</span>
                  </div>
                </div>
              )}
            </div>
            
            <p className="text-white/50 text-xs mt-2">
              {loadingTimeout 
                ? "Le chargement prend trop de temps. Vérifiez les logs ci-dessus."
                : "Chargement en cours..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- NON CONNECTE : gere par App.jsx (Silgapp2Login) ----
  if (!isAuthenticated) {
    console.log('[LivreurApp] Not authenticated, returning null');
    return null;
  }

  console.log('[LivreurApp] Authenticated, checking livreurProfil:', livreurProfil);
  console.log('[LivreurApp] livreurProfilError:', livreurProfilError);
  console.log('[LivreurApp] isLoadingLivreurProfil:', isLoadingLivreurProfil);

  // ---- ERREUR DE CHARGEMENT ----
  if (livreurProfilError) {
    console.error('[LivreurApp] LIVREUR PROFIL ERROR:', livreurProfilError);
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="w-20 h-20 rounded-3xl bg-red-50 flex items-center justify-center text-4xl shadow">⚠️</div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Erreur de chargement</h1>
          <p className="text-gray-500 text-sm mt-1 max-w-md leading-relaxed">
            Impossible de charger votre profil livreur.
          </p>
          <div className="bg-red-100 rounded-lg p-3 mt-3 text-left text-xs text-red-700 font-mono">
            {livreurProfilError?.message || 'Erreur inconnue'}
          </div>
        </div>
        <button
          className="px-6 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-semibold"
          onClick={() => logout()}
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  // ---- PAS DE PROFIL LIVREUR ----
  if (livreurProfil === null) {
    console.warn('[LivreurApp] Livreur profil is NULL - no match found');
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="w-20 h-20 rounded-3xl bg-red-50 flex items-center justify-center text-4xl shadow">🚫</div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Accès non autorisé</h1>
          <p className="text-gray-500 text-sm mt-1 max-w-xs leading-relaxed">
            Votre compte n'est pas autorisé par Silga Livraison. Contactez un administrateur.
          </p>
        </div>
        <button
          className="px-6 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-semibold"
          onClick={() => logout()}
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  if (!livreurProfil) {
    console.warn('[LivreurApp] Livreur profil is UNDEFINED - returning null (should not happen)');
    return null;
  }

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