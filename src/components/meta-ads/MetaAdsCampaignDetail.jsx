import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-semibold text-slate-800 text-right">{value || "—"}</span>
    </div>
  );
}

export default function MetaAdsCampaignDetail({ campaign, attribution, config, onClose }) {
  if (!campaign) return null;

  const attr = (attribution?.campaigns || []).find(c => c.campaign_name === campaign.name) || {};
  const statusInfo = STATUS_BADGES[campaign.status] || { label: campaign.status, cls: "bg-slate-100 text-slate-600" };
  const countries = (() => { try { return JSON.parse(campaign.country_codes || "[]"); } catch { return []; } })();
  const creativeIds = (() => { try { return JSON.parse(campaign.creative_ids || "[]"); } catch { return []; } })();

  return (
    <Dialog open={!!campaign} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{campaign.name}</span>
            <Badge className={`${statusInfo.cls} text-[10px]`}>{statusInfo.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Actions */}
        {campaign.meta_campaign_id && (
          <div className="flex items-center gap-2 py-2">
            <MetaAdsCampaignActions campaign={campaign} config={config} />
          </div>
        )}

        {/* Aperçu */}
        <div>
          <h4 className="text-xs font-bold text-slate-700 mb-1">Aperçu</h4>
          <DetailRow label="Nom" value={campaign.name} />
          <DetailRow label="Statut" value={statusInfo.label} />
          <DetailRow label="Budget quotidien" value={campaign.daily_budget ? `${campaign.daily_budget.toLocaleString()} F CFA` : "—"} />
          <DetailRow label="Objectif" value={campaign.objective} />
          <DetailRow label="Pays" value={countries.join(", ")} />
          <DetailRow label="Plateforme" value="Facebook uniquement" />
          <DetailRow label="Zone" value="Ouagadougou + 25km" />
          <DetailRow label="Âge" value="18-45 ans" />
          <DetailRow label="Créatifs liés" value={creativeIds.length > 0 ? `${creativeIds.length} créatif(s)` : "—"} />
          <DetailRow label="Meta Campaign ID" value={campaign.meta_campaign_id || "Non créé sur Meta"} />
          <DetailRow label="Date de création" value={campaign.created_date ? new Date(campaign.created_date).toLocaleString("fr-FR") : "—"} />
        </div>

        {/* Performance Meta */}
        <div>
          <h4 className="text-xs font-bold text-slate-700 mb-1 mt-3">Performance Meta</h4>
          <DetailRow label="Dépense Meta" value={attr.meta_spend ? `${Math.round(attr.meta_spend * 600).toLocaleString()} F (≈ $${attr.meta_spend.toFixed(2)})` : "0 F"} />
          <DetailRow label="Clics Meta" value={attr.meta_clicks || 0} />
          <DetailRow label="Installations attribuées" value={attr.installs || 0} />
          <DetailRow label="Inscriptions" value={attr.signups || 0} />
        </div>

        {/* Conversion SILGAPP */}
        <div>
          <h4 className="text-xs font-bold text-slate-700 mb-1 mt-3">Conversion SILGAPP</h4>
          <DetailRow label="Premières courses" value={attr.first_courses || 0} />
          <DetailRow label="Courses livrées (≥2)" value={attr.second_courses || 0} />
          <DetailRow label="Revenus attribués" value={attr.revenue != null ? `${Math.round(attr.revenue).toLocaleString()} F` : "—"} />
          <DetailRow label="Commission attribuée" value={attr.commission != null ? `${Math.round(attr.commission).toLocaleString()} F` : "—"} />
          <DetailRow label="CPI (coût/install)" value={attr.cpi ? `${Math.round(attr.cpi * 600).toLocaleString()} F` : "—"} />
          <DetailRow label="Coût / 1re course" value={attr.cost_per_first_course ? `${Math.round(attr.cost_per_first_course * 600).toLocaleString()} F` : "—"} />
        </div>

        <p className="text-[10px] text-slate-400 mt-2">
          Les données d'attribution peuvent nécessiter un délai de synchronisation. Les montants Meta sont en USD, convertis en FCFA (1$ ≈ 600 F).
        </p>
      </DialogContent>
    </Dialog>
  );
}