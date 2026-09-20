import React from "react";
import { Card } from "@/components/ui/card";

export default function GrowthBudgetCard({
  title,
  icon: Icon,
  budgetPerDay,
  spentToday,
  remainingToday,
  spent7Days,
  spent30Days,
  extraStats = [],
  accent = "blue",
}) {
  const accentMap = {
    blue: "border-blue-200 bg-blue-50",
    amber: "border-amber-200 bg-amber-50",
    green: "border-emerald-200 bg-emerald-50",
  };
  const pctUsed = budgetPerDay > 0 ? Math.min(100, (spentToday / budgetPerDay) * 100) : 0;

  return (
    <Card className={`p-4 shadow-sm border-2 ${accentMap[accent]}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-lg ${accent === "blue" ? "bg-blue-100" : accent === "amber" ? "bg-amber-100" : "bg-emerald-100"}`}>
          <Icon className="h-4 w-4 text-slate-700" />
        </div>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Budget max / jour</span>
          <span className="text-sm font-bold text-slate-700">{budgetPerDay.toLocaleString()} FCFA</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Dépensé aujourd'hui</span>
          <span className="text-sm font-bold text-slate-700">{spentToday.toLocaleString()} FCFA</span>
        </div>

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
    </Card>
  );
}
