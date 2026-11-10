import { metricRows, attributionSpend, metricCount } from "./metaAdsMetrics.js";
import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import MetaAdsCampaignActions from "./MetaAdsCampaignActions";

const STATUS_BADGES = {
  draft: { label: "Brouillon", cls: "bg-slate-100 text-slate-600" },
  pending_approval: { label: "En attente", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "Approuvée", cls: "bg-blue-100 text-blue-700" },
  active: { label: "Active", cls: "bg-green-100 text-green-700" },
  paused: { label: "En pause", cls: "bg-amber-100 text-amber-700" },
  completed: { label: "Terminée", cls: "bg-slate-100 text-slate-500" },
  rejected: { label: "Rejetée", cls: "bg-red-100 text-red-700" },
  archived: { label: "Archivée", cls: "bg-slate-100 text-slate-400" },
};

export default function MetaAdsCampaignList({ campaigns, attribution, config, onOpenDetail }) {
  const safeCampaigns = metricRows(campaigns);
  const attributionMap = new Map();
  for (const c of metricRows(attribution?.campaigns)) {
    attributionMap.set(c.campaign_name, c);
  }

  return (
    <div className="space-y-2">
      {safeCampaigns.length === 0 && (
        <Card className="p-6 text-center text-slate-400 text-sm">
          {Array.isArray(campaigns) ? "Aucune campagne Meta pour le moment." : "Données de campagnes indisponibles."}
        </Card>
      )}
      {safeCampaigns.map((camp) => {
        const attr = attributionMap.get(camp.name) || {};
        const statusInfo = STATUS_BADGES[camp.status] || { label: camp.status, cls: "bg-slate-100 text-slate-600" };
        return (
          <Card key={camp.id} className="p-3 hover:shadow-md transition-shadow cursor-pointer" >
            <div className="flex items-start justify-between gap-2" onClick={() => onOpenDetail(camp)}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-slate-800 truncate">{camp.name}</span>
                  <Badge className={`${statusInfo.cls} text-[10px]`}>{statusInfo.label}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[11px] text-slate-500">
                  <span>Budget: <b className="text-slate-700">{camp.daily_budget ? `${camp.daily_budget.toLocaleString()} F/j` : "—"}</b></span>
                  <span>Dépense: <b className="text-slate-700">{attributionSpend(attr.meta_spend)}</b></span>
                  <span>Installs: <b className="text-slate-700">{metricCount(attr.installs)}</b></span>
                  <span>Inscrits: <b className="text-slate-700">{metricCount(attr.signups)}</b></span>
                  <span>1res courses: <b className="text-slate-700">{metricCount(attr.first_courses)}</b></span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <MetaAdsCampaignActions campaign={camp} config={config} compact />
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
            </div>
          </Card>
        );
      })}
    </div>
  );
}