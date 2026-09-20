import React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function GrowthKpiCard({ label, value, sub, icon: Icon, accent = "blue" }) {
  const accentMap = {
    blue: "from-blue-500 to-blue-600",
    green: "from-emerald-500 to-emerald-600",
    amber: "from-amber-500 to-amber-600",
    purple: "from-violet-500 to-violet-600",
    rose: "from-rose-500 to-rose-600",
    gray: "from-slate-500 to-slate-600",
  };
  return (
    <Card className="relative overflow-hidden border-0 shadow-md">
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-95", accentMap[accent])} />
      <div className="relative p-4 text-white">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-90">{label}</p>
          {Icon && <Icon className="h-5 w-5 opacity-80" />}
        </div>
        <p className="mt-2 text-2xl font-extrabold">{value}</p>
        {sub && <p className="mt-1 text-xs opacity-80">{sub}</p>}
      </div>
    </Card>
  );
}