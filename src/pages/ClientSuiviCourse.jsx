import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClientNotifications } from "@/hooks/useClientNotifications";
import { useNavigate, useLocation } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, Package, CheckCircle2, Clock, User, Star, XCircle, ArrowLeft, Share2, Ruler, Banknote } from "lucide-react";

function haversineKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
import LivreurAssigneCard from "@/components/client/LivreurAssigneCard";

// Ouvre WhatsApp via wa.me (fonctionne sur Android/iOS, ouvre l'app si installée)
function openWhatsApp(phone, message = "") {
  // Numéro passé tel quel — doit déjà inclure l'indicatif pays (ex: 22670123456)
  const num = phone?.replace(/\D/g, "") || "";
  const encoded = message ? encodeURIComponent(message) : "";
  const url = `https://wa.me/${num}${encoded ? `?text=${encoded}` : ""}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import LivreurRatingDialog from "@/components/client/LivreurRatingDialog";
import DestinataireReactionButton from "@/components/client/DestinataireReactionButton";
import QRCodeDisplay from "@/components/client/QRCodeDisplay";
import AnnulerCourseDialog from "@/components/client/AnnulerCourseDialog";
import ETADisplay from "@/components/client/ETADisplay";
import HistoriqueCoursesClient from "@/components/client/HistoriqueCoursesClient";
import FraisAnnulationBannerClient from "@/components/client/FraisAnnulationBannerClient";
import MultiColisClientView from "@/components/multi-colis/MultiColisClientView";
import { useDestinataireGPS } from "@/hooks/useDestinataireGPS";
import { playNotificationSound } from "@/hooks/useSonEtVibration";


function buildWhatsAppMessage(course) {
  const trackingUrl = course.tracking_token
    ? `${window.location.origin}/suivi-public/${course.tracking_token}`
    : `${window.location.origin}/suivi-public/${course.id}`;
  return `Bonjour 👋\nUn colis SILGAPP est en route pour vous.\n\n📍 Suivre la livraison :\n${trackingUrl}\n\nMerci.`;
}

export default function ClientSuiviCourse() {
  const navigate = useNavigate();
  const location = useLocation();
  const [userId, setUserId] = useState(null);
  const [showRating, setShowRating] = useState(false);
  const [showAnnulerDialog, setShowAnnulerDialog] = useState(false);
  const [ratingShownForCourse, setRatingShownForCourse] = useState(null);
  const [onglet, setOnglet] = useState("actives"); // "actives" | "historique"
  // Pré-sélectionner la course depuis la navigation (bouton "Voir la course")
  const [selectedCourseId, setSelectedCourseId] = useState(
    location.state?.course_id || null
  );
  const [userEmail, setUserEmail] = useState(null);

  const queryClient = useQueryClient();

  // GPS live du destinataire (actif uniquement quand une course est en livraison)
  // maCourse n'est pas encore défini ici — on poll via un state intermédiaire
  const [destTelephone, setDestTelephone] = useState(null);
  const { gpsLat: destGpsLat, gpsLng: destGpsLng, lastUpdate: destGpsLastUpdate } =
    useDestinataireGPS(destTelephone, !!destTelephone);

  useEffect(() => {
    base44.auth.me().then(u => setUserEmail(u?.email)).catch(() => null);
  }, []);

  // Notifications push — son + vibration déclenchés directement dans useClientNotifications
  useClientNotifications(userEmail, (notif) => {
    // Rafraîchir les courses dès qu'une notification arrive
    if (notif.course_id) {
      queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
    }
  });

  // Récupérer l'ID user pour filtrer correctement
  useEffect(() => {
    base44.auth.me().then(u => setUserId(u?.id)).catch(() => null);
  }, []);

  const [clientProfilId, setClientProfilId] = useState(null);

  useEffect(() => {
    if (!userId) return;
    base44.auth.me().then(async (user) => {
      try {
        const clients = await base44.entities.ClientExterne.filter({ user_email: user.email });
        if (clients?.length > 0) setClientProfilId(clients[0].id);
      } catch (_) {}
    }).catch(() => null);
  }, [userId]);

  // Charger les courses créées par l'utilisateur + celles où il est destinataire
  // CORRECTION CRITIQUE : Polling 2s + GPS temps réel + synchronisation parfaite
  // Charger les pays pour récupérer le tarif_km
  const { data: countries = [] } = useQuery({
    queryKey: ["countries-tarifs"],
    queryFn: () => base44.entities.Country.list(),
    staleTime: 60000,
  });

  // Frais d'annulation impayés pour ce client
  const { data: fraisImpayes = [] } = useQuery({
    queryKey: ["frais-annulation-client", clientProfilId],
    queryFn: () => clientProfilId
      ? base44.entities.FraisAnnulation.filter({ client_id: clientProfilId, statut_paiement: "impaye" })
      : [],
    enabled: !!clientProfilId,
    refetchInterval: 30000,
  });

  const { data: courses = [], refetch, isLoading } = useQuery({
    queryKey: ["mes-courses-externes", userId, clientProfilId],
    queryFn: async () => {
      const byCreator = await base44.entities.CourseExterne.filter(
        { created_by_id: userId }, "-updated_date", 50
      );
      let byDest = [];
      let byExpediteur = [];
      if (clientProfilId) {
        // Courses où l'utilisateur est destinataire
        const allByDest = await base44.entities.CourseExterne.filter(
          { destinataire_client_id: clientProfilId }, "-updated_date", 50
        );
        byDest = (allByDest || []).filter(c => c.created_by_id !== userId);
        // Courses où l'utilisateur est expéditeur réel (mode "recevoir" initié par quelqu'un d'autre)
        const allByExp = await base44.entities.CourseExterne.filter(
          { expediteur_client_id: clientProfilId }, "-updated_date", 50
        );
        byExpediteur = (allByExp || []).filter(c => c.created_by_id !== userId);
      }
      // Fusionner sans doublons
      const map = new Map();
      [...(byCreator || []), ...(byDest || []), ...(byExpediteur || [])].forEach(c => map.set(c.id, c));
      const courses = [...map.values()].sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date));

      // CORRECTION CRITIQUE : Enrichir avec GPS TEMPS RÉEL du livreur (poll 2s)
      const livreurIds = [...new Set(courses.filter(c => c.livreur_id && !["livree", "annulee"].includes(c.statut)).map(c => c.livreur_id))];
      if (livreurIds.length > 0) {
        const livreursData = await Promise.all(
          livreurIds.map(id => base44.entities.Livreur.filter({ id }).then(r => r?.[0]).catch(() => null))
        );
        const livreurMap = {};
        livreursData.forEach(l => { if (l) livreurMap[l.id] = l; });
        return courses.map(c => {
          if (!c.livreur_id || !livreurMap[c.livreur_id]) return c;
          const l = livreurMap[c.livreur_id];
          return {
            ...c,
            livreur_photo_url: l.photo_url || c.livreur_photo_url || null,
            livreur_note_moyenne: l.note_moyenne || 0,
            livreur_nombre_avis: l.nombre_avis || 0,
            livreur_vehicule: l.vehicule || l.type_vehicule || c.livreur_vehicule || null,
            _livreur: l, // GPS temps réel ici
          };
        });
      }
      return courses;
    },
    enabled: !!userId,
    initialData: [],
    refetchInterval: 5000, // ⚡ 2s → 5s : 4 requêtes imbriquées par poll = ~48/min max
    staleTime: 2000,
  });

  // Toutes les courses actives / terminées
  const coursesActives = courses.filter(c => !["livree", "annulee"].includes(c.statut));
  const coursesHistorique = courses.filter(c => ["livree", "annulee"].includes(c.statut));
  // Course sélectionnée : celle choisie ou la première active ou la dernière
  const maCourse = (selectedCourseId ? courses.find(c => c.id === selectedCourseId) : null)
    || coursesActives[0] || courses[0] || null;

  // Déclencheur direct sur changement de statut critique (fallback si notification ratée)
  const [prevStatut, setPrevStatut] = useState(null);
  useEffect(() => {
    if (!maCourse?.statut || prevStatut === maCourse.statut) return;
    
    const statutsCritiques = ["livreur_en_route", "colis_recupere", "en_livraison", "livree"];
    if (statutsCritiques.includes(maCourse.statut) && !statutsCritiques.includes(prevStatut)) {
      playNotificationSound();
      navigator.vibrate?.([500, 150, 500, 150, 500]);
    }
    
    setPrevStatut(maCourse.statut);
  }, [maCourse?.statut, prevStatut]);

  // Auto-affichage notation quand course passe en "livree"
  useEffect(() => {
    if (!maCourse || !userId) return;
    if (maCourse.statut !== "livree") return;
    if (maCourse.note_livreur) return; // déjà noté
    if (ratingShownForCourse === maCourse.id) return; // déjà déclenché

    // Déterminer si l'utilisateur est l'expéditeur/client principal
    const isPrincipal =
      (maCourse.type_course === "expedier" && (maCourse.expediteur_client_id === clientProfilId || maCourse.created_by_id === userId)) ||
      (maCourse.type_course === "recevoir" && (maCourse.destinataire_client_id === clientProfilId || maCourse.created_by_id === userId)) ||
      maCourse.created_by_id === userId; // fallback: créateur = client principal

    if (isPrincipal) {
      // Délai court pour laisser le temps à l'UI de s'afficher
      const timer = setTimeout(() => {
        setShowRating(true);
        setRatingShownForCourse(maCourse.id);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [maCourse?.id, maCourse?.statut, maCourse?.note_livreur, userId, clientProfilId, ratingShownForCourse]);

  const handleRated = () => {
    setShowRating(false);
    // Rediriger immédiatement vers le dashboard — la course passera en historique
    navigate("/", { replace: true });
  };

  // Activer le poll GPS live dès qu'une course est en phase de livraison
  useEffect(() => {
    if (!maCourse) { setDestTelephone(null); return; }
    const isLivraisonPhase = ["colis_recupere", "en_livraison"].includes(maCourse.statut);
    setDestTelephone(isLivraisonPhase ? (maCourse.destinataire_telephone || null) : null);
  }, [maCourse?.id, maCourse?.statut, maCourse?.destinataire_telephone]);

  if (!userId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-sm">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </Card>
      </div>
    );
  }

  // Si pas de course active mais historique disponible → basculer sur historique
  if (!maCourse && coursesHistorique.length > 0 && onglet === "actives") {
    setOnglet("historique");
  }

  // Helper : détermine si l'utilisateur est l'expéditeur (client principal) ou le destinataire
  function isClientPrincipalForETA(course, uid, profilId) {
    return (
      (course.type_course === "expedier" && (course.expediteur_client_id === profilId || course.created_by_id === uid)) ||
      (course.type_course === "recevoir" && (course.destinataire_client_id === profilId || course.created_by_id === uid))
    );
  }

  const statutLabels = {
    nouvelle: "Nouvelle course",
    recherche_livreur: (course) =>
      course?.pricing_mode === "manual" && course?.manual_price_status === "pending_client_validation"
        ? (course.created_by_id === userId ? "💰 Prix proposé — votre accord requis" : "🔍 Recherche de livreur...")
        : "Recherche de livreur...",
    livreur_en_route: "Livreur en route vers récupération",
    colis_recupere: "Colis récupéré",
    en_livraison: "Livreur en route vers livraison",
    livree: "Course livrée",
    annulee: "Course annulée",
  };

  const getStatutLabel = (course) => {
    const v = statutLabels[course?.statut];
    return typeof v === "function" ? v(course) : (v || course?.statut);
  };

  const statutColors = {
    nouvelle: "bg-gray-100 text-gray-700",
    recherche_livreur: "bg-orange-100 text-orange-700",
    livreur_en_route: "bg-blue-100 text-blue-700",
    colis_recupere: "bg-purple-100 text-purple-700",
    en_livraison: "bg-blue-100 text-blue-700",
    livree: "bg-green-100 text-green-700",
    annulee: "bg-red-100 text-red-700",
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Bouton retour — sticky, gros, accessible au pouce */}
        <div className="sticky top-0 z-20 pt-2 pb-1 space-y-2">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3 w-full bg-white border border-gray-200 shadow-md rounded-2xl px-5 h-14 text-base font-bold text-gray-800 active:scale-[0.98] transition-all"
          >
            <ArrowLeft className="w-6 h-6 text-primary flex-shrink-0" />
            <span>← Retour au dashboard</span>
          </button>

          {/* Onglets Actives / Historique */}
          <div className="flex bg-white rounded-2xl p-1 gap-1 shadow-sm border border-gray-100">
            <button
              onClick={() => setOnglet("actives")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                onglet === "actives" ? "bg-primary text-white shadow" : "text-gray-500"
              }`}
            >
              🚚 Actives
              {coursesActives.length > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${onglet === "actives" ? "bg-white/30" : "bg-primary/10 text-primary"}`}>
                  {coursesActives.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setOnglet("historique")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                onglet === "historique" ? "bg-gray-800 text-white shadow" : "text-gray-500"
              }`}
            >
              📋 Historique
              {coursesHistorique.length > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${onglet === "historique" ? "bg-white/30" : "bg-gray-100 text-gray-600"}`}>
                  {coursesHistorique.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Bannière frais d'annulation impayés */}
        {fraisImpayes.length > 0 && (
          <FraisAnnulationBannerClient fraisImpayes={fraisImpayes} />
        )}

        {/* ── ONGLET HISTORIQUE ── */}
        {onglet === "historique" && (
          <HistoriqueCoursesClient
            courses={coursesHistorique}
            fraisAnnulation={fraisImpayes}
            onSelectCourse={(id) => {
              setSelectedCourseId(id);
              setOnglet("actives");
            }}
          />
        )}

        {/* ── PAS DE COURSE ACTIVE ── */}
        {onglet === "actives" && !maCourse && (
          <div className="py-12 text-center space-y-3">
            <div className="text-6xl">😊</div>
            <p className="text-sm font-medium text-gray-500">Aucune course active en ce moment</p>
            <button
              onClick={() => navigate("/")}
              className="text-primary text-sm font-bold underline"
            >
              Créer une nouvelle course
            </button>
          </div>
        )}

        {/* ── ONGLET ACTIVES ── */}
        {onglet === "actives" && maCourse && (
          <>

        {/* Sélecteur de course si plusieurs actives */}
        {coursesActives.length > 1 && (
          <Card className="p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              {coursesActives.length} courses actives — sélectionnez
            </p>
            <div className="space-y-2">
              {coursesActives.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCourseId(c.id)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    maCourse?.id === c.id ? "border-primary bg-primary/5" : "border-gray-200 hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground truncate max-w-[200px]">
                      {c.adresse_depart} → {c.adresse_arrivee}
                    </span>
                    <Badge className={`text-xs ml-2 flex-shrink-0 ${
                      c.statut === "recherche_livreur" ? "bg-orange-100 text-orange-700" :
                      c.statut === "livreur_en_route" ? "bg-blue-100 text-blue-700" :
                      "bg-purple-100 text-purple-700"
                    }`}>
                      {c.statut === "recherche_livreur" ? "🔍" : c.statut === "livreur_en_route" ? "🚀" : "📦"}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Statut course */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-foreground">Suivi de course</h1>
            <Badge className={statutColors[maCourse.statut]}>
              {getStatutLabel(maCourse)}
            </Badge>
          </div>

          {/* Progress bar */}
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Créée</span>
            <span>Récupération</span>
            <span>Livraison</span>
          </div>
          <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`absolute h-full transition-all duration-500 ${
                maCourse.statut === "livree" ? "bg-green-500 w-full" :
                maCourse.statut === "en_livraison" ? "bg-primary w-full" :
                maCourse.statut === "livreur_en_route" || maCourse.statut === "colis_recupere" ? "bg-primary w-2/3" :
                maCourse.statut === "annulee" ? "bg-red-400 w-0" :
                "bg-primary w-1/3"
              }`}
            />
          </div>

          {/* Bouton Annuler */}
          {!["livree", "annulee"].includes(maCourse.statut) && (
            <Button
              variant="outline"
              className="w-full mt-4 border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => setShowAnnulerDialog(true)}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Annuler la course
            </Button>
          )}
        </Card>

        {/* Infos livreur — Card style Uber uniquement si livreur a accepté */}
        {maCourse.livreur_id && maCourse.heure_acceptation && (
          <LivreurAssigneCard course={maCourse} />
        )}

        {/* ETA temps réel — expéditeur : vers récupération puis vers livraison */}
        {/* CORRECTION CRITIQUE : ETA TOUJOURS affiché, même <100m */}
        {["livreur_en_route", "colis_recupere", "en_livraison"].includes(maCourse.statut) && maCourse.livreur_id && isClientPrincipalForETA(maCourse, userId, clientProfilId) && (
          (() => {
            const livreurLat = maCourse._livreur?.latitude;
            const livreurLng = maCourse._livreur?.longitude;
            const isVersRecup = maCourse.statut === "livreur_en_route";
            // GPS live destinataire prioritaire pour la phase livraison, fallback gps_arrivee
            const targetLat = isVersRecup ? maCourse.gps_depart_lat : (destGpsLat || maCourse.gps_arrivee_lat);
            const targetLng = isVersRecup ? maCourse.gps_depart_lng : (destGpsLng || maCourse.gps_arrivee_lng);
            // CORRECTION : Afficher ETA même si GPS manquant (affichera "en route")
            return (
              <ETADisplay
                livreurLat={livreurLat || null}
                livreurLng={livreurLng || null}
                targetLat={targetLat || null}
                targetLng={targetLng || null}
                livreurNom={maCourse.livreur_nom}
                phase={isVersRecup ? "vers_recuperation" : "vers_livraison"}
                statut={maCourse.statut}
              />
            );
          })()
        )}

        {/* ETA temps réel — destinataire : vers livraison uniquement (après récupération) */}
        {/* CORRECTION CRITIQUE : ETA TOUJOURS affiché, même <100m */}
        {["colis_recupere", "en_livraison"].includes(maCourse.statut) && maCourse.livreur_id && (
          (() => {
            const livreurLat = maCourse._livreur?.latitude;
            const livreurLng = maCourse._livreur?.longitude;
            const isDestinataire = maCourse.type_course === "expedier" && maCourse.destinataire_client_id === clientProfilId;
            const shouldShow = isDestinataire || !isClientPrincipalForETA(maCourse, userId, clientProfilId);
            if (!shouldShow) return null;
            // CORRECTION : Afficher ETA même si GPS manquant
            return (
              <ETADisplay
                livreurLat={livreurLat || null}
                livreurLng={livreurLng || null}
                targetLat={destGpsLat || maCourse.gps_arrivee_lat || null}
                targetLng={destGpsLng || maCourse.gps_arrivee_lng || null}
                livreurNom={maCourse.livreur_nom}
                phase="vers_livraison"
                statut={maCourse.statut}
                gpsLastUpdate={destGpsLastUpdate}
              />
            );
          })()
        )}

        {/* Trajet + Estimation — affiché dès que la course existe */}
        <Card className="p-4 space-y-3">
          {/* Estimation style Uber — toujours visible */}
          {(() => {
            // Tarif km du pays de la course (fallback 100)
            const countryData = countries.find(c => c.code === maCourse.country_code);
            const tarifKm = countryData?.prix_par_km || 100;
            const PRIX_MIN = 1000;

            // === DISTANCE AFFICHÉE (livreur → cible en temps réel) ===
            const livreurLat = maCourse._livreur?.latitude;
            const livreurLng = maCourse._livreur?.longitude;
            const colisRecupere = ["colis_recupere", "en_livraison"].includes(maCourse.statut);
            const isLivree = maCourse.statut === "livree";

            // Cible livreur : vers expéditeur (récupération) ou vers destinataire (livraison)
            // GPS live destinataire prioritaire pour la phase livraison
            const cibleLat = colisRecupere ? (destGpsLat || maCourse.gps_arrivee_lat) : maCourse.gps_depart_lat;
            const cibleLng = colisRecupere ? (destGpsLng || maCourse.gps_arrivee_lng) : maCourse.gps_depart_lng;

            // Distance affichée = livreur → cible (temps réel) si disponible, sinon distance réelle post-livraison
            const distLivreurCible = livreurLat && livreurLng && cibleLat && cibleLng
              ? haversineKm(livreurLat, livreurLng, cibleLat, cibleLng)
              : null;
            const distReelle = isLivree
              ? (maCourse.distance_reelle_km || haversineKm(maCourse.latitude_recuperation, maCourse.longitude_recuperation, maCourse.latitude_livraison, maCourse.longitude_livraison))
              : null;
            const distAffichee = isLivree ? distReelle : distLivreurCible;

            // === DURÉE (ETA livreur → cible en temps réel) ===
            const dureeMs = isLivree && maCourse.heure_livraison && maCourse.heure_recuperation
              ? new Date(maCourse.heure_livraison) - new Date(maCourse.heure_recuperation)
              : isLivree && maCourse.heure_livraison && maCourse.heure_acceptation
                ? new Date(maCourse.heure_livraison) - new Date(maCourse.heure_acceptation)
                : null;
            const dureeReelle = dureeMs ? Math.round(dureeMs / 60000) : null;
            // ETA temps réel : distance livreur → cible ÷ vitesse (25 km/h)
            const etaTempsReel = distLivreurCible != null ? Math.max(1, Math.round((distLivreurCible / 25) * 60)) : null;
            const temps = isLivree ? dureeReelle : etaTempsReel;

            // === PRIX : TOUJOURS basé sur expéditeur → destinataire (règle SILGAPP) ===
            // Guard : si destination_inconnue, les GPS arrivée sont null → pas de calcul de distance
            const hasArriveCoords = !maCourse.destination_inconnue
              && maCourse.gps_arrivee_lat != null && maCourse.gps_arrivee_lng != null
              && !isNaN(maCourse.gps_arrivee_lat) && !isNaN(maCourse.gps_arrivee_lng);
            const distCourse = hasArriveCoords
              ? haversineKm(maCourse.gps_depart_lat, maCourse.gps_depart_lng, maCourse.gps_arrivee_lat, maCourse.gps_arrivee_lng)
              : null;
            const isFinal = isLivree && maCourse.prix_final > 0;
            
            // ✅ PRIX MANUEL ACCEPTÉ = prix officiel de la course
            const isPrixManuelAccepte = maCourse.pricing_mode === "manual" 
              && maCourse.manual_price_status === "accepted" 
              && maCourse.manual_price > 0;
            
            let prix = 0;
            if (isPrixManuelAccepte) {
              // Prix manuel accepté = source de vérité unique
              prix = Math.max(Number(maCourse.manual_price), PRIX_MIN);
            } else if (isFinal) {
              prix = Math.max(maCourse.prix_final, PRIX_MIN);
            } else if (distCourse != null && distCourse > 0) {
              if (distCourse <= 10) {
                prix = PRIX_MIN;
              } else {
                prix = Math.max(Math.round(distCourse * tarifKm), PRIX_MIN);
              }
            } else if (maCourse.prix_estimate > 0) {
              prix = Math.max(maCourse.prix_estimate, PRIX_MIN);
            }

            return (
              <div className={`grid grid-cols-3 gap-3 pt-3 mt-1 border-t ${isFinal ? "border-green-200" : "border-gray-200"}`}>
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-3 text-center shadow-lg">
                  <span className="text-2xl font-black text-white block">
                    {distAffichee != null ? Number(distAffichee).toFixed(1) : "—"}
                  </span>
                  <span className="text-[10px] font-bold text-blue-100 uppercase tracking-wide">
                    {isLivree ? "Distance (km)" : colisRecupere ? "→ Livraison" : "→ Récup."}
                  </span>
                </div>
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-3 text-center shadow-lg">
                  <span className="text-2xl font-black text-white block">{temps != null ? temps : "—"}</span>
                  <span className="text-[10px] font-bold text-blue-100 uppercase tracking-wide">
                    {isLivree ? "Durée (min)" : "ETA (min)"}
                  </span>
                </div>
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-3 text-center shadow-lg">
                  <span className="text-2xl font-black text-white block">{prix > 0 ? prix.toLocaleString() : "—"}</span>
                  <span className="text-[10px] font-bold text-blue-100 uppercase tracking-wide">
                    {isPrixManuelAccepte ? "Prix validé ✓" : isFinal ? "Prix final" : "Prix approx."}
                  </span>
                </div>
              </div>
            );
          })()}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground uppercase font-semibold">Récupération</p>
              <p className="text-sm font-bold text-foreground">{maCourse.adresse_depart}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground uppercase font-semibold">Livraison</p>
              {/* Bug #1 — si destination_inconnue et livraison faite, afficher adresse réelle ou coordonnées */}
              <p className="text-sm font-bold text-foreground">
                {maCourse.statut === "livree" && maCourse.destination_inconnue
                  ? maCourse.adresse_arrivee && maCourse.adresse_arrivee !== "Destination à définir"
                    ? maCourse.adresse_arrivee
                    : maCourse.latitude_livraison
                      ? `📍 GPS : ${Number(maCourse.latitude_livraison).toFixed(4)}, ${Number(maCourse.longitude_livraison).toFixed(4)}`
                      : maCourse.latitude_arrivee_livraison
                        ? `📍 GPS : ${Number(maCourse.latitude_arrivee_livraison).toFixed(4)}, ${Number(maCourse.longitude_arrivee_livraison).toFixed(4)}`
                        : "Position du destinataire confirmée"
                  : maCourse.adresse_arrivee || "—"}
              </p>
            </div>
          </div>


        </Card>

        {/* Multi-colis — progression par colis côté client */}
        {maCourse.is_multi_colis && (
          <MultiColisClientView course={maCourse} />
        )}

        {/* QR Codes — dès que les codes existent */}
        {!["livree", "annulee"].includes(maCourse.statut) && (
          <div className="space-y-4">
            {/* Pickup QR — visible avant récupération */}
            {maCourse.pickup_qr_token && !maCourse.pickup_confirmed_at && (
              <QRCodeDisplay course={maCourse} type="pickup" />
            )}
            {/* Delivery QR — visible après récupération ou dès que le code existe */}
            {maCourse.delivery_qr_token && (maCourse.pickup_confirmed_at || ["colis_recupere", "en_livraison"].includes(maCourse.statut)) && !maCourse.delivery_confirmed_at && (
              <QRCodeDisplay course={maCourse} type="delivery" />
            )}
          </div>
        )}

        {/* Bouton partage WhatsApp destinataire — si expéditeur */}
        {maCourse.type_course === "expedier" && maCourse.destinataire_telephone && !["livree", "annulee"].includes(maCourse.statut) && (
          <Card className="p-4 bg-green-50 border-green-200">
            <p className="text-sm font-bold text-green-900 mb-3 flex items-center gap-2">
              <Share2 className="w-4 h-4" />
              Informer le destinataire
            </p>
            <p className="text-xs text-green-700 mb-3">
              Envoyez le lien de suivi à {maCourse.destinataire_nom || "votre destinataire"} pour qu'il puisse suivre la livraison.
            </p>
            <Button
              className="w-full bg-green-600 hover:bg-green-700 gap-2"
              onClick={() => openWhatsApp(maCourse.destinataire_telephone, buildWhatsAppMessage(maCourse))}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Envoyer le lien WhatsApp au destinataire
            </Button>
          </Card>
        )}

        {/* Timeline / Détails — Bug #4 : heure récupération manquante */}
        <Card className="p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Historique</p>
          <div className="space-y-2.5 text-sm">
            {maCourse.type_colis && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type de colis</span>
                <span className="font-medium capitalize">{maCourse.type_colis?.replace(/_/g, " ")}</span>
              </div>
            )}
            {maCourse.heure_acceptation && (
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-muted-foreground"><span className="text-green-500">✅</span> Acceptée à</span>
                <span className="font-semibold">{format(new Date(maCourse.heure_acceptation), "HH:mm", { locale: fr })}</span>
              </div>
            )}
            {maCourse.heure_recuperation && (
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-muted-foreground"><span className="text-blue-500">📦</span> Récupérée à</span>
                <span className="font-semibold">{format(new Date(maCourse.heure_recuperation), "HH:mm", { locale: fr })}</span>
              </div>
            )}
            {maCourse.heure_livraison && (
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-muted-foreground"><span className="text-green-600">🏁</span> Livrée à</span>
                <span className="font-semibold text-green-600">{format(new Date(maCourse.heure_livraison), "HH:mm", { locale: fr })}</span>
              </div>
            )}
            {maCourse.heure_livraison && maCourse.heure_acceptation && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">⏱ Durée totale</span>
                <span className="font-semibold">{Math.round((new Date(maCourse.heure_livraison) - new Date(maCourse.heure_acceptation)) / 60000)} min</span>
              </div>
            )}
            {maCourse.distance_reelle_km > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">📏 Distance réelle</span>
                <span className="font-semibold">{Number(maCourse.distance_reelle_km).toFixed(1)} km</span>
              </div>
            )}
            {maCourse.prix_estimate && !maCourse.prix_final && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prix estimé</span>
                <span className="font-medium">{maCourse.prix_estimate.toLocaleString()} {maCourse.devise || countries.find(c => c.code === maCourse.country_code)?.devise || "FCFA"}</span>
              </div>
            )}
            {maCourse.prix_final > 0 ? (
              <div className="flex justify-between pt-2 border-t">
                <span className="text-muted-foreground font-semibold">Prix final</span>
                <span className="font-bold text-lg text-primary">{maCourse.prix_final.toLocaleString()} {maCourse.devise || countries.find(c => c.code === maCourse.country_code)?.devise || "FCFA"}</span>
              </div>
            ) : null}
          </div>
        </Card>

        {/* Course terminée */}
        {maCourse.statut === "livree" && (() => {
          // Déterminer le rôle : client principal = celui qui a commandé
          // "expedier" → expéditeur est le client principal (note officielle)
          // "recevoir" → destinataire est le client principal (note officielle)
          const isClientPrincipal =
            (maCourse.type_course === "expedier" && (maCourse.expediteur_client_id === clientProfilId || maCourse.created_by_id === userId)) ||
            (maCourse.type_course === "recevoir" && (maCourse.destinataire_client_id === clientProfilId || maCourse.created_by_id === userId)) ||
            maCourse.created_by_id === userId; // fallback: créateur toujours client principal

          const isExpediteur = isClientPrincipal; // Note officielle = client principal
          const isDestinataire = !isClientPrincipal; // Feedback simple = autre partie

          return (
            <>
              {/* Résumé final livraison — bugs #3 #7 #8 */}
              <Card className="overflow-hidden border-2 border-green-300 shadow-lg">
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-3 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                  <p className="text-white font-bold">Livraison terminée avec succès !</p>
                </div>
                <div className="p-4 bg-green-50">
                  {/* 3 métriques toujours visibles — avec fallbacks */}
                  {(() => {
                    const countryDataFinal = countries.find(c => c.code === maCourse.country_code);
                    const tarifKmFinal = countryDataFinal?.prix_par_km || 100;
                    // Guard : éviter NaN si coordonnées GPS nulles (ex: destination_inconnue)
                    const haversineOrNull = (a, b, c, d) =>
                      (a != null && b != null && c != null && d != null && !isNaN(a) && !isNaN(b) && !isNaN(c) && !isNaN(d))
                        ? haversineKm(a, b, c, d) : null;
                    const distFinal = maCourse.distance_reelle_km > 0
                      ? maCourse.distance_reelle_km
                      : haversineOrNull(maCourse.latitude_recuperation, maCourse.longitude_recuperation, maCourse.latitude_livraison, maCourse.longitude_livraison);
                    // Règle obligatoire : minimum global SILGAPP = 1 000 FCFA
                    const prixBrutFinal = maCourse.prix_final > 0 ? maCourse.prix_final : (distFinal != null && distFinal > 0 ? Math.round(distFinal * tarifKmFinal) : null);
                    const prixFinal = prixBrutFinal > 0 ? Math.max(prixBrutFinal, 1000) : null;
                    const dureeMs = maCourse.heure_livraison && maCourse.heure_recuperation
                      ? new Date(maCourse.heure_livraison) - new Date(maCourse.heure_recuperation)
                      : maCourse.heure_livraison && maCourse.heure_acceptation
                        ? new Date(maCourse.heure_livraison) - new Date(maCourse.heure_acceptation)
                        : null;
                    const dureeMin = dureeMs ? Math.round(dureeMs / 60000) : distFinal ? Math.round((distFinal / 25) * 60) : null;
                    return (
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                          <Ruler className="w-4 h-4 mx-auto mb-1 text-blue-500" />
                          <p className="text-sm font-black text-gray-900">
                            {distFinal ? `${Number(distFinal).toFixed(1)} km` : "—"}
                          </p>
                          <p className="text-[9px] text-gray-400 font-semibold uppercase">Distance</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                          <Clock className="w-4 h-4 mx-auto mb-1 text-purple-500" />
                          <p className="text-sm font-black text-gray-900">
                            {dureeMin ? `${dureeMin} min` : "—"}
                          </p>
                          <p className="text-[9px] text-gray-400 font-semibold uppercase">Durée</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                          <Banknote className="w-4 h-4 mx-auto mb-1 text-green-600" />
                          <p className="text-sm font-black text-green-700">
                           {prixFinal > 0 ? `${prixFinal.toLocaleString()} ${maCourse.devise || countries.find(c => c.code === maCourse.country_code)?.devise || "F"}` : "—"}
                          </p>
                          <p className="text-[9px] text-gray-400 font-semibold uppercase">Prix final</p>
                        </div>
                      </div>
                    );
                  })()}
                  <p className="text-center text-xs text-green-700 font-medium">
                    Merci d'avoir utilisé SILGAPP 🙏
                  </p>
                </div>
              </Card>

              {/* ⭐ Note officielle expéditeur */}
              {isExpediteur && !maCourse.note_livreur && (
                <Card className="p-4 border-l-4 border-l-yellow-400 bg-gradient-to-r from-yellow-50 to-orange-50">
                  <p className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest mb-2">⭐ Note officielle · Expéditeur</p>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
                      <Star className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-yellow-900">Comment s'est passée votre livraison ?</p>
                      <p className="text-xs text-yellow-700 mt-1">Votre note impacte la réputation de {maCourse.livreur_nom || "le livreur"}</p>
                    </div>
                  </div>
                  <Button
                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-semibold"
                    onClick={() => setShowRating(true)}
                  >
                    <Star className="w-4 h-4 mr-2 fill-white" />
                    Donner ma note officielle
                  </Button>
                </Card>
              )}

              {isExpediteur && maCourse.note_livreur && (
                <Card className="p-4 border-l-4 border-l-green-500 bg-green-50">
                  <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-2">⭐ Note officielle · Expéditeur</p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-5 h-5 ${i < maCourse.note_livreur ? "fill-yellow-400 text-yellow-400" : "fill-gray-200 text-gray-300"}`} />
                      ))}
                    </div>
                    <p className="text-sm font-bold text-green-900">{maCourse.note_livreur}/5 — Merci !</p>
                  </div>
                </Card>
              )}

              {/* 👍/👎 Feedback destinataire */}
              {isDestinataire && (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">👍/👎 Votre avis sur la livraison</p>
                  <DestinataireReactionButton
                    course={maCourse}
                    onDone={() => navigate("/", { replace: true })}
                  />
                </div>
              )}
            </>
          );
        })()}

        {/* Prix manuel géré inline dans la carte statut ci-dessus — pas de modale flottante */}

        {showRating && (
          <LivreurRatingDialog
            course={maCourse}
            onClose={() => setShowRating(false)}
            onRated={handleRated}
          />
        )}

        <AnnulerCourseDialog
          course={maCourse}
          open={showAnnulerDialog}
          onClose={() => setShowAnnulerDialog(false)}
          onSuccess={() => navigate("/")}
          clientId={clientProfilId}
        />
        </>
        )} {/* fin onglet actives && maCourse */}
      </div>
    </div>
  );
}