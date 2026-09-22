import React, { useState } from "react";
import { Megaphone, RefreshCw, Plus, Shield, ShieldOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useMetaConfig,
  useMetaCampaigns,
  useMetaCreatives,
  useMetaLogs,
  useMetaInsights,
  useMetaAttribution,
  useSyncMetaAds,
} from "@/hooks/useMetaAdsData";
import MetaAdsKpiCards from "@/components/meta-ads/MetaAdsKpiCards";
import MetaAdsFunnel from "@/components/meta-ads/MetaAdsFunnel";
import MetaAdsCampaignList from "@/components/meta-ads/MetaAdsCampaignList";
import MetaAdsCampaignDetail from "@/components/meta-ads/MetaAdsCampaignDetail";
import MetaAdsNewCampaignWizard from "@/components/meta-ads/MetaAdsNewCampaignWizard";

const ACTION_LABELS = {
  campaign_created: "Campagne créée",
  campaign_approved: "Campagne approuvée",
  campaign_rejected: "Campagne rejetée",
  campaign_activated: "Campagne activée",
  campaign_paused: "Campagne en pause",
  campaign_completed: "Campagne terminée",
  creative_created: "Créatif créé",
  creative_approved: "Créatif approuvé",
  meta_api_called: "Appel API Meta",
  meta_api_error: "Erreur API Meta",
  config_changed: "Config modifiée",
  kill_switch_toggled: "Kill switch basculé",
};

export default function MetaAdsDashboard() {
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showWizard, setShowWizard] = useState(false);

  const { data: config, isLoading: configLoading } = useMetaConfig();
  const { data: campaigns, isLoading: campaignsLoading } = useMetaCampaigns();
  const { data: creatives } = useMetaCreatives();
  const { data: logs } = useMetaLogs();
  const { data: insights } = useMetaInsights();
  const { data: attribution } = useMetaAttribution();

  const syncMutation = useSyncMetaAds();

  const killSwitchOn = config?.killSwitch;
  const autoMode = config?.autoMode;
  const supervisedMode = config?.supervisedMode;

  const lastSync = insights?.synced_at ? new Date(insights.synced_at).toLocaleString("fr-FR") : "Jamais";

  return (
    <div className="min-h-screen bg-slate-50 p-3 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-blue-600" />
            Publicités Meta
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Pilotage des campagnes Meta Ads — Burkina Faso
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">Dernière synchro: {lastSync}</span>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span className="ml-1 hidden sm:inline">Actualiser</span>
          </Button>
          <Button size="sm" className="h-9 bg-blue-600 hover:bg-blue-700" onClick={() => setShowWizard(true)}>
            <Plus className="w-3.5 h-3.5" />
            <span className="ml-1 hidden sm:inline">Nouvelle campagne</span>
          </Button>
        </div>
      </div>

      {/* Guardrails banner */}
      <Card className={`p-3 ${killSwitchOn ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            {killSwitchOn ? <Shield className="w-4 h-4 text-green-600" /> : <ShieldOff className="w-4 h-4 text-amber-600" />}
            <span className="font-semibold">Automatisation publicitaire: {killSwitchOn ? "ACTIVÉE" : "DÉSACTIVÉE"}</span>
          </div>
          <Badge className={autoMode ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}>Mode auto: {autoMode ? "ON" : "OFF"}</Badge>
          <Badge className={supervisedMode ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}>Mode supervisé: {supervisedMode ? "ON" : "OFF"}</Badge>
          <span className="text-slate-500">Budget max: <b>{config?.dailyBudgetCap || 1000} F/j</b></span>
          <span className="text-slate-500">Max campagnes actives: <b>{config?.maxCampaignsActive || 1}</b></span>
          <span className="text-slate-500">Compte: <b>234850849367733</b></span>
        </div>
      </Card>

      {/* KPI Cards */}
      <MetaAdsKpiCards insights={insights} attribution={attribution} campaigns={campaigns} />

      {/* Funnel */}
      <MetaAdsFunnel insights={insights} attribution={attribution} />

      {/* Campaign List */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 mb-2">Campagnes</h2>
        {campaignsLoading ? (
          <Card className="p-6 text-center text-slate-400 text-sm"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Chargement…</Card>
        ) : (
          <MetaAdsCampaignList campaigns={campaigns} attribution={attribution} config={config} onOpenDetail={setSelectedCampaign} />
        )}
      </div>

      {/* Journal */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 mb-2">Journal des actions</h2>
        <Card className="p-2 max-h-64 overflow-y-auto">
          {(logs || []).length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Aucune action journalisée</p>
          ) : (
            <div className="space-y-1">
              {(logs || []).slice(0, 30).map((log) => (
                <div key={log.id} className="flex items-center gap-2 text-[11px] py-1 border-b border-slate-50 last:border-0">
                  <span className="text-slate-400 flex-shrink-0">{log.action_date ? new Date(log.action_date).toLocaleString("fr-FR") : "—"}</span>
                  <Badge className={`text-[9px] flex-shrink-0 ${log.action_type?.includes("error") ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                    {ACTION_LABELS[log.action_type] || log.action_type}
                  </Badge>
                  <span className="text-slate-600 truncate">{log.target_name || log.target_id}</span>
                  <span className="text-slate-400 ml-auto flex-shrink-0">{log.actor_email}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Footer */}
      <Card className="p-3 bg-slate-100 border-slate-200">
        <p className="text-[10px] text-slate-500 text-center">
          Dashboard Publicités Meta — Compte verrouillé 234850849367733. Budget max {config?.dailyBudgetCap || 1000} F/jour.
          Pays autorisé: BF. Facebook uniquement. Aucun token Meta dans le frontend.
          Toutes les actions passent par le backend sécurisé manageMetaCampaign.
        </p>
      </Card>

      {/* Campaign Detail Dialog */}
      {selectedCampaign && (
        <MetaAdsCampaignDetail
          campaign={selectedCampaign}
          attribution={attribution}
          config={config}
          onClose={() => setSelectedCampaign(null)}
        />
      )}

      {/* New Campaign Wizard */}
      <MetaAdsNewCampaignWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        creatives={creatives}
        config={config}
      />
    </div>
  );
}