import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Check, X, Clock, Navigation, Package, TrendingUp } from "lucide-react";
import { toast } from "sonner";

/**
 * OnRouteProposalCard — Modale non-bloquante affichant une proposition
 * "sur trajet" à un livreur actuellement en livraison.
 *
 * Affiche :
 * - Point de récupération et destination
 * - Prix proposé
 * - Gain supplémentaire estimé après commission
 * - Détour estimé en kilomètres
 * - Temps restant avant expiration (countdown)
 * - Boutons Accepter / Refuser
 *
 * La modale est facultative — un backdrop semi-transparent permet de
 * la fermer sans accepter ni refuser (onDismiss).
 *
 * À l'acceptation :
 * - Appelle ecoOptimizationOrchestrator action respond_proposal
 * - Le backend vérifie l'identité, la disponibilité, l'attribution atomique
 * - Crée une EcoMission multi-livraisons (dashboard multi-livraisons)
 *
 * Au refus :
 * - Marque la proposition comme refusée
 * - La course reste disponible pour les autres livreurs (Standard) ou
 *   conserve ses règles Éco (Eco)
 *
 * À l'expiration :
 * - Désactive les boutons automatiquement
 * - Le backend empêche toute acceptation tardive (vérification expires_at)
 */
export default function OnRouteProposalCard({ proposal, livreurProfil, onDismiss }) {
  const queryClient = useQueryClient();
  const [responding, setResponding] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(proposal?.seconds_remaining || 0);

  // ── Countdown timer ──
  useEffect(() => {
    if (!proposal?.seconds_remaining) return;
    setSecondsRemaining(proposal.seconds_remaining);

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [proposal?.proposal_id, proposal?.seconds_remaining]);

  const isExpired = secondsRemaining <= 0;

  // ── Formatage du temps restant ──
  const timeLabel = useMemo(() => {
    if (isExpired) return "Expirée";
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }, [secondsRemaining, isExpired]);

  // ── Accepter la proposition ──
  const handleAccept = async () => {
    if (!proposal?.proposal_id || !livreurProfil?.id) return;
    if (responding || isExpired) return;
    setResponding(true);
    try {
      const res = await base44.functions.invoke("ecoOptimizationOrchestrator", {
        action: "respond_proposal",
        proposal_id: proposal.proposal_id,
        livreur_id: livreurProfil.id,
        response: "accept",
      });
      if (res?.success && res?.accepted) {
        toast.success("Livraison supplémentaire acceptée !");
        queryClient.invalidateQueries({ queryKey: ["on-route-proposals"] });
        queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
        queryClient.invalidateQueries({ queryKey: ["courses-externes-disponibles"] });
        queryClient.invalidateQueries({ queryKey: ["eco-mission-active"] });
        onDismiss?.();
      } else if (res?.reason === "proposal_expired") {
        toast.error("Cette proposition a expiré.");
      } else if (res?.reason === "course_unavailable" || res?.reason === "course_race_lost") {
        toast.error("Cette course vient d'être prise par un autre livreur.");
        queryClient.invalidateQueries({ queryKey: ["on-route-proposals"] });
      } else if (res?.reason === "identity_mismatch") {
        toast.error("Vérification d'identité échouée. Veuillez rouvrir l'application.");
      } else if (res?.reason === "livreur_indisponible") {
        toast.error("Vous n'êtes plus éligible pour accepter cette course.");
      } else if (res?.reason === "proposal_owner_mismatch") {
        toast.error("Cette proposition ne vous appartient pas.");
      } else {
        toast.error(res?.error || res?.reason || "Erreur lors de l'acceptation");
      }
    } catch {
      toast.error("Erreur réseau lors de l'acceptation");
    } finally {
      setResponding(false);
    }
  };

  // ── Refuser la proposition ──
  const handleRefuse = async () => {
    if (!proposal?.proposal_id || !livreurProfil?.id) return;
    if (responding) return;
    setResponding(true);
    try {
      const res = await base44.functions.invoke("ecoOptimizationOrchestrator", {
        action: "respond_proposal",
        proposal_id: proposal.proposal_id,
        livreur_id: livreurProfil.id,
        response: "refuse",
      });
      if (res?.success) {
        toast.info("Proposition refusée");
        queryClient.invalidateQueries({ queryKey: ["on-route-proposals"] });
        onDismiss?.();
      } else {
        toast.error(res?.error || "Erreur lors du refus");
      }
    } catch {
      toast.error("Erreur réseau lors du refus");
    } finally {
      setResponding(false);
    }
  };

  if (!proposal) return null;

  const gainAmount = Number(proposal.gain_amount || 0);
  const extraKm = Number(proposal.extra_km_estimate || 0);
  const prix = Number(proposal.prix || 0);

  return (
    <>
      {/* ── Backdrop semi-transparent (non bloquant — tap pour fermer) ── */}
      <div
        className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm"
        onClick={onDismiss}
      />

      {/* ── Bottom sheet : proposition ── */}
      <div className="fixed bottom-0 left-0 right-0 z-[81] flex justify-center">
        <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl overflow-hidden animate-slideUp">
          {/* Handle de glissement visuel */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1.5 rounded-full bg-slate-300" />
          </div>

          {/* ── Header ── */}
          <div className={`px-4 py-2.5 flex items-center justify-between gap-2 ${isExpired ? "bg-slate-100" : "bg-blue-50"}`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <TrendingUp className={`h-3.5 w-3.5 shrink-0 ${isExpired ? "text-slate-400" : "text-blue-600"}`} />
              <span className={`text-[11px] font-bold uppercase truncate ${isExpired ? "text-slate-400" : "text-blue-700"}`}>
                {isExpired ? "Proposition expirée" : "Livraison sur votre trajet"}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Clock className={`h-3 w-3 ${isExpired ? "text-slate-400" : "text-orange-500"}`} />
              <span className={`text-xs font-bold tabular-nums ${isExpired ? "text-slate-400" : secondsRemaining < 60 ? "text-red-500" : "text-slate-600"}`}>
                {timeLabel}
              </span>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
            {/* Prix proposé + gain */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Prix proposé</p>
                <p className="text-xl font-black text-foreground">{prix.toLocaleString()}</p>
                <p className="text-[10px] font-bold text-slate-500">{proposal.devise || "FCFA"}</p>
              </div>
              {gainAmount > 0 && (
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase text-green-600">Gain supplémentaire</p>
                  <p className="text-xl font-black text-green-600">+{gainAmount.toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-green-600">{proposal.devise || "FCFA"}</p>
                </div>
              )}
            </div>

            {/* Récupération → Destination */}
            <div className="grid grid-cols-[22px_1fr] gap-x-2.5">
              <div className="flex flex-col items-center pt-1">
                <span className="h-3 w-3 rounded-full border-[3px] border-success bg-white" />
                <span className="my-1 min-h-6 w-px flex-1 bg-slate-200" />
                <span className="h-3 w-3 rounded-[3px] bg-blue-500" />
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Récupération</p>
                  <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">
                    {proposal.quartier_depart || proposal.adresse_depart || "Adresse à confirmer"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Livraison</p>
                  <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">
                    {proposal.quartier_arrivee || proposal.adresse_arrivee || "Adresse à confirmer"}
                  </p>
                </div>
              </div>
            </div>

            {/* Infos : détour, type colis */}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              {extraKm > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600">
                  <Navigation className="h-3.5 w-3.5" />
                  +{extraKm.toFixed(1)} km détour
                </span>
              )}
              {proposal.type_colis && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                  <Package className="h-3.5 w-3.5" />
                  {proposal.type_colis.replace("_", " ")}
                </span>
              )}
            </div>

            {/* Note : facultative */}
            <p className="text-[11px] text-slate-400 leading-tight">
              Cette livraison est facultative. Acceptez-la uniquement si elle s'intègre dans votre trajet actuel.
            </p>
          </div>

          {/* ── Actions ── */}
          <div className="grid grid-cols-[1fr_1fr_48px] gap-2 border-t border-slate-100 bg-slate-50 p-3 safe-area-bottom">
            <button
              type="button"
              onClick={handleAccept}
              disabled={responding || isExpired}
              className="h-12 rounded-xl bg-primary text-sm font-bold text-white shadow-[0_6px_14px_rgba(0,122,255,0.2)] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {responding ? (
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <>
                  <Check className="h-5 w-5" />
                  Accepter
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleRefuse}
              disabled={responding || isExpired}
              className="h-12 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-bold transition-all active:scale-[0.96] disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <X className="h-4 w-4" />
              Refuser
            </button>
            <button
              type="button"
              onClick={onDismiss}
              disabled={responding}
              aria-label="Fermer"
              title="Fermer"
              className="h-12 rounded-xl bg-slate-200 text-slate-500 transition-all active:scale-[0.96] disabled:opacity-40 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}