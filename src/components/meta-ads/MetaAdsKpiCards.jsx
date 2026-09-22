import React from "react";
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
  const last7 = insights?.last_7_days || [];
  const weekSpend = last7.reduce((sum, d) => sum + (d.spend || 0), 0);
  const weekImpressions = last7.reduce((sum, d) => sum + (d.impressions || 0), 0);
  const weekClicks = last7.reduce((sum, d) => sum + (d.clicks || 0), 0);

  const activeCount = (campaigns || []).filter(c => c.status === "active").length;

  const global = attribution?.global || {};
  const campaignStats = attribution?.campaigns || [];
  const totalInstalls = campaignStats.reduce((s, c) => s + (c.installs || 0), 0);
  const totalSignups = campaignStats.reduce((s, c) => s + (c.signups || 0), 0);
  const totalFirstCourses = campaignStats.reduce((s, c) => s + (c.first_courses || 0), 0);
  const totalDelivered = campaignStats.reduce((s, c) => s + (c.second_courses || 0), 0);
  const totalRevenue = campaignStats.reduce((s, c) => s + (c.revenue || 0), 0);
  const totalCommission = campaignStats.reduce((s, c) => s + (c.commission || 0), 0);
  const totalSpend = campaignStats.reduce((s, c) => s + (c.meta_spend || 0), 0);
  const costPerFirstCourse = totalFirstCourses > 0 ? totalSpend / totalFirstCourses : null;

  const fmtF = (v) => v != null ? `${Math.round(v).toLocaleString()} F` : "—";
  const fmtN = (v) => v != null && v > 0 ? v.toLocaleString() : "—";

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
      <KpiCard label="Dépense aujourd'hui" value={today ? fmtF(today.spend * 600) : "0 F"} sub={today ? `≈ $${today.spend.toFixed(2)}` : ""} icon={DollarSign} accent="blue" />
      <KpiCard label="Dépense 7 jours" value={fmtF(weekSpend * 600)} sub={`≈ $${weekSpend.toFixed(2)}`} icon={TrendingUp} accent="blue" />
      <KpiCard label="Campagnes actives" value={activeCount} icon={TrendingUp} accent="green" />
      <KpiCard label="Impressions (7j)" value={fmtN(weekImpressions)} icon={Eye} accent="purple" />
      <KpiCard label="Clics (7j)" value={fmtN(weekClicks)} icon={MousePointerClick} accent="amber" />
      <KpiCard label="Installations attribuées" value={fmtN(totalInstalls)} sub={totalInstalls === 0 ? "Attribution en cours" : ""} icon={Smartphone} accent="blue" />
      <KpiCard label="Nouveaux inscrits" value={fmtN(totalSignups)} sub={totalSignups === 0 ? "Attribution en cours" : ""} icon={UserPlus} accent="green" />
      <KpiCard label="Premières courses" value={fmtN(totalFirstCourses)} sub={totalFirstCourses === 0 ? "Attribution en cours" : ""} icon={Package} accent="amber" />
      <KpiCard label="Courses livrées" value={fmtN(totalDelivered)} sub={totalDelivered === 0 ? "Attribution en cours" : ""} icon={Truck} accent="green" />
      <KpiCard label="Coût / 1ère course" value={costPerFirstCourse != null ? fmtF(costPerFirstCourse * 600) : "—"} icon={Wallet} accent="red" />
      <KpiCard label="Revenus attribués" value={fmtF(totalRevenue)} sub={totalRevenue === 0 ? "Attribution en cours" : ""} icon={DollarSign} accent="green" />
      <KpiCard label="Commission attribuée" value={fmtF(totalCommission)} sub={totalCommission === 0 ? "Attribution en cours" : ""} icon={Wallet} accent="blue" />
    </div>
  );
}