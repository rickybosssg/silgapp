import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Users, Send, CheckCircle2, Power } from "lucide-react";

const STATUS_STYLE = {
  "LIVE": "bg-emerald-100 text-emerald-700 border-emerald-300",
  "DRY-RUN": "bg-amber-100 text-amber-700 border-amber-300",
  "OFF": "bg-slate-100 text-slate-500 border-slate-300",
  "ON": "bg-emerald-100 text-emerald-700 border-emerald-300",
};

const NEXT_STATES = {
  "LIVE": ["DRY-RUN", "OFF"],
  "DRY-RUN": ["LIVE", "OFF"],
  "OFF": ["DRY-RUN", "LIVE"],
  "ON": ["OFF"],
};

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

export default function GrowthEngineToggle({
  title,
  engineKey,
  status,
  description,
  lastRun,
  analyzed,
  sent,
  converted,
  onToggle,
  disabled = false,
}) {
  const [confirming, setConfirming] = useState(null); // nextState en attente de confirmation

  const nextStates = NEXT_STATES[status] || [];
  const isOff = status === "OFF";
  const isLive = status === "LIVE" || status === "ON";
  const isDryRun = status === "DRY-RUN";

  const handleToggleClick = (nextState) => {
    setConfirming(nextState);
  };

  const handleConfirm = () => {
    onToggle?.(confirming);
    setConfirming(null);
  };

  return (
    <Card className="p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-800">{title}</h3>
            <Badge className={`border ${STATUS_STYLE[status] || STATUS_STYLE.OFF} text-xs font-bold`}>
              {status}
            </Badge>
          </div>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
        {!disabled && nextStates.length > 0 && !confirming && (
          <Power className="h-4 w-4 text-slate-300" />
        )}
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
      </div>

      {/* Contrôles de bascule */}
      {!disabled && nextStates.length > 0 && !confirming && (
        <div className="mt-3 flex gap-1.5">
          {nextStates.map(ns => (
            <Button
              key={ns}
              variant="outline"
              size="sm"
              className="h-7 text-[10px] flex-1"
              onClick={() => handleToggleClick(ns)}
            >
              Passer en {ns}
            </Button>
          ))}
        </div>
      )}

      {/* Dialogue de confirmation */}
      {confirming && (
        <div className={`mt-3 rounded-lg border-2 p-3 ${confirming === "LIVE" || confirming === "ON" ? "border-emerald-300 bg-emerald-50" : confirming === "DRY-RUN" ? "border-amber-300 bg-amber-50" : "border-slate-300 bg-slate-50"}`}>
          <p className="text-xs font-bold text-slate-800">⚠ Confirmer le changement</p>
          <p className="text-[11px] text-slate-600 mt-1">
            {title} : <strong>{status}</strong> → <strong>{confirming}</strong>
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Cette action sera journalisée dans GrowthSpend.
          </p>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              className={`h-7 text-xs ${confirming === "LIVE" || confirming === "ON" ? "bg-emerald-600 hover:bg-emerald-700" : confirming === "DRY-RUN" ? "bg-amber-600 hover:bg-amber-700" : "bg-slate-600 hover:bg-slate-700"}`}
              onClick={handleConfirm}
            >
              Confirmer
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setConfirming(null)}>
              Annuler
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
