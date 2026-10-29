import React, { useState, useEffect, useRef } from "react";
import { parcelProgressIndex } from '@/lib/parcelProgress';
import { reconcilePickupView, pickupDisplayStatus } from '@/lib/confirmedPickupView';
import { readConfirmedParcelPickup, recoverUncertainParcelPickup, pickupRead, pickupTransition, optionalPickupPosition } from '@/lib/pickupConfirmation';
import { MapPin, Phone, Navigation, Package, Check, X, AlertTriangle, ChevronRight, Clock, Ruler } from "lucide-react";
import MultiColisProgressBadge from "@/components/multi-colis/MultiColisProgressBadge";
import MultiColisLivreurView from "@/components/multi-colis/MultiColisLivreurView";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { confirmedDeliverySnapshot } from '@/lib/confirmedDelivery';
import { finaliserLivraisonSafe } from '@/lib/safeDeliveryFinalization';
import { deliveryRecapValues } from '@/lib/deliveryRecap';
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCourseLocationTarget } from "@/lib/courseLocationTarget";
import NavigationGPS from "./NavigationGPS";
import { normalizeCommissionPct, resolveStoredOrDynamicSplit, splitAmountByCommission } from "@/lib/commissionUtils";
import ChatWindow from "@/components/chat/ChatWindow";
import AnnulationExplicationChat from "./AnnulationExplicationChat";
import DriverWithdrawalDialog from "./DriverWithdrawalDialog";
import { getPrixAffichable, getDeviseAffichable } from "@/utils/getPrixAffichable";

import { getCourseContactForPhase, normalizePhoneForWhatsapp } from "@/lib/courseContact";
import { normalizeCourseFunctionResult } from "@/lib/courseFunctionResult";
import { haversineKm as haversine } from "@/lib/priceEstimate";

// [CORRECTION PIN/QR] Les PIN/QR sont supprimés de tous les parcours.
// Le parcours bouton (COLIS RÉCUPÉRÉ / COLIS LIVRÉ) est utilisé pour toutes les courses.

