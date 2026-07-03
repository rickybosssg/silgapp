import React from "react";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

const SCORE_LABELS = [
  { key: "design", label: "Design", color: "from-pink-500 to-rose-500" },
  { key: "ux", label: "UX", color: "from-violet-500 to-purple-500" },
  { key: "performance", label: "Performance", color: "from-blue-500 to-cyan-500" },
  { key: "dispatch", label: "Dispatch", color: "from-amber-500 to-orange-500" },
  { key: "notifications", label: "Notifications", color: "from-emerald-500 to-green-500" },
  { key: "gps", label: "GPS", color: "from-teal-500 to-cyan-600" },
  { key: "securite", label: "Sécurité", color: "from-red-500 to-rose-600" },
  { key: "architecture", label: "Architecture", color: "from-indigo-500 to-blue-600" },
];

export default function NeoScoreGrid({ scores, scoreGlobal }) {
  const parsed = typeof scores === "string" ? JSON.parse(scores || "{}") : (scores || {});

  return (
    <div className="space-y-4">
      {/* Score global */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Score Global SILGAPP</h3>
              <p className="text-white/40 text-xs">Évaluation NEO sur 100</p>
            </div>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <span className={cn(
            "text-5xl font-black tracking-tight",
            scoreGlobal >= 90 ? "text-emerald-400" : scoreGlobal >= 75 ? "text-cyan-400" : scoreGlobal >= 60 ? "text-amber-400" : "text-red-400"
          )}>
            {scoreGlobal || 0}
          </span>
          <span className="text-white/30 text-xl font-bold mb-1">/100</span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              scoreGlobal >= 90 ? "bg-emerald-500" : scoreGlobal >= 75 ? "bg-cyan-500" : scoreGlobal >= 60 ? "bg-amber-500" : "bg-red-500"
            )}
            style={{ width: `${scoreGlobal || 0}%` }}
          />
        </div>
      </div>

      {/* Scores par catégorie */}
      <div className="grid grid-cols-2 gap-3">
        {SCORE_LABELS.map(({ key, label, color }) => {
          const val = parsed[key] || 0;
          return (
            <div key={key} className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-600">{label}</span>
                <span className={cn(
                  "text-lg font-black",
                  val >= 90 ? "text-emerald-600" : val >= 75 ? "text-cyan-600" : val >= 60 ? "text-amber-600" : "text-red-600"
                )}>
                  {val}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", color)}
                  style={{ width: `${val}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}