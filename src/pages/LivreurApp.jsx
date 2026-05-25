import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Truck, ChevronDown } from "lucide-react";
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

export default function LivreurApp() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("courses");
  const [selectedLivreurId, setSelectedLivreurId] = useState(() => localStorage.getItem("livreur_selected_id") || "");
  const [gpsActif, setGpsActif] = useState(false);

  // ---- Chargement de tous les livreurs actifs ----
  const { data: tousLivreurs = [], isLoading: isLoadingLivreurs } = useQuery({
    queryKey: ["livreurs-actifs"],
    queryFn: () => base44.entities.Livreur.filter({ actif: true, validation: "valide" }),
    initialData: [],
  });

  const livreurProfil = useMemo(
    () => tousLivreurs.find(l => l.id === selectedLivreurId) || null,
    [tousLivreurs, selectedLivreurId]
  );

  const handleSelectLivreur = (id) => {
    setSelectedLivreurId(id);
    localStorage.setItem("livreur_selected_id", id);
  };

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
      queryClient.invalidateQueries({ queryKey: ["livreurs-actifs"] });
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
        saveLivreur(livreurProfil.id, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          derniere_position_date: new Date().toISOString(),
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["livreurs-actifs"] });
          toast.success("GPS activé – position enregistrée");
        }).catch(() => toast.error("Position GPS non enregistrée"));
      },
      () => { setGpsActif(false); toast.error("Permission GPS refusée"); },
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
      queryClient.invalidateQueries({ queryKey: ["livreurs-actifs"] })
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
      queryClient.invalidateQueries({ queryKey: ["livreurs-actifs"] })
    );
    toast.success(`Livraison terminée ! 🎉 ${prixReel.toLocaleString()} FCFA encaissés`);
  };

  const handleClientAnnule = (course) => {
    updateCourseMutation.mutate({ id: course.id, data: { statut: "annulee", remarque_livreur: "Annulé par le client" } });
    saveLivreur(livreurProfil.id, { statut: "disponible" }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["livreurs-actifs"] })
    );
    toast("Course annulée par le client");
  };

  // ---- LOADING ----
  if (isLoadingLivreurs) {
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

  // ---- SÉLECTEUR DE LIVREUR ----
  if (!livreurProfil) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 gap-6">
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center">
          <Truck className="w-10 h-10 text-primary" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-black text-gray-900">SILGAPP 2</h1>
          <p className="text-gray-500 text-sm mt-1">Sélectionnez votre profil livreur</p>
        </div>
        <div className="w-full max-w-sm space-y-2">
          {tousLivreurs.length === 0 ? (
            <p className="text-center text-gray-400 text-sm">Aucun livreur disponible</p>
          ) : (
            tousLivreurs.map(l => (
              <button
                key={l.id}
                onClick={() => handleSelectLivreur(l.id)}
                className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-200 hover:border-primary hover:shadow-md transition-all text-left"
              >
                {l.photo_url ? (
                  <img src={l.photo_url} alt={l.nom} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold text-lg">{(l.prenom || l.nom).charAt(0).toUpperCase()}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900">{l.prenom ? `${l.prenom} ${l.nom}` : l.nom}</p>
                  <p className="text-xs text-gray-400">{l.telephone}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-300 -rotate-90 flex-shrink-0" />
              </button>
            ))
          )}
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
              onLogout={() => { handleSelectLivreur(""); }}
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