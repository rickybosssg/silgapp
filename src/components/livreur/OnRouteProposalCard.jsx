import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Check, X, Clock, Navigation, Package, TrendingUp, MapPin } from "lucide-react";
import { toast } from "sonner";

/**
 * OnRouteProposalCard — Carte légère affichant une proposition "sur trajet"
 * à un livreur actuellement en livraison.
 *
 * Affiche :
 * - Point de récupération et destination
 * - Gain supplémentaire estimé en FCFA
 * - Détour estimé en kilomètres
 * - Temps restant avant expiration (countdown)
 * - Boutons Accepter / Refuser
 *
 * La proposition est facultative — le texte l'indique clairement.
 *
 * À l'acceptation :
 * - Appelle ecoOptimizationOrchestrator action respond_proposal
 * - Le backend vérifie l'identité, la disponibilité, l'attribution atomique
 * - Invalide les queries pour rafraîchir le dashboard
 *
 * Au refus :
 * - Marque la proposition comme refusée
 * - Ne modifie aucune course existante
 *
 * À l'expiration :
 * - Désactive les boutons automatiquement
 * - Le backend empêche toute acceptation tardive (vérification expires_at)
 */
export default function OnRouteProposalCard({ proposal, livreurProfil }) {
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
      } else if (res?.reason === "proposal_expired") {
        toast.error("Cette proposition a expiré.");
      } else if (res?.reason === "course_unavailable" || res?.reason === "course_race_lost") {
        toast.error("Cette course vient d'être prise par un autre livreur.");
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

  return (
    <div className={`overflow-hidden rounded-lg border shadow-[0_8px_22px_rgba(15,23,42,0.07)] transition-opacity ${
      isExpired ? "opacity-60 border-slate-200 bg-slate-50" : "border-blue-200 bg-white"
    }`}>
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
      <div className="p-4 space-y-3">
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

        {/* Infos : gain, détour, type colis */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {gainAmount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700">
              <TrendingUp className="h-3.5 w-3.5" />
              +{gainAmount.toLocaleString()} {proposal.devise || "FCFA"}
            </span>
          )}
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
      <div className="grid grid-cols-[1fr_52px] gap-2.5 border-t border-slate-100 bg-muted p-3">
        <button
          type="button"
          onClick={handleAccept}
          disabled={responding || isExpired}
          className="h-12 rounded-lg bg-primary text-sm font-bold text-white shadow-[0_6px_14px_rgba(0,122,255,0.2)] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {responding ? (
            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <>
              <Check className="h-5 w-5" />
              {isExpired ? "Expirée" : "Accepter"}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleRefuse}
          disabled={responding || isExpired}
          aria-label="Refuser cette proposition"
          title="Refuser"
          className="h-12 rounded-lg border border-slate-200 bg-white text-slate-500 transition-all active:scale-[0.96] disabled:opacity-40 flex items-center justify-center"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}