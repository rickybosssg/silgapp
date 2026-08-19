import React, { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Loader2, AlertTriangle, TrendingUp, TrendingDown, Wallet,
  Package, Clock, Users, AlertCircle, Lightbulb, ChevronRight, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

const VENUS_AVATAR = "https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/17cf522aa_file_0000000034b871f7bf133c0de0c9eb62.png";

const PRIORITY_CONFIG = {
  haute: { label: "Priorité haute", color: "bg-red-50 border-red-200", badge: "bg-red-500", text: "text-red-700", icon: AlertTriangle },
  moyenne: { label: "Priorité moyenne", color: "bg-amber-50 border-amber-200", badge: "bg-amber-500", text: "text-amber-700", icon: AlertCircle },
  basse: { label: "Priorité basse", color: "bg-blue-50 border-blue-200", badge: "bg-blue-500", text: "text-blue-700", icon: Info },
};

const CONFIDENCE_CONFIG = {
  eleve: { label: "Confiance élevée", color: "text-green-600 bg-green-50" },
  moyen: { label: "Confiance moyenne", color: "text-amber-600 bg-amber-50" },
  faible: { label: "Confiance faible", color: "text-slate-500 bg-slate-100" },
};

const TYPE_ICONS = {
  annulation_hausse: AlertTriangle,
  volume_hausse: TrendingUp,
  volume_baisse: TrendingDown,
  ca_hausse: TrendingUp,
  ca_baisse: TrendingDown,
  ca_week_hausse: TrendingUp,
  ca_week_baisse: TrendingDown,
  dette_accumulation: Wallet,
  dette_concentration: Wallet,
  courses_problematiques: Package,
  dispatch_retard: Clock,
  livreurs_dispo_baisse: Users,
  commission_anomalie: AlertCircle,
  events_repetitifs: AlertCircle,
};

const COMPARISON_LABELS = {
  today_vs_yesterday: "Aujourd'hui vs Hier",
  now_vs_yesterday_hour: "Maintenant vs même heure hier",
  week_vs_prev_week: "7 derniers jours vs semaine précédente",
  snapshot: "Instantané",
};

export default function VenusAdminInsights({ onAskVenus }) {
  const [expandedId, setExpandedId] = useState(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["venus-admin-intelligence"],
    queryFn: () => base44.functions.invoke("venusAdminIntelligence", { country_code: "ALL" }),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const insights = data?.insights || [];

  const handleAskVenus = useCallback((insight) => {
    const question = `Peux-tu me donner plus de détails sur cette détection : "${insight.observation}" ?`;
    if (onAskVenus) {
      onAskVenus(question);
    }
  }, [onAskVenus]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50 p-4 text-center">
        <p className="text-sm text-slate-500">Impossible de charger les détections. Réessayez.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={VENUS_AVATAR} alt="VENUS" className="w-7 h-7 rounded-lg object-cover" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">À surveiller</h3>
            <p className="text-[10px] text-slate-500">
              {insights.length > 0
                ? `${insights.length} détection${insights.length > 1 ? "s" : ""} prioritaire${insights.length > 1 ? "s" : ""}`
                : "Rien à signaler pour le moment"}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[11px] px-2"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : "Actualiser"}
        </Button>
      </div>

      {/* Insights list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {insights.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <Lightbulb className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm text-slate-400 font-medium">Rien à signaler</p>
              <p className="text-xs text-slate-400">L'activité est normale. Aucune tendance inhabituelle détectée.</p>
            </div>
          </div>
        ) : (
          insights.map((insight) => {
            const prio = PRIORITY_CONFIG[insight.priority] || PRIORITY_CONFIG.moyenne;
            const conf = CONFIDENCE_CONFIG[insight.confidence] || CONFIDENCE_CONFIG.faible;
            const Icon = TYPE_ICONS[insight.type] || AlertCircle;
            const isExpanded = expandedId === insight.id;

            return (
              <div
                key={insight.id}
                className={cn("rounded-xl border p-3 shadow-sm transition-all", prio.color)}
              >
                {/* Header */}
                <div
                  className="flex items-start gap-2 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : insight.id)}
                >
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", prio.badge)}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded text-white", prio.badge)}>
                        {insight.priority.toUpperCase()}
                      </span>
                      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", conf.color)}>
                        {conf.label}
                      </span>
                      <span className="text-[9px] text-slate-500 font-medium">
                        {COMPARISON_LABELS[insight.comparison] || insight.comparison}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 leading-tight">{insight.observation}</p>
                  </div>
                  <ChevronRight className={cn("w-4 h-4 text-slate-400 flex-shrink-0 transition-transform", isExpanded && "rotate-90")} />
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="mt-2 ml-10 space-y-2">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Analyse</p>
                      <p className="text-xs text-slate-700">{insight.analyse}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Recommandation</p>
                      <p className="text-xs text-slate-700">{insight.recommandation}</p>
                    </div>
                    {(insight.course_ids?.length > 0 || insight.livreur_ids?.length > 0) && (
                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        {insight.course_ids?.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            {insight.course_ids.length} course{insight.course_ids.length > 1 ? "s" : ""}
                          </span>
                        )}
                        {insight.livreur_ids?.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {insight.livreur_ids.length} livreur{insight.livreur_ids.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] px-2 gap-1"
                      onClick={() => handleAskVenus(insight)}
                    >
                      <img src={VENUS_AVATAR} alt="" className="w-3 h-3 rounded" />
                      Demander à VENUS
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}