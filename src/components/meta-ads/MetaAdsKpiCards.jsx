import React from "react";
import { metricNumber, spendUsd, spendFcfa, sumMetric, metricFcfa as fmtF, metricCount as fmtN, metricUsd } from "./metaAdsMetrics.js";
import { Card } from "@/components/ui/card";
import { TrendingUp, Eye, MousePointerClick, Smartphone, UserPlus, Package, Truck, Wallet, DollarSign } from "lucide-react";

const STATUS_LABELS = {
  active: { label: "Active", color: "bg-green-100 text-green-700" },
  paused: { label: "En pause", color: "bg-amber-100 text-amber-700" },
  draft: { label: "Brouillon", color: "bg-slate-100 text-slate-600" },
  approved: { label: "Approuvée", color: "bg-blue-100 text-blue-700" },
  pending_approval: { label: "En attente", color: "bg-amber-100 text-amber-700" },
  completed: { label: "Terminée", color: "bg-slate-100 text-slate-600" },
  rejected: { label: "Rejetée", color: "bg-red-100 text-red-700" },
  archived: { label: "Archivée", color: "bg-slate-100 text-slate-500" },
};

function KpiCard({ label, value, sub, icon: Icon, accent }) {
  const accentMap = {
    blue: "text-blue-600 bg-blue-50",
    green: "text-green-600 bg-green-50",
    amber: "text-amber-600 bg-amber-50",
    red: "text-red-600 bg-red-50",
    purple: "text-purple-600 bg-purple-50",
    gray: "text-slate-600 bg-slate-50",
  };
  return (
    <Card className="p-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-500 leading-tight">{label}</span>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accentMap[accent] || accentMap.gray}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="text-lg font-bold text-slate-800">{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </Card>
  );
}

export default function MetaAdsKpiCards({ insights, attribution, campaigns }) {
  const today = insights?.today;
  const last7 = insights?.last_7_days;
  const todaySpend = spendUsd(today);
  const weekSpend = sumMetric(last7, spendUsd);
  const weekFcfa = sumMetric(last7, spendFcfa);
  const weekImpressions = sumMetric(last7, d => d.impressions);
  const weekClicks = sumMetric(last7, d => d.clicks);
  const activeCount = Array.isArray(campaigns) ? campaigns.filter(c => c?.status === "active").length : null;
  const campaignStats = attribution?.campaigns;
  const totalInstalls = sumMetric(campaignStats, c => c.installs);
  const totalSignups = sumMetric(campaignStats, c => c.signups);
  const totalFirstCourses = sumMetric(campaignStats, c => c.first_courses);
  const totalDelivered = sumMetric(campaignStats, c => c.second_courses);
  const totalRevenue = sumMetric(campaignStats, c => c.revenue);
  const totalCommission = sumMetric(campaignStats, c => c.commission);
  const totalSpend = sumMetric(campaignStats, c => c.meta_spend);
  const costPerFirstCourse = totalFirstCourses > 0 && totalSpend !== null ? metricNumber(totalSpend / totalFirstCourses) : null;
  const attrSub = () => (!attribution ? "Attribution en cours" : "");

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
      <KpiCard label="Dépense aujourd'hui" value={fmtF(spendFcfa(today))} sub={metricUsd(todaySpend)} icon={DollarSign} accent="blue" />
      <KpiCard label="Dépense 7 jours" value={fmtF(weekFcfa)} sub={metricUsd(weekSpend)} icon={TrendingUp} accent="blue" />
      <KpiCard label="Campagnes actives" value={fmtN(activeCount)} icon={TrendingUp} accent="green" />
      <KpiCard label="Impressions (7j)" value={fmtN(weekImpressions)} icon={Eye} accent="purple" />
      <KpiCard label="Clics (7j)" value={fmtN(weekClicks)} icon={MousePointerClick} accent="amber" />
      <KpiCard label="Installations attribuées" value={fmtN(totalInstalls)} sub={attrSub()} icon={Smartphone} accent="blue" />
      <KpiCard label="Nouveaux inscrits" value={fmtN(totalSignups)} sub={attrSub()} icon={UserPlus} accent="green" />
      <KpiCard label="Premières courses" value={fmtN(totalFirstCourses)} sub={attrSub()} icon={Package} accent="amber" />
      <KpiCard label="Courses livrées" value={fmtN(totalDelivered)} sub={attrSub()} icon={Truck} accent="green" />
      <KpiCard label="Coût / 1ère course" value={costPerFirstCourse != null ? fmtF(costPerFirstCourse * 600) : "—"} icon={Wallet} accent="red" />
      <KpiCard label="Revenus attribués" value={fmtF(totalRevenue)} sub={attrSub()} icon={DollarSign} accent="green" />
      <KpiCard label="Commission attribuée" value={fmtF(totalCommission)} sub={attrSub()} icon={Wallet} accent="blue" />
    </div>
  );
}