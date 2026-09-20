import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit3, Check, X } from "lucide-react";

export default function GrowthBudgetEditor({
  title,
  icon: Icon,
  budgetPerDay,
  spentToday,
  remainingToday,
  spent7Days,
  spent30Days,
  accent = "blue",
  extraStats = [],
  onBudgetChange,
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(budgetPerDay));
  const [confirming, setConfirming] = useState(false);

  const accentMap = {
    blue: "border-blue-200 bg-blue-50",
    amber: "border-amber-200 bg-amber-50",
    green: "border-emerald-200 bg-emerald-50",
  };
  const pctUsed = budgetPerDay > 0 ? Math.min(100, (spentToday / budgetPerDay) * 100) : 0;

  const handleSave = () => {
    const num = parseInt(value);
    if (!num || num < 0 || num > 1000000) return;
    setConfirming(true);
  };

  const handleConfirm = () => {
    onBudgetChange?.(parseInt(value));
    setEditing(false);
    setConfirming(false);
  };

  const handleCancel = () => {
    setValue(String(budgetPerDay));
    setEditing(false);
    setConfirming(false);
  };

  return (
    <Card className={`p-4 shadow-sm border-2 ${accentMap[accent]}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${accent === "blue" ? "bg-blue-100" : accent === "amber" ? "bg-amber-100" : "bg-emerald-100"}`}>
            <Icon className="h-4 w-4 text-slate-700" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        </div>
        {!editing && !confirming && (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setValue(String(budgetPerDay)); setEditing(true); }}>
            <Edit3 className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {/* Budget max / jour — éditable */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Budget max / jour</span>
          {editing ? (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-7 w-24 text-xs"
                autoFocus
              />
              <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={handleSave}>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={handleCancel}>
                <X className="h-3.5 w-3.5 text-rose-500" />
              </Button>
            </div>
          ) : (
            <span className="text-sm font-bold text-slate-700">{budgetPerDay.toLocaleString()} FCFA</span>
          )}
        </div>

        {/* Dépensé aujourd'hui */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Dépensé aujourd'hui</span>
          <span className="text-sm font-bold text-slate-700">{spentToday.toLocaleString()} FCFA</span>
        </div>

        {/* Restant aujourd'hui */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Restant aujourd'hui</span>
          <span className="text-sm font-bold text-emerald-600">{remainingToday.toLocaleString()} FCFA</span>
        </div>

        {/* Barre de progression */}
        <div className="mt-1 h-2 rounded-full bg-slate-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pctUsed >= 100 ? "bg-rose-500" : pctUsed >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${pctUsed}%` }}
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-slate-500">7 derniers jours</span>
          <span className="text-xs font-semibold text-slate-600">{spent7Days.toLocaleString()} FCFA</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">30 derniers jours</span>
          <span className="text-xs font-semibold text-slate-600">{spent30Days.toLocaleString()} FCFA</span>
        </div>

        {extraStats.map((stat, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-xs text-slate-500">{stat.label}</span>
            <span className={`text-xs font-semibold ${stat.color || "text-slate-600"}`}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Dialogue de confirmation */}
      {confirming && (
        <div className="mt-3 rounded-lg border-2 border-amber-300 bg-amber-100 p-3">
          <p className="text-xs font-bold text-amber-800">⚠ Confirmer la modification</p>
          <p className="text-[11px] text-amber-700 mt-1">
            Nouveau budget : <strong>{parseInt(value).toLocaleString()} FCFA/jour</strong>
          </p>
          <p className="text-[10px] text-amber-600 mt-0.5">
            Cette action sera journalisée.
          </p>
          <div className="flex gap-2 mt-2">
            <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700" onClick={handleConfirm}>
              Confirmer
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleCancel}>
              Annuler
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
