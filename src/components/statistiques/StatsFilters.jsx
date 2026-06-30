import React, { useState } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays, startOfMonth, startOfYear } from "date-fns";

const PERIODS = [
  { value: "today", label: "Aujourd'hui" },
  { value: "yesterday", label: "Hier" },
  { value: "7days", label: "7 jours" },
  { value: "30days", label: "30 jours" },
  { value: "this_month", label: "Ce mois" },
  { value: "this_year", label: "Cette année" },
  { value: "custom", label: "Perso." },
];

export function computeDateRange(period, customRange) {
  const now = new Date();
  const fmt = (d) => format(d, "yyyy-MM-dd");

  switch (period) {
    case "today":
      return { debut: fmt(now), fin: fmt(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { debut: fmt(y), fin: fmt(y) };
    }
    case "7days":
      return { debut: fmt(subDays(now, 7)), fin: fmt(now) };
    case "30days":
      return { debut: fmt(subDays(now, 30)), fin: fmt(now) };
    case "this_month":
      return { debut: fmt(startOfMonth(now)), fin: fmt(now) };
    case "this_year":
      return { debut: fmt(startOfYear(now)), fin: fmt(now) };
    case "custom":
      return { debut: customRange.debut || fmt(subDays(now, 30)), fin: customRange.fin || fmt(now) };
    default:
      return { debut: fmt(subDays(now, 30)), fin: fmt(now) };
  }
}

export default function StatsFilters({ period, setPeriod, customRange, setCustomRange }) {
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PERIODS.map(p => (
        <button
          key={p.value}
          onClick={() => {
            setPeriod(p.value);
            setShowCustom(p.value === "custom");
          }}
          className={cn(
            "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold border transition-all",
            period === p.value
              ? "bg-slate-900 text-white border-slate-900 shadow-md"
              : "bg-white text-gray-600 border-gray-200 hover:border-slate-400 hover:text-slate-800"
          )}
        >
          <Calendar className="w-3 h-3" />
          {p.label}
        </button>
      ))}

      {showCustom && (
        <div className="flex items-center gap-2 ml-2">
          <input
            type="date"
            value={customRange.debut}
            onChange={(e) => setCustomRange(r => ({ ...r, debut: e.target.value }))}
            className="h-9 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-gray-700 focus:ring-2 focus:ring-slate-200 focus:border-slate-400 outline-none"
          />
          <span className="text-gray-400 text-xs">→</span>
          <input
            type="date"
            value={customRange.fin}
            onChange={(e) => setCustomRange(r => ({ ...r, fin: e.target.value }))}
            className="h-9 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-gray-700 focus:ring-2 focus:ring-slate-200 focus:border-slate-400 outline-none"
          />
        </div>
      )}
    </div>
  );
}