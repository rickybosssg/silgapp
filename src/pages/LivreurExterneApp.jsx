import React, { useState, useEffect, useMemo, useRef } from "react";
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
  const [gpsRequis, setGpsRequis] = useState(true);
  const [showDebug, setShowDebug] = useState(false);

  // ─── Profil livreur (rechargé toutes les 10s) ─────────────────────────────
  const { data: livreurProfil } = useQuery({
    queryKey: ["livreur-externe-profil", initialProfil?.id],
    queryFn: () => base44.entities.Livreur.filter({ id: initialProfil.id }),
    select: (data) => Array.isArray(data) ? (data[0] || initialProfil) : initialProfil,
    initialData: [initialProfil],
    enabled: !!initialProfil?.id,
    refetchInterval: 10000,
  });

  // ─── Notifications push — dépendances stables ─────────────────────────────
  const livreurId = livreurProfil?.id;
  const livreurEmail = livreurProfil?.user_email;
  useEffect(() => {
    if (!livreurId || !livreurEmail) return;
    registerPushToken(livreurId, { email: livreurEmail }).catch(() => null);
    const unsub = subscribeToNotifications(
      (n) => toast.info(`${n.titre}: ${n.message}`),
      livreurEmail
    );
    return () => unsub?.();
  }, [livreurId, livreurEmail]); // Stables : ne changent pas si profil rechargé avec mêmes valeurs

  // ─── Heartbeat app_active ─────────────────────────────────────────────────
  useEffect(() => {
    if (!initialProfil?.id) return;
    const id = initialProfil.id;

    const pingActif = () =>
      saveLivreur(id, { app_active: true, last_seen_at: new Date().toISOString() }).catch(() => null);
    const pingInactif = () =>
      saveLivreur(id, { app_active: false }).catch(() => null);

    pingActif();
    const interval = setInterval(pingActif, 10000);
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

  // ─── Mes courses (poll 2s) ─────────────────────────────────────────────────
  const { data: mesCourses = [] } = useQuery({
    queryKey: ["mes-courses-externes", livreurId],
    queryFn: async () => {
      const courses = await base44.entities.CourseExterne.filter(
        { livreur_id: livreurId },
        "-created_date",
        50
      );
      return courses || [];
    },
    enabled: !!livreurId,
    initialData: [],
    refetchInterval: 2000,
  });

  // ─── Course en attente de réponse ─────────────────────────────────────────
  const courseEnAttente = useMemo(() => {
    return mesCourses.find(
      c => c.statut === "recherche_livreur" && c.dispatch_status === "propose"
    ) || null;
  }, [mesCourses]);

  // ─── Courses actives (en route / colis récupéré / en livraison) ───────────
  const coursesActives = useMemo(
    () => mesCourses.filter(c => ["livreur_en_route", "colis_recupere", "en_livraison"].includes(c.statut)),
    [mesCourses]
  );

  // ─── Gains du jour ────────────────────────────────────────────────────────
  const totalEncaisse = useMemo(() => {
    const today = new Date().toDateString();
    return mesCourses
      .filter(c => c.statut === "livree" && c.montant_livreur &&
        new Date(c.heure_livraison || c.updated_date).toDateString() === today)
      .reduce((sum, c) => sum + (c.montant_livreur || 0), 0);
  }, [mesCourses]);

  const montantDüSilga = livreurProfil?.montant_du_silga || 0;

  // ─── isEnLigne — défini ici, AVANT debugData ──────────────────────────────
  const isEnLigne = livreurProfil ? livreurProfil.statut !== "hors_ligne" : false;
  const livreurVisible = isEnLigne && gpsActif && livreurProfil?.latitude && livreurProfil?.longitude;

  // ─── Debug data ───────────────────────────────────────────────────────────
  const debugData = {
    totalCourses: mesCourses.length,
    courseEnAttente: courseEnAttente ? {
      id: courseEnAttente.id,
      statut: courseEnAttente.statut,
      dispatch_status: courseEnAttente.dispatch_status,
      livreur_id: courseEnAttente.livreur_id,
      client_nom: courseEnAttente.client_nom,
      adresse_depart: courseEnAttente.adresse_depart,
      timeout_expires_at: courseEnAttente.timeout_expires_at,
    } : null,
    modalOpen: !!courseEnAttente,
    livreurStatut: livreurProfil?.statut,
    gpsActif,
    isEnLigne,
  };

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
    const baseData = { statut: "livree", heure_livraison: new Date().toISOString() };

    if (gpsArrivee && course.latitude_recuperation && course.longitude_recuperation) {
      // Haversine pour prix exact
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

  // ─── Modal plein écran si course en attente ───────────────────────────────
  if (courseEnAttente) {
    return (
      <>
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
        {/* Debug overlay */}
        <button
          onClick={() => setShowDebug(v => !v)}
          className="fixed bottom-4 right-4 z-[200] w-10 h-10 rounded-full bg-red-600 text-white font-bold text-xs shadow-lg"
        >
          🐛
        </button>
        {showDebug && <DebugPanel data={debugData} onClose={() => setShowDebug(false)} />}
      </>
    );
  }

  // ─── Dashboard principal ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
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

      {/* Debug bouton toujours visible */}
      <button
        onClick={() => setShowDebug(v => !v)}
        className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full bg-red-600 text-white font-bold text-xs shadow-lg"
      >
        🐛
      </button>
      {showDebug && <DebugPanel data={debugData} onClose={() => setShowDebug(false)} />}
    </div>
  );
}

// ─── Composant Debug Panel ────────────────────────────────────────────────────
function DebugPanel({ data, onClose }) {
  return (
    <div className="fixed top-0 left-0 z-[150] bg-black/95 text-green-400 p-4 text-xs font-mono h-screen overflow-auto w-full max-w-xs">
      <div className="flex justify-between items-center mb-3">
        <strong className="text-white text-sm">🔍 DEBUG — LivreurExterne</strong>
        <button onClick={onClose} className="text-white text-lg leading-none">✕</button>
      </div>
      <div className="space-y-1 text-white mb-3">
        <p>📦 Courses totales: <span className="text-green-400">{data.totalCourses}</span></p>
        <p>🚨 Modal ouvert: <span className={data.modalOpen ? "text-green-400" : "text-red-400"}>{data.modalOpen ? "OUI" : "NON"}</span></p>
        <p>📍 GPS actif: <span className={data.gpsActif ? "text-green-400" : "text-red-400"}>{data.gpsActif ? "OUI" : "NON"}</span></p>
        <p>✅ En ligne: <span className={data.isEnLigne ? "text-green-400" : "text-red-400"}>{data.isEnLigne ? "OUI" : "NON"}</span></p>
        <p>👤 Statut: <span className="text-yellow-400">{data.livreurStatut}</span></p>
      </div>
      {data.courseEnAttente ? (
        <div className="border border-green-700 rounded p-2 space-y-1">
          <p className="text-yellow-400 font-bold">🎯 COURSE EN ATTENTE</p>
          <p>ID: {data.courseEnAttente.id}</p>
          <p>Statut: {data.courseEnAttente.statut}</p>
          <p>Dispatch: {data.courseEnAttente.dispatch_status}</p>
          <p>Client: {data.courseEnAttente.client_nom}</p>
          <p>Départ: {data.courseEnAttente.adresse_depart}</p>
          <p>Expire: {data.courseEnAttente.timeout_expires_at ? new Date(data.courseEnAttente.timeout_expires_at).toLocaleTimeString() : 'N/A'}</p>
        </div>
      ) : (
        <div className="border border-gray-700 rounded p-2">
          <p className="text-gray-400">Aucune course en attente</p>
          <p className="text-gray-500 text-xs mt-1">Filtre: statut=recherche_livreur + dispatch_status=propose</p>
        </div>
      )}
      <pre className="mt-3 text-green-300 text-[10px] whitespace-pre-wrap">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}