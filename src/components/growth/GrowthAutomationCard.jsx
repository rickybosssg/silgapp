import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Send, CheckCircle2, AlertTriangle } from "lucide-react";

function StatusBadge({ status }) {
  const map = {
    "LIVE": "bg-emerald-100 text-emerald-700 border-emerald-300",
    "DRY-RUN": "bg-amber-100 text-amber-700 border-amber-300",
    "OFF": "bg-slate-100 text-slate-500 border-slate-300",
    "ON": "bg-emerald-100 text-emerald-700 border-emerald-300",
  };
  return (
    <Badge className={`border ${map[status] || map.OFF} text-xs font-bold`}>
      {status}
    </Badge>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return "—";
  }
}

export default function GrowthAutomationCard({ title, status, lastRun, analyzed, sent, converted, errors, description }) {
  return (
    <Card className="p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-800">{title}</h3>
            <StatusBadge status={status} />
          </div>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <Clock className="h-3.5 w-3.5 text-slate-400" />
          <span>Dernière exécution</span>
        </div>
        <div className="text-xs font-semibold text-slate-700 text-right">
          {formatDate(lastRun)}
        </div>

        {analyzed !== undefined && (
          <>
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Users className="h-3.5 w-3.5 text-slate-400" />
              <span>Clients analysés</span>
            </div>
            <div className="text-xs font-bold text-slate-700 text-right">{analyzed}</div>
          </>
        )}

        {sent !== undefined && (
          <>
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Send className="h-3.5 w-3.5 text-slate-400" />
              <span>Notifications envoyées</span>
            </div>
            <div className="text-xs font-bold text-slate-700 text-right">{sent}</div>
          </>
        )}

        {converted !== undefined && (
          <>
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span>Conversions</span>
            </div>
            <div className="text-xs font-bold text-emerald-600 text-right">{converted}</div>
          </>
        )}

        {errors !== undefined && errors > 0 && (
          <>
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
              <span>Erreurs</span>
            </div>
            <div className="text-xs font-bold text-rose-600 text-right">{errors}</div>
          </>
        )}
      </div>
    </Card>
  );
}