import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pause, Play, Rocket, Loader2 } from "lucide-react";
import { useMetaCampaignAction } from "@/hooks/useMetaAdsData";

export default function MetaAdsCampaignActions({ campaign, config, compact }) {
  const [confirmAction, setConfirmAction] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const mutation = useMetaCampaignAction();

  const killSwitchOn = config?.killSwitch;

  const handleConfirm = async () => {
    setProcessing(true);
    setError(null);
    try {
      await mutation.mutateAsync({ action: confirmAction, campaign_id: campaign.id });
      setConfirmAction(null);
    } catch (e) {
      setError(e.message || "Erreur lors de l'action");
    } finally {
      setProcessing(false);
    }
  };

  const canActivate = campaign.status === "approved" || campaign.status === "paused";
  const canPause = campaign.status === "active";
  const canResume = campaign.status === "paused" && campaign.meta_campaign_id;

  const buttons = [];

  if (canPause) {
    buttons.push(
      <Button key="pause" variant="outline" size="sm" className="h-8 text-xs" disabled={processing} onClick={() => setConfirmAction("pause_campaign")}>
        <Pause className="w-3 h-3 mr-1" /> Pause
      </Button>
    );
  }
  if (canResume) {
    buttons.push(
      <Button key="resume" variant="outline" size="sm" className="h-8 text-xs" disabled={processing || !killSwitchOn} onClick={() => setConfirmAction("resume_campaign")}>
        <Play className="w-3 h-3 mr-1" /> Reprendre
      </Button>
    );
  }
  if (canActivate && !campaign.meta_campaign_id) {
    buttons.push(
      <Button key="activate" size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700" disabled={processing || !killSwitchOn} onClick={() => setConfirmAction("activate_campaign")}>
        <Rocket className="w-3 h-3 mr-1" /> Lancer
      </Button>
    );
  }

  if (buttons.length === 0) {
    return <span className="text-[10px] text-slate-400">Aucune action disponible</span>;
  }

  return (
    <>
      <div className="flex items-center gap-1">{buttons}</div>
      {error && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
      <Dialog open={!!confirmAction} onOpenChange={(v) => !processing && setConfirmAction(v)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "activate_campaign" && "Lancer la campagne"}
              {confirmAction === "pause_campaign" && "Mettre en pause"}
              {confirmAction === "resume_campaign" && "Reprendre la diffusion"}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-slate-600 space-y-2">
            {confirmAction === "activate_campaign" && (
              <>
                <p>Vous êtes sur le point d'activer cette campagne.</p>
                <div className="bg-slate-50 rounded-lg p-2.5 space-y-1 text-xs">
                  <div><b>Budget max:</b> {campaign.daily_budget?.toLocaleString() || 1000} F CFA / jour</div>
                  <div><b>Zone:</b> Ouagadougou + 25km</div>
                  <div><b>Plateforme:</b> Facebook</div>
                  <div><b>Pays:</b> Burkina Faso</div>
                </div>
                <p className="text-amber-600 text-xs">⚠️ Cette action peut engager des dépenses réelles.</p>
              </>
            )}
            {confirmAction === "pause_campaign" && <p>La diffusion sera interrompue. Aucune dépense supplémentaire.</p>}
            {confirmAction === "resume_campaign" && <p>La diffusion reprendra. Des dépenses peuvent être engagées.</p>}
            {!killSwitchOn && (confirmAction === "activate_campaign" || confirmAction === "resume_campaign") && (
              <p className="text-red-500 text-xs">⚠️ Kill switch DÉSACTIVÉ (META_ACQUISITION_ENABLED = false). Action impossible.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={processing}>Annuler</Button>
            <Button
              onClick={handleConfirm}
              disabled={processing || (!killSwitchOn && (confirmAction === "activate_campaign" || confirmAction === "resume_campaign"))}
              className={confirmAction === "activate_campaign" || confirmAction === "resume_campaign" ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              {processing ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Traitement…</> : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}