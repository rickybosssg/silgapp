import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bot, Zap, DollarSign, AlertTriangle } from "lucide-react";
import { isToday } from "date-fns";

/**
 * Carte "Activité VENUS" — monitoring du canal WhatsApp autonome.
 * Affiche :
 *  - Courses créées par VENUS aujourd'hui (vs total du jour)
 *  - Taux de fallback OpenAI → Base44 (qualité IA)
 *  - Coût OpenAI du jour (USD)
 *  - Interventions humaines (incidents ouverts)
 */
export default function VenusActivityPanel({ courses = [], countryCode }) {
  const { data: openaiUsage = [] } = useQuery({
    queryKey: ["venus-openai-usage-today", countryCode || "all"],
    queryFn: () =>
      base44.entities.VenusOpenAIUsage.filter(
        countryCode ? { model_used: { $ne: "" } } : {},
        "-created_date",
        100
      ),
    initialData: [],
    refetchInterval: 60000,
    staleTime: 45000,
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ["venus-incidents-ouverts"],
    queryFn: () =>
      base44.entities.VenusIncident.filter(
        { statut: { $in: ["ouvert", "en_cours"] } },
        "-created_date",
        20
      ),
    initialData: [],
    refetchInterval: 60000,
    staleTime: 45000,
  });

  const stats = useMemo(() => {
    // Courses VENUS du jour
    const todayCourses = courses.filter(c => isToday(new Date(c.created_date)));
    const venusToday = todayCourses.filter(c => c.created_by_venus === true);
    const appToday = todayCourses.filter(c => !c.created_by_venus);

    // Stats OpenAI du jour
    const todayUsage = openaiUsage.filter(u => isToday(new Date(u.created_date || u.date_appel)));
    const totalCalls = todayUsage.length;
    const fallbacks = todayUsage.filter(u =>
      ["fallback", "error", "empty_response", "total_failure"].includes(u.status)
    ).length;
    const successes = todayUsage.filter(u => u.status === "success").length;
    const fallbackRate = totalCalls > 0 ? Math.round((fallbacks / totalCalls) * 100) : 0;

    const costToday = todayUsage.reduce((sum, u) => sum + (u.cost_usd || 0), 0);

    return {
      venusToday: venusToday.length,
      appToday: appToday.length,
      totalToday: todayCourses.length,
      venusPct: todayCourses.length > 0 ? Math.round((venusToday.length / todayCourses.length) * 100) : 0,
      totalCalls,
      successes,
      fallbacks,
      fallbackRate,
      costToday,
    };
  }, [courses, openaiUsage]);

  const incidentsOuverts = incidents.length;

  const fallbackColor = stats.fallbackRate === 0 ? "text-[#00a86b]"
    : stats.fallbackRate <= 10 ? "text-amber-400"
    : "text-red-400";

  const venusColor = stats.venusPct >= 30 ? "text-violet-400"
    : stats.venusPct >= 10 ? "text-violet-300"
    : "text-white/40";

  return (
    <div className="bg-[#1f2429] rounded-2xl border border-white/8 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Activité VENUS</h3>
          <p className="text-[10px] text-white/40">Canal WhatsApp autonome</p>
        </div>
        {incidentsOuverts > 0 && (
          <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span className="text-[10px] font-bold text-red-400">{incidentsOuverts} incident{incidentsOuverts > 1 ? "s" : ""}</span>
          </span>
        )}
      </div>

      <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Courses VENUS */}
        <div className="rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Bot className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
              Courses VENUS
            </span>
          </div>
          <p className={`text-2xl font-black leading-none ${venusColor}`}>
            {stats.venusToday}
          </p>
          <p className="text-[10px] text-white/40 mt-1">
            {stats.venusPct}% du jour ({stats.totalToday})
          </p>
        </div>

        {/* App vs VENUS */}
        <div className="rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Zap className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
              App client
            </span>
          </div>
          <p className="text-2xl font-black leading-none text-blue-400">
            {stats.appToday}
          </p>
          <p className="text-[10px] text-white/40 mt-1">vs VENUS {stats.venusToday}</p>
        </div>

        {/* Taux de fallback */}
        <div className="rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
              Fallback IA
            </span>
          </div>
          <p className={`text-2xl font-black leading-none ${fallbackColor}`}>
            {stats.fallbackRate}%
          </p>
          <p className="text-[10px] text-white/40 mt-1">
            {stats.fallbacks}/{stats.totalCalls} appels
          </p>
        </div>

        {/* Coût OpenAI */}
        <div className="rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <DollarSign className="w-3.5 h-3.5 text-[#00a86b]" />
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
              Coût OpenAI
            </span>
          </div>
          <p className="text-2xl font-black leading-none text-[#00a86b]">
            ${stats.costToday.toFixed(2)}
          </p>
          <p className="text-[10px] text-white/40 mt-1">aujourd'hui</p>
        </div>
      </div>

      {/* Barre de répartition VENUS vs App */}
      {stats.totalToday > 0 && (
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">
              Répartition des courses du jour
            </span>
            <span className="text-[10px] text-white/40">
              VENUS {stats.venusPct}% · App {100 - stats.venusPct}%
            </span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-purple-500"
              style={{ width: `${stats.venusPct}%` }}
            />
            <div
              className="h-full bg-gradient-to-r from-blue-400 to-blue-500"
              style={{ width: `${100 - stats.venusPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}