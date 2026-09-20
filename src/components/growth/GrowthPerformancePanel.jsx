import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, Eye, Package, CheckCircle2 } from "lucide-react";

function PerformanceRow({ label, sent, opened, courseCreated, courseDelivered }) {
  const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : "—";
  const createRate = sent > 0 ? ((courseCreated / sent) * 100).toFixed(1) : "—";
  const deliverRate = courseCreated > 0 ? ((courseDelivered / courseCreated) * 100).toFixed(1) : "—";

  return (
    <div className="border-b border-slate-100 pb-3 mb-3 last:border-0 last:mb-0 last:pb-0">
      <p className="text-xs font-bold text-slate-700 mb-2">{label}</p>
      <div className="grid grid-cols-4 gap-2">
        <div className="text-center">
          <Send className="h-3.5 w-3.5 mx-auto text-blue-500" />
          <p className="text-sm font-bold text-slate-700 mt-1">{sent}</p>
          <p className="text-[9px] text-slate-400">Envoyés</p>
        </div>
        <div className="text-center">
          <Eye className="h-3.5 w-3.5 mx-auto text-violet-500" />
          <p className="text-sm font-bold text-slate-700 mt-1">{opened || "—"}</p>
          <p className="text-[9px] text-slate-400">Ouverts</p>
          {sent > 0 && <p className="text-[9px] text-violet-400">{openRate}%</p>}
        </div>
        <div className="text-center">
          <Package className="h-3.5 w-3.5 mx-auto text-amber-500" />
          <p className="text-sm font-bold text-slate-700 mt-1">{courseCreated}</p>
          <p className="text-[9px] text-slate-400">Courses créées</p>
          {sent > 0 && <p className="text-[9px] text-amber-400">{createRate}%</p>}
        </div>
        <div className="text-center">
          <CheckCircle2 className="h-3.5 w-3.5 mx-auto text-emerald-500" />
          <p className="text-sm font-bold text-slate-700 mt-1">{courseDelivered}</p>
          <p className="text-[9px] text-slate-400">Livrées</p>
          {courseCreated > 0 && <p className="text-[9px] text-emerald-400">{deliverRate}%</p>}
        </div>
      </div>
    </div>
  );
}

export default function GrowthPerformancePanel({ automationStatus, overview }) {
  return (
    <Card className="p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800 mb-3">Performance des automatisations</h3>

      {automationStatus && (
        <>
          <PerformanceRow
            label="Réactivation clients (J0/J+2/J+5)"
            sent={automationStatus.reactivation?.sent || 0}
            opened={null}
            courseCreated={automationStatus.reactivation?.converted || 0}
            courseDelivered={automationStatus.reactivation?.converted || 0}
          />
          <PerformanceRow
            label="Rappels d'habitude"
            sent={automationStatus.habitReminders?.sent || 0}
            opened={null}
            courseCreated={automationStatus.habitReminders?.converted || 0}
            courseDelivered={automationStatus.habitReminders?.converted || 0}
          />
          <PerformanceRow
            label="Relance 1ère course"
            sent={overview?.pushesSent || 0}
            opened={null}
            courseCreated={overview?.pushConversions || 0}
            courseDelivered={overview?.pushConversions || 0}
          />
        </>
      )}

      {overview && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Courses générées</p>
              <p className="text-lg font-extrabold text-slate-700">{overview.automationCourses}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">CA généré</p>
              <p className="text-lg font-extrabold text-emerald-600">
                {overview.automationRevenue.toLocaleString()} F
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Commission SILGAPP</p>
              <p className="text-lg font-extrabold text-blue-600">
                {overview.automationCommission.toLocaleString()} F
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Taux conversion push</p>
              <p className="text-lg font-extrabold text-amber-600">
                {overview.pushConversionRate}%
              </p>
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] text-slate-400">
        ℹ Le taux d'ouverture n'est pas mesurable actuellement (pas de tracking d'ouverture push).
        Les taux affichés sont calculés uniquement sur les données disponibles.
      </p>
    </Card>
  );
}