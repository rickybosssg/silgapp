import React from "react";
import { sumMetric, metricCount as fmtN } from "./metaAdsMetrics.js";
import { Megaphone, MousePointerClick, Smartphone, UserPlus, Package, Truck, Repeat } from "lucide-react";

function FunnelStep({ icon: Icon, label, value, sub = null, isLast = false }) {
  return (
    <div className="flex items-center gap-2.5 flex-1 min-w-0">
      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-blue-600" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-slate-500 truncate">{label}</div>
        <div className="text-sm font-bold text-slate-800">{value}</div>
        {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
      </div>
      {!isLast && <div className="text-slate-300 text-lg flex-shrink-0">→</div>}
    </div>
  );
}

export default function MetaAdsFunnel({ insights, attribution }) {
  const last7 = insights?.last_7_days;
  const clicks = sumMetric(last7, d => d.clicks);
  const impressions = sumMetric(last7, d => d.impressions);
  const campaignStats = attribution?.campaigns;
  const installs = sumMetric(campaignStats, c => c.installs);
  const signups = sumMetric(campaignStats, c => c.signups);
  const firstCourses = sumMetric(campaignStats, c => c.first_courses);
  const secondCourses = sumMetric(campaignStats, c => c.second_courses);

  return (
    <div className="bg-white rounded-xl border p-3 md:p-4">
      <h3 className="text-sm font-bold text-slate-700 mb-3">Funnel d'acquisition</h3>
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <FunnelStep icon={Megaphone} label="Publicité" value={fmtN(impressions)} sub="impressions" />
        <FunnelStep icon={MousePointerClick} label="Clic" value={fmtN(clicks)} />
        <FunnelStep icon={Smartphone} label="Installation" value={fmtN(installs)} />
        <FunnelStep icon={UserPlus} label="Inscription" value={fmtN(signups)} />
        <FunnelStep icon={Package} label="1re course" value={fmtN(firstCourses)} />
        <FunnelStep icon={Truck} label="Course livrée" value={fmtN(secondCourses)} />
        <FunnelStep icon={Repeat} label="Client récurrent" value="—" isLast />
      </div>
      <p className="text-[10px] text-slate-400 mt-3">
        Chaque étape utilise des données réelles. « 0 » = donnée disponible et nulle. « — » = donnée non disponible.
      </p>
    </div>
  );
}