// Badge ETA affiché en haut de la carte, calculé depuis la position GPS réelle du livreur
function ETABadge({ course, colisRecupere }) {
  const [livreurPos, setLivreurPos] = useState(null);

  // CORRECTION : watchPosition créé UNE SEULE FOIS au mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setLivreurPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      null,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    console.log(`[ETABadge] Watch GPS démarré pour course ${course.id}`);
    return () => {
      navigator.geolocation.clearWatch(id);
      console.log(`[ETABadge] Watch GPS nettoyé pour course ${course.id}`);
    };
  }, [course.id]); // Dépend de course.id uniquement

  // Cible : vers la récupération si colis pas encore pris, sinon vers la livraison
  // Si destination inconnue → pas de cible GPS pour la livraison
  const targetLat = colisRecupere
    ? (course.destination_inconnue ? null : (course.gps_arrivee_lat || course.latitude_arrivee_livraison))
    : course.gps_depart_lat;
  const targetLng = colisRecupere
    ? (course.destination_inconnue ? null : (course.gps_arrivee_lng || course.longitude_arrivee_livraison))
    : course.gps_depart_lng;

  if (!livreurPos || !targetLat || !targetLng) return null;

  const dist = haversine(livreurPos.lat, livreurPos.lng, targetLat, targetLng);
  if (dist === null || dist < 0) return null;

  const etaMin = dist < 0.1 ? 1 : Math.round((dist / 25) * 60);
  const distLabel = dist < 0.1 ? `${Math.round(dist * 1000)} m` : dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`;

  return (
    <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-2.5">
      <div className="flex items-center gap-1.5">
        <Clock className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-bold text-blue-900">~ {etaMin} min</span>
      </div>
      <div className="w-px h-4 bg-blue-200" />
      <div className="flex items-center gap-1.5">
        <Ruler className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-semibold text-blue-700">{distLabel}</span>
      </div>
      <span className="ml-auto text-xs text-blue-500">{colisRecupere ? "→ Livraison" : "→ Récupération"}</span>
    </div>
  );
}

const STEPS = [
  { key: "acceptee", label: "Accepté", icon: "" },
  { key: "colis_recupere", label: "Récupérer", icon: "" },
  { key: "livree", label: "Livré", icon: "" },
];

const ADMIN_COLIS_STEPS = [
  { key: "acceptee", label: "Accepté", icon: "" },
  { key: "client_contacte", label: "Contacté", icon: "" },
  { key: "colis_recupere", label: "Récupérer", icon: "" },
  { key: "livree", label: "Livré", icon: "" },
];

const DEPLACEMENT_STEPS = [
  { key: "acceptee", label: "Accepté", icon: "" },
  { key: "pris_en_charge", label: "Pris en charge", icon: "" },
  { key: "arrivee", label: "Arrivée", icon: "" },
  { key: "termine", label: "Terminé", icon: "" },
];

function ProgressBar({ statut, isDeplacement, isAdminColis, contactedAt }) {
  const steps = isDeplacement ? DEPLACEMENT_STEPS : (isAdminColis ? ADMIN_COLIS_STEPS : STEPS);
  const idx = steps.findIndex(s => s.key === statut);
  const current = !isDeplacement && isAdminColis ? parcelProgressIndex(statut, contactedAt)
    : idx === -1 ? (isDeplacement && statut === 'livree' ? steps.length - 1 : (!isDeplacement && statut === 'en_livraison' ? 1 : 0)) : idx;

  return (
    <div className="flex items-center gap-1 py-1">
      {steps.map((step, i) => (
        <React.Fragment key={step.key}>
          <div className={cn(
            "flex flex-col items-center gap-1 flex-shrink-0",
          )}>
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all",
              i <= current ? "bg-primary text-white shadow-md shadow-primary/30" : "bg-gray-100 text-gray-600"
            )}>
              {i <= current ? step.icon : <span className="text-xs">{i + 1}</span>}
            </div>
            <p className={cn("text-[9px] font-semibold", i <= current ? "text-primary" : "text-gray-500")}>
              {step.label}
            </p>
          </div>
          {i < steps.length - 1 && (
            <div className={cn(
              "flex-1 h-0.5 rounded mb-4 transition-all",
              i < current ? "bg-primary" : "bg-gray-100"
            )} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

import { functionBody } from "@/lib/deliveryConfirmation";
import { captureDeliveryGps } from "@/lib/deliveryGps";

export default function CourseActiveCard({ course: incomingCourse, onColisRecupere, onColisLivre, onClientAnnule = undefined, onMettrePause = undefined, isPending, isExterne = false, livreurLat = undefined, livreurLng = undefined, livreurId = undefined, livreurNom = undefined, onDeliveryVictory = undefined }) {
  const [confirmedPickup, setConfirmedPickup] = useState(null);
  const course = reconcilePickupView(confirmedPickup, incomingCourse);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [prixReel, setPrixReel] = useState("");
  const [showPrixModal, setShowPrixModal] = useState(false);
  const [remarque, setRemarque] = useState("");
  const [showRemarque, setShowRemarque] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseMotif, setPauseMotif] = useState("");
  const [multiPickupPending, setMultiPickupPending] = useState(false);
  // ── Correction 1: état pour les boutons directs (nouveau parcours sans QR/PIN) ──
  const [pickupBoutonPending, setPickupBoutonPending] = useState(false);
  const [deliveryBoutonPending, setDeliveryBoutonPending] = useState(false);
  const transitionPendingRef = useRef(false);
  const deliveryConfirmationRef = useRef(false);
  const pickupConfirmationRef = useRef(false);
  const pickupGenerationRef = useRef(0);
  useEffect(() => {
    pickupGenerationRef.current++;
    pickupConfirmationRef.current = false;
    setPickupBoutonPending(false);
    return () => { pickupGenerationRef.current++; };
  }, [course.id]);
  // Optimistic status — overrides course.statut immediately on tap
  const [optimisticStatut, setOptimisticStatut] = useState(null);
  // Données de livraison en attente (admin_manuel : saisie montant après validation QR/PIN)
  const [pendingDeliveryData, setPendingDeliveryData] = useState(null);
  // Recap déplacement : affiché après saisie du prix, avant clic TERMINER
  const [deplacementRecap, setDeplacementRecap] = useState(null);
  // Annulation déplacement
  const [showAnnulerCourse, setShowAnnulerCourse] = useState(false);
  const [motifAnnulationLivreur, setMotifAnnulationLivreur] = useState("");
  const [motifAnnulationDetail, setMotifAnnulationDetail] = useState("");
  // Messagerie d'explication apres annulation
  const [showAnnulationChat, setShowAnnulationChat] = useState(false);

  // ── Pré-remplir le prix avec la proposition admin si disponible ──
  useEffect(() => {
    if (showPrixModal && (course.pricing_mode === "admin_manuel" || course.source === "admin") && course.prix_propose_admin) {
      setPrixReel(String(course.prix_propose_admin));
    }
  }, [showPrixModal, course.prix_propose_admin]);

  const effectiveStatut = pickupDisplayStatus(course, optimisticStatut);
  useEffect(() => { setOptimisticStatut(null); }, [course.id, course.statut]);
  const isDeplacement = course.type_course === "deplacement";
  const isPartnerCourse = !!(
    course.commande_boutique_id ||
    course.commande_restaurant_id ||
    course.pharmacie_id
  );
  // Match transitionStatutLivreur: client_contacte is reserved for admin parcels.
  const isAdminColisCourse = !isDeplacement && !isPartnerCourse &&
    (course.source === "admin" || course.pricing_mode === "admin_manuel");
  const isClientContactePhase = isAdminColisCourse && effectiveStatut === "livreur_en_route";
  const isEnRouteExpediteurPending = isAdminColisCourse && effectiveStatut === "client_contacte";
  const adminPreTrip = isClientContactePhase || isEnRouteExpediteurPending;
  const { data: countryCommissionRows = [] } = useQuery({
    queryKey: ["country-commission", course.country_code],
    queryFn: () => base44.entities.Country.filter({ code: course.country_code, actif: true }),
    enabled: !!course.country_code,
    staleTime: 30000,
  });
  const commissionPct = normalizeCommissionPct(countryCommissionRows?.[0]?.commission_pct);

  const getRequiredSplit = (montant) => {
    const split = splitAmountByCommission(montant, commissionPct);
    if (split.commission_silga === null || split.montant_livreur === null) {
      toast.error(`Commission non configurée pour le pays ${course.country_code || ""}`);
      return null;
    }
    return split;
  };

  // Displaying an existing delivery must never finalize or repair its accounting.

  // 🔄 Auto-transition : colis_recupere → en_livraison après 10 secondes
  useEffect(() => {
    if (course.statut !== "colis_recupere" || isDeplacement) return;
    const timer = setTimeout(() => {
      base44.functions.invoke("transitionStatutLivreur", {
        course_id: course.id,
        statut_cible: "en_livraison",
      }).then((rawRes) => {
          const res = normalizeCourseFunctionResult(rawRes);
        if (!res?.success && !res?.skipped) {
          setOptimisticStatut(null);
          toast.error(res?.error || "Transition automatique échouée. Réessayez.");
        } else {
          queryClient.invalidateQueries({ queryKey: ['mes-courses-externes'] });
        }
      }).catch(() => {
        setOptimisticStatut(null);
        toast.error("Erreur réseau lors de la transition automatique.");
      });
    }, 10000);
    return () => clearTimeout(timer);
  }, [course.statut, course.id, isDeplacement, isExterne]);

  const navigateToRecap = (courseData = {}) => {
    const courseId = courseData?.id || course.id;
    const recapCourse = {
      ...course,
      ...courseData,
      id: courseId,
      statut: "livree",
      heure_livraison: courseData?.heure_livraison || courseData?.colis_livre_at || course.heure_livraison || new Date().toISOString(),
    };

    try {
      sessionStorage.setItem(`silgapp_recap_course_${courseId}`, JSON.stringify(recapCourse));
    } catch (_) {}

    navigate(`/livreur/recap-course/${courseId}`, {
      replace: true,
      state: { course: recapCourse },
    });
  };

  // OPTIMISTIC UI helper for status updates
  const updateOptimisticStatut = (newStatut, courseData = {}) => {
    setOptimisticStatut(newStatut);
    queryClient.setQueryData(['mes-courses-externes'], (old) =>
      (old || []).map(c => c.id === course.id ? { ...c, statut: newStatut, ...courseData } : c)
    );
  };
  const colisRecupere = effectiveStatut === "colis_recupere" ||
    effectiveStatut === "en_livraison" ||
    (isDeplacement && ["passager_embarque", "pris_en_charge"].includes(effectiveStatut));
  const colisLivre = course.statut === "livree";

  const handleConfirmerLivraison = async () => {
    if (deliveryConfirmationRef.current) return;
    // DÉPLACEMENT : prix saisi → recap local → attendre TERMINER
    // IMPORTANT : garder statut "arrivee" (pas "livree") pour que syncStatutLivreurOnCourse
    // ne libère PAS le livreur automatiquement. Le livreur doit rester "en_course" jusqu'à TERMINER.
    if (isDeplacement) {
      const montant = parseFloat(prixReel);
      if (!prixReel || isNaN(montant) || montant <= 0) {
        toast.error("Entrez le montant reçu du client");
        return;
      }
      const split = getRequiredSplit(montant);
      if (!split) return;
      const mergedData = {
        ...(pendingDeliveryData || {}),
        prix_final: montant,
        commission_silga: split.commission_silga,
        montant_livreur: split.montant_livreur,
        commission_pct: split.commission_pct,
      };
      // Draft only: TERMINER is the single explicit finalization command.
      setDeplacementRecap(mergedData);
      setShowPrixModal(false);
      setPrixReel("");
      setPendingDeliveryData(null);
      return;
    }

    if (course.pricing_mode === "admin_manuel" || course.source === "admin") {
      // ── RÈGLE MÉTIER : prix_propose_admin est la source de vérité ──
      // Aucun fallback vers prixReel ou placeholder. Le livreur ne peut pas
      // remplacer ce prix.
      if (!course.prix_propose_admin || Number(course.prix_propose_admin) <= 0) {
        toast.error("Prix admin manquant — impossible de finaliser. Contactez le support.");
        return;
      }
      const montant = Number(course.prix_propose_admin);
      if (!montant || isNaN(montant) || montant <= 0) {
        toast.error("Prix admin invalide — contactez le support.");
        return;
      }
      deliveryConfirmationRef.current = true;
      setDeliveryBoutonPending(true);
      try {
        const confirmed = await onColisLivre(course, montant);
        if (!confirmed || confirmed.statut !== 'livree') throw new Error('Livraison non confirmée. Actualisez.');
        setPendingDeliveryData(null);
      } catch (error) {
        toast.error(error?.message || 'Impossible de confirmer la livraison. Réessayez.');
        return;
      } finally {
        deliveryConfirmationRef.current = false;
        setDeliveryBoutonPending(false);
      }
    } else if (isExterne) {
      try { await onColisLivre(course); } catch (error) {
        toast.error(error?.message || 'Livraison non confirmée.'); return;
      }
    } else {
      const montant = parseFloat(prixReel);
      if (!prixReel || isNaN(montant) || montant <= 0) {
        toast.error("Entrez le montant reçu du client");
        return;
      }
      try { await onColisLivre(course, montant); } catch (error) {
        toast.error(error?.message || 'Livraison non confirmée.'); return;
      }
    }
    setShowPrixModal(false);
    setPrixReel("");
  };

  const handleRemarque = () => {
    if (!remarque.trim()) return;
    // Utilise CourseExterne pour le réseau externe, Course pour l'interne
    base44.functions.invoke("transitionStatutLivreur", {
      course_id: course.id,
      remarque: remarque,
    }).catch(() => null);
    setRemarque("");
    setShowRemarque(false);
    toast.success("Remarque enregistrée");
  };

  const handlePauseSubmit = () => {
    if (!pauseMotif) {
      toast.error("Veuillez sélectionner un motif");
      return;
    }
    onMettrePause?.(course, pauseMotif);
    setShowPauseModal(false);
    setPauseMotif("");
  };

  // ── Workflow administratif : « Client contacté » puis « En route vers l'expéditeur » ──
  // ⚠️ Garde anti race-condition : ne pas mettre à jour si la course a été annulée
  //    ou si le livreur_id a été effacé (annulation concurrente).
  const handleClientContacte = async () => {
    if (course.statut === "en_attente" || course.statut === "annulee" || !course.livreur_id) {
      toast.error("Cette course n'est plus assignée.");
      return;
    }
    const now = new Date().toISOString();
    updateOptimisticStatut("client_contacte", { heure_contact_client: now });
    try {
      const rawRes = await base44.functions.invoke("transitionStatutLivreur", {
        course_id: course.id,
        statut_cible: "client_contacte",
      });
      const res = normalizeCourseFunctionResult(rawRes);
      if (!res?.success && !res?.skipped) {
        throw new Error(res?.error || "Erreur lors de la transition");
      }
      queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
      toast.success("Client contacté. Vous pouvez maintenant démarrer votre trajet.");
    } catch (err) {
      setOptimisticStatut(null);
      toast.error(err?.message || "Erreur réseau. Réessayez.");
    }
  };

  const handleDemarrerTrajet = async () => {
    if (course.statut === "en_attente" || course.statut === "annulee" || !course.livreur_id) {
      toast.error("Cette course n'est plus assignée.");
      return;
    }
    updateOptimisticStatut("en_route_expediteur", {});
    try {
      const rawRes = await base44.functions.invoke("transitionStatutLivreur", {
        course_id: course.id,
        statut_cible: "en_route_expediteur",
      });
      const res = normalizeCourseFunctionResult(rawRes);
      if (!res?.success && !res?.skipped) {
        throw new Error(res?.error || "Erreur lors de la transition");
      }
      queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
      toast.success("Bon trajet ! En route vers l'expéditeur.");
    } catch (err) {
      setOptimisticStatut(null);
      toast.error(err?.message || "Erreur réseau. Réessayez.");
    }
  };

  // Withdrawal uses the shared per-course dialog; it is not a delivery event.

  const handleMultiColisRecuperes = async () => {
    if (multiPickupPending) return;
    const now = new Date().toISOString();
    setMultiPickupPending(true);
    updateOptimisticStatut("colis_recupere", {
      heure_recuperation: now,
      pickup_confirmed_by: "livreur",
      pickup_confirmed_at: now,
    });

    try {
      const colis = await base44.entities.ColisExterne.filter({ course_id: course.id }, "numero_ordre", 50);
      await Promise.all((colis || [])
        .filter((item) => !["livre", "annule"].includes(item.statut))
        .map((item) => base44.entities.ColisExterne.update(item.id, {
          statut: "recupere",
          heure_recuperation: now,
        })));

      await base44.functions.invoke("transitionStatutLivreur", {
        course_id: course.id,
        statut_cible: "colis_recupere",
        confirmation_method: "bouton",
      });

      queryClient.invalidateQueries({ queryKey: ["colis-externes", course.id] });
      queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
      onColisRecupere({ ...course, statut: "colis_recupere", heure_recuperation: now });
      toast.success("Tous les colis sont recuperes");
    } catch (error) {
      console.error("Erreur recuperation multi-colis:", error);
      const errMsg = error?.data?.error || error?.message || "Erreur lors de la recuperation des colis";
      toast.error(errMsg);
      setOptimisticStatut(null);
    } finally {
      setMultiPickupPending(false);
    }
  };

  return (
    <>
      <DriverWithdrawalDialog open={showAnnulerCourse} course={course} onClose={() => setShowAnnulerCourse(false)} onWithdrawn={({motif, detail}) => {
        setMotifAnnulationLivreur(motif); setMotifAnnulationDetail(detail); setShowAnnulationChat(true);
      }} />

      {/* 💬 Messagerie d'explication après annulation */}
      {showAnnulationChat && (
        <AnnulationExplicationChat
          course={course}
          livreurId={livreurId}
          livreurNom={livreurNom}
          motif={motifAnnulationLivreur}
          motifDetail={motifAnnulationDetail.trim()}
          onClose={() => {
            setShowAnnulationChat(false);
            setMotifAnnulationLivreur("");
            setMotifAnnulationDetail("");
          }}
        />
      )}

      {/* Modal mise en pause */}
      {showPauseModal && !isExterne && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        >
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-3 text-3xl">
                ⏸
              </div>
              <p className="text-xl font-black text-gray-900">Mettre en pause</p>
              <p className="text-sm text-gray-500 mt-1">Pourquoi souhaitez-vous mettre cette course en pause ?</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "client_injoignable", label: "Client injoignable", icon: "" },
                { id: "client_absent", label: "Client absent", icon: "" },
                { id: "adresse_a_confirmer", label: "Adresse à confirmer", icon: "" },
                { id: "autre", label: "Autre", icon: "" },
              ].map((m) => (
                <button
                  key={m.id}
                  className={`h-20 rounded-2xl border-2 font-semibold text-sm transition-all flex flex-col items-center justify-center gap-1 ${
                    pauseMotif === m.id
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setPauseMotif(m.id)}
                >
                  <span className="text-xl">{m.icon}</span>
                  <span className="text-xs">{m.label}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                className="h-12 rounded-2xl border border-gray-200 text-gray-600 font-bold text-sm"
                onClick={() => { setShowPauseModal(false); setPauseMotif(""); }}
              >
                Annuler
              </button>
              <button
                className="h-12 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm disabled:opacity-50"
                onClick={handlePauseSubmit}
                disabled={!pauseMotif}
              >
                Mettre en pause
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal montant — pour l'interne, admin ET déplacement */}
      {showPrixModal && (!isExterne || course.pricing_mode === "admin_manuel" || course.source === "admin" || isDeplacement) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        >
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3 text-3xl">

              </div>
              <p className="text-xl font-black text-gray-900">
                {(course.pricing_mode === 'admin_manuel' || course.source === 'admin') && course.prix_propose_admin ? 'Confirmer la remise du colis ?' : 'Confirmer la livraison'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {(course.pricing_mode === "admin_manuel" || course.source === "admin")
                  ? (course.prix_propose_admin
                    ? "Montant fixé par l'admin — non modifiable"
                    : "Saisissez le montant payé par le client")
                  : "Quel montant avez-vous reçu du client ?"}
              </p>
            </div>
            {(course.pricing_mode === 'admin_manuel' || course.source === 'admin') && course.prix_propose_admin ? (
              <p className="text-center text-2xl font-black text-gray-900" data-testid="confirmed-delivery-amount">
                {Number(course.prix_propose_admin).toLocaleString('fr-FR')} {getDeviseAffichable(course)}
              </p>
            ) : <div className="relative">
              <Input
                type="number"
                placeholder="1 500"
                value={prixReel}
                onChange={(e) => setPrixReel(e.target.value)}
                className="text-center text-2xl font-black h-16 rounded-2xl border-2 border-gray-100 focus:border-primary pr-16"
                readOnly={!!((course.pricing_mode === "admin_manuel" || course.source === "admin") && course.prix_propose_admin)}
                autoFocus
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-600">FCFA</span>
            </div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                className="h-12 rounded-2xl border border-gray-200 text-gray-600 font-bold text-sm"
                onClick={() => setShowPrixModal(false)}
                disabled={deliveryBoutonPending}
              >
                Annuler
              </button>
              <button
                className="h-12 rounded-2xl bg-primary text-white font-black text-sm shadow-lg shadow-primary/20 disabled:opacity-50"
                onClick={handleConfirmerLivraison}
                disabled={isPending || deliveryBoutonPending}
              >
                Confirmer la livraison
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Carte principale */}
      <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100">
       {/* Header de la carte */}
       <div className="bg-gradient-to-r from-primary-dark to-primary px-5 py-3 flex items-center justify-between silgapp-relief-surface">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <p className="text-white text-sm font-bold">Course en cours</p>
            {course.is_multi_colis && (
              <span className="text-[10px] bg-purple-500 text-white px-2 py-0.5 rounded-full font-bold">
                {course.nb_colis} colis
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {course.is_multi_colis && (
              <MultiColisProgressBadge
                nbColis={course.nb_colis || 1}
                nbLivres={course.nb_colis_livres || 0}
                nbAnnules={course.nb_colis_annules || 0}
                size="sm"
              />
            )}
            <span className="text-white/50 text-xs">#{course.id?.slice(-6)}</span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Barre de progression */}
          <ProgressBar statut={course.statut} contactedAt={course.heure_contact_client} isDeplacement={isDeplacement} isAdminColis={isAdminColisCourse} />

          {/* Badge ETA temps réel */}
          {!colisLivre && !adminPreTrip && (
            <ETABadge course={course} colisRecupere={colisRecupere} />
          )}

          {/* Contact dynamique : source unique courseContact.js — expéditeur avant, destinataire après */}
          {(() => {
            const phase = colisRecupere ? "livraison" : "recuperation";
            const contact = getCourseContactForPhase(course, phase);
            const contactNom = contact.nom;
            const contactTel = contact.telephone;
            const contactRole = contact.role;

            // ── Courses admin : le clic sur Appeler/WhatsApp déclenche « Client contacté » ──
            const triggerClientContacte = async () => {
              if (!isClientContactePhase) return;
              const now = new Date().toISOString();
              updateOptimisticStatut("client_contacte", { heure_contact_client: now });
              try {
                const rawRes = await base44.functions.invoke("transitionStatutLivreur", {
                  course_id: course.id,
                  statut_cible: "client_contacte",
                });
                const res = normalizeCourseFunctionResult(rawRes);
                if (!res?.success && !res?.skipped) {
                  throw new Error(res?.error || "Erreur lors de la transition");
                }
                queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
                toast.success("Client contacté. N'oubliez pas de démarrer votre trajet.");
              } catch (err) {
                setOptimisticStatut(null);
                toast.error(err?.message || "Erreur réseau. Réessayez.");
              }
            };

            const handleWhatsApp = () => {
              triggerClientContacte();
              const num = normalizePhoneForWhatsapp(contactTel, course.country_code);
              const livreurNomFormate = livreurNom ? livreurNom.trim() : null;

              // ── Prix : source de vérité unique getPrixAffichable ──
              const prix = getPrixAffichable(course);
              const devise = getDeviseAffichable(course);
              const prixLabel = (course.prix_a_confirmer === true || !prix || !Number.isFinite(prix) || prix <= 0)
                ? "Le prix de la course vous sera confirmé par SILGAPP."
                : `Prix de la course : ${prix.toLocaleString()} ${devise}.`;
              const websiteSuffix = course.delivery_mode === "eco" ? "" : "\n\nDécouvrez notre site web :\nhttps://silgapp-vitrine.mythicteal5.chatgpt.site";

              const msg = encodeURIComponent(
                isDeplacement
                  ? `Bonjour, je suis votre chauffeur SILGAPP. Je suis en route pour vous prendre en charge. ${prixLabel}`
                  : colisRecupere
                    ? `Bonjour, je suis votre livreur SILGAPP. Je suis en route pour vous livrer votre colis. ${prixLabel}`
                    : (livreurNomFormate
                      ? `Bonjour, je suis ${livreurNomFormate}, votre livreur SILGAPP. Je suis en route pour récupérer votre colis. ${prixLabel} Merci de m'envoyer la localisation du lieu de récupération.${websiteSuffix}`
                      : `Bonjour, je suis votre livreur SILGAPP. Je suis en route pour récupérer votre colis. ${prixLabel} Merci de m'envoyer la localisation du lieu de récupération.${websiteSuffix}`)
              );
              const lien = `https://wa.me/${num}?text=${msg}`;
              const popup = window.open(lien, "_blank", "noopener,noreferrer");
              if (!popup || popup.closed || typeof popup.closed === "undefined") {
                window.location.href = lien;
              }
            };

            return (
              <div className={cn(
                "rounded-2xl p-3 transition-all",
                colisRecupere ? "bg-green-50 border border-green-200" : "bg-gray-50"
              )}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-gray-600 font-semibold uppercase">{contactRole}</p>
                    <p className="font-black text-gray-900 text-base truncate">{contactNom}</p>
                    <p className="text-xs text-gray-500 truncate">{contactTel || "—"}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <a href={`tel:${contactTel}`} className="flex flex-col items-center gap-0.5" onClick={triggerClientContacte}>
                      <div className={cn(
                        "w-12 h-12 rounded-2xl border-2 flex items-center justify-center shadow-sm",
                        "bg-blue-100 border-blue-300"
                      )}>
                        <Phone className="w-6 h-6 text-blue-700" />
                      </div>
                      <span className="text-[9px] font-bold text-blue-700">Appeler</span>
                    </a>
                    <button onClick={handleWhatsApp} className="flex flex-col items-center gap-0.5">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl border-2 flex items-center justify-center shadow-sm",
                        "bg-green-100 border-green-300"
                      )}>
                        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-green-700" xmlns="http://www.w3.org/2000/svg">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                      </div>
                      <span className="text-[9px] font-bold text-green-700">WhatsApp</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Trajet */}
          <div className="space-y-2">
            <div className={cn(
              "flex items-center gap-3 p-3 rounded-2xl transition-all",
              colisRecupere ? "bg-gray-50 opacity-60" : "bg-primary/5 border border-primary/20"
            )}>
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                colisRecupere ? "bg-gray-200" : "bg-primary/10"
              )}>
                <MapPin className={cn("w-4 h-4", colisRecupere ? "text-gray-600" : "text-primary")} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-600 font-semibold uppercase">Récupérer</p>
                <p className={cn("text-sm font-bold", colisRecupere ? "line-through text-gray-600" : "text-gray-800")}>
                  {course.adresse_depart}
                </p>
              </div>
              {/* Lien navigation statique supprimé — NavigationGPS gère la navigation avec GPS live */}
            </div>

            <div className="flex items-center gap-3 px-4">
              <div className="w-0.5 h-4 bg-gray-200 ml-4 rounded" />
            </div>

            <div className={cn(
              "flex items-center gap-3 p-3 rounded-2xl",
              colisRecupere ? "bg-green-50 border border-green-200" : "bg-gray-50"
            )}>
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                colisRecupere ? "bg-green-100" : "bg-gray-200"
              )}>
                <MapPin className={cn("w-4 h-4", colisRecupere ? "text-green-600" : "text-gray-600")} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-600 font-semibold uppercase">Livrer</p>
                <p className="text-sm font-bold text-gray-800">
                  {colisRecupere && course.destination_inconnue
                    ? " GPS du destinataire requis"
                    : course.adresse_arrivee || "Destination"}
                </p>
              </div>
            </div>
          </div>

          {/* Prix */}
          {isExterne ? (
            (() => {
              const isPrixManuel = course.pricing_mode === "manual" && course.manual_price_status === "accepted" && Number(course.manual_price) > 0;
              const prixBase = getPrixAffichable(course);

              if (prixBase <= 0) return null;


              return (
                <div className={cn(
                  "rounded-xl p-3 border",
                  isPrixManuel
                    ? "bg-green-50 border-green-200"
                    : "bg-blue-50 border-blue-200"
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn("text-xs font-semibold", isPrixManuel ? "text-green-700" : "text-blue-700")}>
                      Prix de la course :
                    </span>
                    <span className={cn("text-lg font-black", isPrixManuel ? "text-green-900" : "text-blue-900")}>
                      {prixBase.toLocaleString('fr-FR')} {getDeviseAffichable(course)}
                    </span>
                  </div>
                </div>
              );
            })()
          ) : (
            course.prix > 0 && (
              <div className="flex items-center justify-between px-1">
                <span className="text-gray-500 text-sm">Prix estimé</span>
                <span className="text-xl font-black text-gray-900">{course.prix.toLocaleString()} <span className="text-sm font-semibold text-gray-600">FCFA</span></span>
              </div>
            )
          )}

          {course.notes && (
            <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 p-3 rounded-2xl leading-relaxed">
               {course.notes}
            </p>
          )}

          {isPartnerCourse && colisRecupere && !colisLivre && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 space-y-1">
              <p className="text-sm font-black text-amber-800">Commande récupérée chez le partenaire</p>
              <p className="text-xs font-semibold text-amber-700">
                Étape suivante : se rendre chez le client puis confirmer la livraison.
              </p>
            </div>
          )}

          {/* Vue multi-colis livreur — remplace le bouton "Scanner pour livrer" côté externe */}
          {isExterne && course.is_multi_colis && colisRecupere && !colisLivre && (
            <MultiColisLivreurView
              course={course}
              colisRecupere={colisRecupere}
              onAllLivres={(courseData) => {
                onColisLivre({ ...course, ...(courseData || {}), statut: "livree" }, null);
                navigateToRecap(courseData);
              }}
            />
          )}

          {/* Navigation GPS — affiché si coordonnées GPS disponibles (masqué pendant le pré-trajet admin) */}
          {!colisLivre && !adminPreTrip && (
            !colisRecupere ? (
              // CORRECTION AUDIT : NavigationGPS relit le GPS de l'expéditeur toutes les 5s via ClientExterne
              // destLat/destLng sont les coords fixes enregistrées à la création (fallback)
              // Le GPS live de l'expéditeur est prioritaire si disponible
              <NavigationGPS
                key={`nav-recup-${course.id}`}
                phase="recuperation"
                destLat={course.gps_depart_lat}
                destLng={course.gps_depart_lng}
                destLabel={course.adresse_depart}
                destinataireTelephone={getCourseLocationTarget(course, "recuperation", getCourseContactForPhase(course, "recuperation").telephone).telephone}
                contactClientId={getCourseLocationTarget(course, "recuperation").clientId}
              />
            ) : (
              // CORRECTION AUDIT : NavigationGPS relit le GPS du destinataire toutes les 5s via ClientExterne
              // destLat/destLng sont les coords fixes enregistrées à la création (fallback)
              // Le GPS live du destinataire est prioritaire si disponible
              <NavigationGPS
                key={`nav-livraison-${course.id}`}
                phase="livraison"
                destLat={course.gps_arrivee_lat}
                destLng={course.gps_arrivee_lng}
                destLabel={course.adresse_arrivee}
                destinataireTelephone={getCourseLocationTarget(course, "livraison", getCourseContactForPhase(course, "livraison").telephone).telephone}
                contactClientId={getCourseLocationTarget(course, "livraison").clientId}
                destinationInconnue={!!course.destination_inconnue}
              />
            )
          )}

          {/* ── HANDLERS DÉPLACEMENT ── */}
          {(() => {
            if (!isDeplacement) return null;

            const deplacementStatut = effectiveStatut;
            const isPrisEnCharge = ["passager_embarque", "pris_en_charge"].includes(deplacementStatut);
            const isArrivee = deplacementStatut === "arrivee";
            const isTermine = deplacementStatut === "livree";

            const transitionDeplacement = async (target) => {
              if (transitionPendingRef.current) return;
              transitionPendingRef.current = true;
              try {
                const result = functionBody(await base44.functions.invoke("transitionStatutLivreur", {
                  course_id: course.id, statut_cible: target, ...await captureDeliveryGps(),
                }));
                if (!result?.success) throw new Error(result?.error || "Transition non confirmée");
                updateOptimisticStatut(target, result.course || { statut: target });
                queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
                if (target === "arrivee") setShowPrixModal(true);
                else toast.success("Passager pris en charge !");
              } catch (error) {
                toast.error(error?.message || "Confirmation indisponible. Actualisez avant de réessayer.");
                queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
              } finally {
                transitionPendingRef.current = false;
              }
            };
            const handlePriseEnCharge = () => transitionDeplacement("pris_en_charge");
            const handleArrivee = () => transitionDeplacement("arrivee");

            const handleTerminerDeplacement = () => {
              updateOptimisticStatut("livree", {
                heure_livraison: new Date().toISOString(),
              });
              navigateToRecap({
                statut: "livree",
                heure_livraison: new Date().toISOString(),
              });
              onColisLivre({ ...course, statut: "livree" }, null);
            };

            if (isTermine) return null;

            return (
              <div className="space-y-3 pt-1">
                {!isPrisEnCharge && !isArrivee && (
                  <button
                    className="w-full h-14 rounded-2xl bg-gradient-to-b from-cyan-500 to-cyan-700 text-white font-black text-base shadow-lg shadow-cyan-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    onClick={handlePriseEnCharge}
                    disabled={isPending}
                  >
                    <span className="text-xl"></span>
                    PRIS EN CHARGE
                  </button>
                )}

                {isPrisEnCharge && (
                  <button
                    className="w-full h-14 rounded-2xl bg-gradient-to-b from-amber-500 to-amber-700 text-white font-black text-base shadow-lg shadow-amber-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    onClick={handleArrivee}
                    disabled={isPending}
                  >
                    <MapPin className="w-6 h-6" />
                    ARRIVÉE
                  </button>
                )}

                {isArrivee && (
                  <button
                       className="w-full h-14 rounded-2xl bg-primary text-white font-black text-base shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                       onClick={() => setShowPrixModal(true)}
                       disabled={isPending}
                     >
                    <span className="text-xl"></span>
                    SAISIR LE PRIX DE LA COURSE
                  </button>
                )}

                {/* Bouton annulation — visible UNIQUEMENT avant prise en charge */}
                {!isPrisEnCharge && !isArrivee && !isTermine && (
                  <button
                    className="w-full h-11 rounded-2xl border border-red-200 text-red-500 font-semibold text-sm flex items-center justify-center gap-2 active:bg-red-50 transition-colors disabled:opacity-50"
                    onClick={() => setShowAnnulerCourse(true)}
                    disabled={isPending}
                  >
                    <X className="w-4 h-4" /> Se retirer de cette course
                  </button>
                )}
              </div>
            );
          })()}

          {/* Boutons d'action — COLIS */}
          {!isDeplacement && !colisLivre && (
            <div className="space-y-3 pt-1">

              {/* Bouton annulation livreur — visible UNIQUEMENT avant récupération */}
              {!colisRecupere && (
                <button
                  className="w-full h-11 rounded-2xl border border-red-200 text-red-500 font-semibold text-sm flex items-center justify-center gap-2 active:bg-red-50 transition-colors disabled:opacity-50"
                  onClick={() => setShowAnnulerCourse(true)}
                  disabled={isPending}
                >
                  <X className="w-4 h-4" /> Se retirer de cette course
                </button>
              )}

              {!colisRecupere ? (
                adminPreTrip ? (
                  /* ── COURSE ADMINISTRATIVE : « Client contacté » puis « En route vers l'expéditeur » ── */
                  <div className="space-y-3">
                    {isEnRouteExpediteurPending && (
                      <button
                        className="w-full h-14 rounded-2xl bg-gradient-to-b from-amber-500 to-amber-600 text-white font-black text-base shadow-lg shadow-amber-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                        onClick={handleDemarrerTrajet}
                        disabled={isPending}
                      >
                        <Navigation className="w-6 h-6" />
                        En route vers l'expéditeur
                      </button>
                    )}
                  </div>
                ) : isExterne && !course.is_multi_colis ? (
                   /* ── EXTERNE : bouton direct COLIS RÉCUPÉRÉ (parcours bouton) ── */
                  <button
                    className="w-full h-14 rounded-2xl bg-gradient-to-b from-amber-500 to-amber-600 text-white font-black text-base shadow-lg shadow-amber-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    onClick={async () => {
                      if (pickupConfirmationRef.current || pickupBoutonPending) return;
                      pickupConfirmationRef.current = true;
                      const generation = pickupGenerationRef.current;
                      setPickupBoutonPending(true);
                      const invokeTransition = async (lat, lng) => {
                        if (generation !== pickupGenerationRef.current) return;
                        try {
                          let saved;
                          let rawRes;
                          const before = await pickupRead(base44, course.id);
                          if (generation !== pickupGenerationRef.current) return;
                          if (before.heure_recuperation || before.pickup_confirmed_at) {
                            saved = await readConfirmedParcelPickup(base44, course.id, { success: true, course: before });
                          } else if (['annulee', 'livree', 'terminee'].includes(before.statut) || before.annulation_user_id) {
                            throw new Error('Cette course ne permet plus de confirmer une récupération. Actualisez.');
                          }
                          if (!saved) {
                          try {
                          rawRes = await pickupTransition(base44, {
                            course_id: course.id, statut_cible: 'colis_recupere', confirmation_method: 'bouton',
                            ...(Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : {}),
                          });
                          } catch (error) {
                            saved = await recoverUncertainParcelPickup(base44, course.id, error);
                          }
                          }
                          if (!saved) {
                            const res = normalizeCourseFunctionResult(rawRes);
                            saved = await readConfirmedParcelPickup(base44, course.id, res);
                          }
                          if (generation !== pickupGenerationRef.current) return;
                            setConfirmedPickup(saved);
                            setOptimisticStatut(null);
                            await queryClient.cancelQueries({ queryKey: ["mes-courses-externes"] });
                            if (generation !== pickupGenerationRef.current) return;
                            queryClient.setQueriesData({ queryKey: ["mes-courses-externes"] }, old =>
                              Array.isArray(old) ? old.map(row => row.id === saved.id ? reconcilePickupView(row, saved) : row) : old);
                            queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
                            onColisRecupere(saved);
                            toast.success("Colis récupéré avec succès !");
                        } catch (err) {
                        if (generation !== pickupGenerationRef.current) return;
                        setOptimisticStatut(null);
                        const errMsg = err?.data?.error || err?.message || "Erreur lors de la récupération. Réessayez.";
                        toast.error(errMsg);
                        } finally {
                        if (generation === pickupGenerationRef.current) {
                        pickupConfirmationRef.current = false;
                        setPickupBoutonPending(false);
                        }
                        }
                      };
                      // GPS optionnel — ne pas bloquer la récupération si indisponible
                      const position = await optionalPickupPosition(navigator.geolocation);
                      await invokeTransition(position?.latitude, position?.longitude);
                    }}
                    disabled={isPending || pickupBoutonPending}
                  >
                    {pickupBoutonPending ? (
                      <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    ) : (
                      <>
                        <Package className="w-6 h-6" />
                        Colis récupéré
                        <ChevronRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                ) : isExterne && course.is_multi_colis ? (
                  <button
                    className="w-full h-14 rounded-2xl bg-gradient-to-b from-amber-500 to-amber-600 text-white font-black text-base shadow-lg shadow-amber-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    onClick={handleMultiColisRecuperes}
                    disabled={isPending || multiPickupPending}
                  >
                    <Package className="w-6 h-6" />
                     Colis récupérés ({course.nb_colis} colis)
                  </button>
                ) : (
                  /* ── INTERNE : bouton classique ── */
                  <button
                    className="w-full h-14 rounded-2xl bg-gradient-to-b from-amber-500 to-amber-600 text-white font-black text-base shadow-lg shadow-amber-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    onClick={async () => {
                      const now = new Date().toISOString();
                      updateOptimisticStatut("colis_recupere", { heure_recuperation: now });
                      try {
                        const rawRes = await base44.functions.invoke("transitionStatutLivreur", {
                          course_id: course.id,
                          statut_cible: "colis_recupere",
                          confirmation_method: "bouton",
                        });
                        const res = normalizeCourseFunctionResult(rawRes);
                        if (!res?.success && !res?.skipped) {
                          throw new Error(res?.error || "Erreur lors de la récupération");
                        }
                        queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
                        onColisRecupere({ ...course, statut: "colis_recupere", heure_recuperation: now });
                        toast.success("Colis récupéré avec succès !");
                      } catch (err) {
                        setOptimisticStatut(null);
                        const errMsg = err?.data?.error || err?.message || "Erreur réseau. Réessayez.";
                        toast.error(errMsg);
                      }
                    }}
                    disabled={isPending}
                  >
                    <Package className="w-6 h-6" />
                    Colis récupéré
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )
              ) : (
                isExterne ? (
                  /* ── EXTERNE multi-colis : géré par MultiColisLivreurView ci-dessus ── */
                  course.is_multi_colis ? null : (
                      /* ── EXTERNE : bouton direct COLIS LIVRÉ (parcours bouton) ── */
                      <button
                        className="w-full h-14 rounded-2xl bg-primary text-white font-black text-base shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                        onClick={async () => {
                          if (deliveryConfirmationRef.current || deliveryBoutonPending) return;
                          // Admin : ouvrir la modale de prix (comme avant)
                          if (course.pricing_mode === "admin_manuel" || course.source === "admin") {
                            setPendingDeliveryData({});
                            setShowPrixModal(true);
                            return;
                          }
                          setDeliveryBoutonPending(true);
                          deliveryConfirmationRef.current = true;
                          try {
                            const rawRes = await finaliserLivraisonSafe(base44, {
                              course_id: course.id,
                            });
                            const res = normalizeCourseFunctionResult(rawRes);
                            if (res?.success || res?.skipped) {
                              queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
                              queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
                              const confirmed = confirmedDeliverySnapshot(course, res);
                              await onColisLivre(confirmed, null, { confirmedResult: res });
                              onDeliveryVictory?.(course.id);
                            } else {
                              throw new Error(res?.error || "Erreur finalisation");
                            }
                          } catch (err) {
                            // Erreur — rester sur la course, permettre retry
                            setOptimisticStatut(null);
                            toast.error(err?.message || "Erreur lors de la finalisation. Réessayez.");
                          } finally {
                            deliveryConfirmationRef.current = false;
                            setDeliveryBoutonPending(false);
                          }
                        }}
                        disabled={isPending || deliveryBoutonPending}
                      >
                        {deliveryBoutonPending ? (
                          <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        ) : (
                          <>
                            <Check className="w-6 h-6" />
                            Colis livré
                            <ChevronRight className="w-5 h-5" />
                          </>
                        )}
                      </button>
                  )
                ) : (
                  /* ── INTERNE : bouton classique avec GPS + récapitulatif ── */
                  <button
                    className="w-full h-14 rounded-2xl bg-primary text-white font-black text-base shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    onClick={() => {
                      navigator.geolocation.getCurrentPosition(
                        () => setShowPrixModal(true),
                        () => setShowPrixModal(true),
                        { enableHighAccuracy: true, timeout: 5000 }
                      );
                    }}
                    disabled={isPending}
                  >
                    <Check className="w-6 h-6" />
                    Colis livré
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )
              )}

              {/* Bouton annulation client — uniquement pour l'interne */}
              {!isExterne && (
                <button
                  className="w-full h-11 rounded-2xl border border-red-200 text-red-500 font-semibold text-sm flex items-center justify-center gap-2 active:bg-red-50 transition-colors disabled:opacity-50"
                  onClick={() => onClientAnnule?.(course)}
                  disabled={isPending}
                >
                  <X className="w-4 h-4" /> Le client a annulé
                </button>
              )}

              {/* Bouton mettre en pause — uniquement pour l'interne */}
              {!isExterne && (
                <button
                  className="w-full h-11 rounded-2xl border border-amber-200 text-amber-600 font-semibold text-sm flex items-center justify-center gap-2 active:bg-amber-50 transition-colors disabled:opacity-50"
                  onClick={() => setShowPauseModal(true)}
                  disabled={isPending}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                  Mettre en pause
                </button>
              )}

              {!showRemarque ? (
                <button
                  className="w-full text-xs text-gray-600 flex items-center justify-center gap-1.5 py-1 hover:text-gray-600 transition-colors"
                  onClick={() => setShowRemarque(true)}
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Signaler un problème
                </button>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Décrivez le problème..."
                    value={remarque}
                    onChange={(e) => setRemarque(e.target.value)}
                    className="text-sm rounded-2xl border-gray-200 min-h-[70px]"
                  />
                  <div className="flex gap-2">
                    <button className="flex-1 h-10 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold" onClick={() => setShowRemarque(false)}>Annuler</button>
                    <button className="flex-1 h-10 rounded-xl bg-gray-800 text-white text-sm font-semibold" onClick={handleRemarque}>Envoyer</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Correction 1: indicateur PIN secours supprimé du nouveau parcours ── */}

          {/* RÉCAPITULATIF DÉPLACEMENT — avant clic TERMINER */}
          {deplacementRecap && (
            <div className="py-4 bg-blue-50 rounded-2xl border-2 border-blue-300 space-y-3 px-4">
              <div className="text-center">
                <p className="text-2xl mb-1"></p>
                <p className="font-black text-blue-800 text-base">Récapitulatif — Se déplacer</p>
                <p className="text-xs text-blue-600 mt-0.5">Vérifiez avant de terminer</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white rounded-xl p-2.5 border border-blue-100">
                  <p className="text-[10px] text-gray-600 font-semibold uppercase">Départ</p>
                  <p className="text-xs font-bold text-gray-800 truncate">{course.adresse_depart || "—"}</p>
                </div>
                <div className="bg-white rounded-xl p-2.5 border border-blue-100">
                  <p className="text-[10px] text-gray-600 font-semibold uppercase">Arrivée</p>
                  <p className="text-xs font-bold text-gray-800 truncate">{course.adresse_arrivee || "—"}</p>
                </div>
                <div className="bg-white rounded-xl p-2.5 border border-blue-100">
                  <p className="text-[10px] text-gray-600 font-semibold uppercase">Passager</p>
                  <p className="text-xs font-bold text-gray-800">{course.passager_nom || course.client_nom || "—"}</p>
                </div>
                <div className="bg-white rounded-xl p-2.5 border border-blue-100">
                  <p className="text-[10px] text-gray-600 font-semibold uppercase">Distance</p>
                  <p className="text-xs font-bold text-gray-800">
                    {course.distance_reelle_km ? `${Number(course.distance_reelle_km).toFixed(1)} km` : "—"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white rounded-xl p-2.5 text-center border border-blue-100">
                  <p className="text-[10px] text-gray-600 font-semibold uppercase">Montant</p>
                  <p className="text-sm font-black text-blue-700">
                    {Number(deplacementRecap.prix_final || 0).toLocaleString()} {course.devise || "F"}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-2.5 text-center border border-gray-100">
                  <p className="text-[10px] text-gray-600 font-semibold uppercase">Commission</p>
                  <p className="text-sm font-black text-gray-500">
                    {Number(deplacementRecap.commission_silga || 0).toLocaleString()} {course.devise || "F"}
                  </p>
                </div>
              </div>
              <button
                className="w-full h-14 rounded-2xl bg-primary text-white font-black text-base shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                onClick={async () => {
                  if (deliveryConfirmationRef.current) return;
                  deliveryConfirmationRef.current = true;
                  setDeliveryBoutonPending(true);
                  try {
                    const receipt = await finaliserLivraisonSafe(base44, {
                      course_id: course.id,
                      prix_final_livreur: deplacementRecap.prix_final,
                    });
                    const finalData = confirmedDeliverySnapshot(course, receipt);
                    await onColisLivre(finalData, null, { confirmedResult: receipt });
                    queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
                    setDeplacementRecap(null);
                  } catch (error) {
                    toast.error(error?.message || 'Livraison non confirmée.');
                  } finally {
                    deliveryConfirmationRef.current = false;
                    setDeliveryBoutonPending(false);
                  }
                }}
                disabled={deliveryBoutonPending}
              >
                <Check className="w-6 h-6" />
                TERMINER
              </button>
            </div>
          )}

          {/* Messagerie livreur-client-admin */}
          {!colisLivre && livreurId && (
            <div className="pt-2">
              <ChatWindow
                courseId={course.id}
                senderType="livreur"
                senderId={livreurId}
                senderName={livreurNom || course.livreur_nom || "Livreur"}
              />
            </div>
          )}

          {!isDeplacement && colisLivre && (() => {
            const isMulti = isExterne && course.is_multi_colis && (course.nb_colis || 1) > 1;

            // Multi-colis : totaux issus des montants par colis (pas de tarification auto)
            if (isMulti) {
              const total = Number(course.prix_final) || 0;
              const split = resolveStoredOrDynamicSplit(course, total, commissionPct);
              const gain = split.montant_livreur;
              const commission = split.commission_silga;
              return (
                <div className="py-4 bg-green-50 rounded-2xl border border-green-200 space-y-3 px-4">
                  <div className="text-center">
                    <p className="text-2xl mb-1"></p>
                    <p className="font-black text-green-700 text-base">Tournée terminée !</p>
                    <p className="text-xs text-green-600 mt-0.5">{course.nb_colis} colis livrés</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white rounded-xl p-2.5 text-center border border-green-100">
                      <p className="text-[10px] text-gray-600 font-semibold uppercase">Total</p>
                      <p className="text-sm font-black text-gray-800">{total.toLocaleString()} {course.devise || "F"}</p>
                    </div>
                    <div className="bg-white rounded-xl p-2.5 text-center border border-gray-100">
                      <p className="text-[10px] text-gray-600 font-semibold uppercase">Commission</p>
                      <p className="text-sm font-black text-gray-500">{commission !== null ? `${commission.toLocaleString()} ${course.devise || "F"}` : "—"}</p>
                    </div>
                  </div>
                </div>
              );
            }

            // Colis unique : logique existante inchangée
            const isPrixManuel = course.pricing_mode === "manual" && course.manual_price_status === "accepted" && Number(course.manual_price) > 0;
            const dist = Number(course.distance_reelle_km) > 0 ? Number(course.distance_reelle_km) : null;
            const stored = deliveryRecapValues(course);
            const prix = stored.price;
            const split = { montant_livreur: stored.driver, commission_silga: stored.commission };
            const gain = split.montant_livreur;
            const commission = split.commission_silga;
            return (
              <div className="py-4 bg-green-50 rounded-2xl border border-green-200 space-y-3 px-4">
                <div className="text-center">
                  <p className="text-2xl mb-1"></p>
                  <p className="font-black text-green-700 text-base">Course terminée !</p>
                </div>
                {isExterne ? (
                  <div className="grid grid-cols-2 gap-2">
                    {dist !== null && (
                      <div className="bg-white rounded-xl p-2.5 text-center border border-green-100">
                        <p className="text-[10px] text-gray-600 font-semibold uppercase">Distance</p>
                        <p className="text-sm font-black text-gray-800">{dist.toFixed(1)} km</p>
                      </div>
                    )}
                    <div className="bg-white rounded-xl p-2.5 text-center border border-green-100">
                      <p className="text-[10px] text-gray-600 font-semibold uppercase">
                        Prix final {isPrixManuel && ""}
                      </p>
                      <p className="text-sm font-black text-blue-700">
                        {prix !== null ? `${prix.toLocaleString()} ${course.devise || "F"}` : "—"}
                      </p>
                      {isPrixManuel && (
                        <p className="text-[9px] text-green-600 font-semibold mt-0.5">Prix convenu</p>
                      )}
                    </div>
                  </div>
                ) : (
                  course.prix_reel && (
                    <p className="text-center text-green-600 text-sm font-semibold">
                      {course.prix_reel.toLocaleString()} FCFA encaissés
                    </p>
                  )
                )}
                {isExterne && commission !== null && (
                  <p className="text-center text-xs text-gray-600">
                    Commission SILGAPP : {commission.toLocaleString()} {course.devise || "F"}
                  </p>
                )}
                {/* Correction 3: bouton "Terminer" supprimé — retour automatique après Victory Overlay */}
              </div>
            );
          })()}
        </div>
      </div>
    </>
  );
}
