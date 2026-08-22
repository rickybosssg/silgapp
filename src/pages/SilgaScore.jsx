import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Trophy, RefreshCw, ChevronDown, ChevronUp, Truck, Star,
  TrendingUp, TrendingDown, Wallet, Clock, Award, AlertCircle,
  BarChart3, List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import SilgaScoreCalibration from "@/components/admin/SilgaScoreCalibration";

const NIVEAU_CONFIG = {
  excellent: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", bar: "bg-emerald-500", label: "Excellent", icon: Award },
  bon: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", bar: "bg-blue-500", label: "Bon", icon: Truck },
  moyen: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", bar: "bg-amber-500", label: "Moyen", icon: Clock },
  faible: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", bar: "bg-red-500", label: "Faible", icon: AlertCircle },
  non_calcule: { bg: "bg-gray-50", text: "text-gray-500", border: "border-gray-200", bar: "bg-gray-300", label: "Non calculé", icon: AlertCircle },
};

function ScoreBar({ score, niveau }) {
  const config = NIVEAU_CONFIG[niveau] || NIVEAU_CONFIG.non_calcule;
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", config.bar)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={cn("text-sm font-black tabular-nums w-8 text-right", config.text)}>
        {score}
      </span>
    </div>
  );
}

function BreakdownRow({ category }) {
  const pct = Math.round((category.score / category.max) * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-700">{category.label}</p>
        <p className="text-[10px] text-gray-400 truncate">{category.detail}</p>
      </div>
      <div className="flex items-center gap-2 w-28 shrink-0">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] font-bold text-gray-500 tabular-nums w-10 text-right">
          {category.score}/{category.max}
        </span>
      </div>
    </div>
  );
}

export default function SilgaScore() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [activeTab, setActiveTab] = useState("classement");

  // ── Charger les livreurs avec leur score ──
  const { data: livreurs = [], isLoading } = useQuery({
    queryKey: ["silga-score-livreurs"],
    queryFn: async () => {
      const data = await base44.entities.Livreur.filter(
        { validation: "valide", actif: true },
        "-silga_score",
        300
      );
      return data || [];
    },
    refetchInterval: 60000,
  });

  // ── Mutation: recalculer tous les scores ──
  const recalcMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("calculerSilgaScore", { all: true, limit: 200 });
      return res;
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast.success(`${data.summary?.total_calcules || 0} scores recalculés (moyenne: ${data.summary?.score_moyen || 0})`);
        queryClient.invalidateQueries({ queryKey: ["silga-score-livreurs"] });
      } else {
        toast.error(data?.error || "Erreur lors du recalcul");
      }
    },
    onError: (err) => toast.error("Erreur: " + (err.message || "inconnue")),
  });

  // ── Mutation: recalculer un seul livreur ──
  const recalcOneMutation = useMutation({
    mutationFn: async (livreurId) => {
      const res = await base44.functions.invoke("calculerSilgaScore", { livreur_id: livreurId });
      return res;
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast.success(`Score recalculé: ${data.results?.score}/100 (${data.results?.niveau})`);
        queryClient.invalidateQueries({ queryKey: ["silga-score-livreurs"] });
      } else {
        toast.error(data?.error || "Erreur");
      }
    },
    onError: (err) => toast.error("Erreur: " + (err.message || "inconnue")),
  });

  // ── Stats globales ──
  const calcules = livreurs.filter((l) => l.silga_score_niveau && l.silga_score_niveau !== "non_calcule");
  const scoreMoyen = calcules.length > 0
    ? Math.round(calcules.reduce((sum, l) => sum + (l.silga_score || 0), 0) / calcules.length)
    : 0;
  const repartition = {
    excellent: calcules.filter((l) => l.silga_score_niveau === "excellent").length,
    bon: calcules.filter((l) => l.silga_score_niveau === "bon").length,
    moyen: calcules.filter((l) => l.silga_score_niveau === "moyen").length,
    faible: calcules.filter((l) => l.silga_score_niveau === "faible").length,
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-gray-300 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-md">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-black text-gray-900">Silga Score</h1>
              <p className="text-[10px] text-gray-400">Score de fiabilité des livreurs — mode observation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-0.5">
              <button
                onClick={() => setActiveTab("classement")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                  activeTab === "classement" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
                )}
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Classement</span>
              </button>
              <button
                onClick={() => setActiveTab("calibration")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                  activeTab === "calibration" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
                )}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Calibration</span>
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => recalcMutation.mutate()}
              disabled={recalcMutation.isPending}
              className="rounded-xl gap-2"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", recalcMutation.isPending && "animate-spin")} />
              <span className="hidden sm:inline">Recalculer</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "calibration" && (
        <div className="max-w-4xl mx-auto px-4 py-5">
          <SilgaScoreCalibration
            onRecalc={() => recalcMutation.mutate()}
            isRecalculating={recalcMutation.isPending}
          />
        </div>
      )}

      {activeTab === "classement" && (
      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">
        {/* Banner mode observation */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-blue-900">Mode observation</p>
            <p className="text-[11px] text-blue-700 mt-0.5">
              Le Silga Score est calculé à partir des données existantes (acceptation, livraison, annulations, délai de réponse, note, dette).
              Il n'est <strong>pas</strong> utilisé dans le dispatch V2. Après quelques semaines, on vérifiera la corrélation avant intégration.
            </p>
          </div>
        </div>

        {/* KPIs globaux */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span className="text-[10px] font-bold text-gray-400 uppercase">Score moyen</span>
            </div>
            <p className="text-2xl font-black text-gray-900">{scoreMoyen}<span className="text-sm text-gray-400">/100</span></p>
            <p className="text-[10px] text-gray-400 mt-0.5">{calcules.length} livreur(s) calculé(s)</p>
          </div>
          {[
            { key: "excellent", label: "Excellent", icon: Award, color: "text-emerald-500" },
            { key: "bon", label: "Bon", icon: Truck, color: "text-blue-500" },
            { key: "moyen", label: "Moyen", icon: Clock, color: "text-amber-500" },
          ].map((stat) => (
            <div key={stat.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className={cn("w-4 h-4", stat.color)} />
                <span className="text-[10px] font-bold text-gray-400 uppercase">{stat.label}</span>
              </div>
              <p className="text-2xl font-black text-gray-900">{repartition[stat.key]}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">livreur(s)</p>
            </div>
          ))}
        </div>

        {/* Liste des livreurs */}
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1 mb-2">
            Classement ({livreurs.length})
          </p>
          <div className="space-y-2">
            {livreurs.map((livreur, idx) => {
              const niveau = livreur.silga_score_niveau || "non_calcule";
              const config = NIVEAU_CONFIG[niveau];
              const score = livreur.silga_score || 0;
              const isExpanded = expandedId === livreur.id;
              let breakdown = null;
              try {
                breakdown = livreur.silga_score_breakdown ? JSON.parse(livreur.silga_score_breakdown) : null;
              } catch (_) {}

              return (
                <div key={livreur.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <button
                    onClick={() => toggleExpand(livreur.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-[10px] font-bold text-gray-300 w-5 text-center shrink-0">{idx + 1}</span>
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                      {livreur.photo_url ? (
                        <img src={livreur.photo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Truck className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {livreur.prenom} {livreur.nom}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {livreur.telephone} · {livreur.country_code || "—"}
                      </p>
                    </div>
                    <ScoreBar score={score} niveau={niveau} />
                    <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0", config.bg, config.text)}>
                      {config.label}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-300 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-300 shrink-0" />}
                  </button>

                  {/* Détail du breakdown */}
                  {isExpanded && (
                    <div className="px-4 pb-3 border-t border-gray-50">
                      {breakdown ? (
                        <div className="pt-2">
                          {Object.values(breakdown).map((cat, i) => (
                            <BreakdownRow key={i} category={cat} />
                          ))}
                          <div className="flex justify-end mt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => recalcOneMutation.mutate(livreur.id)}
                              disabled={recalcOneMutation.isPending}
                              className="text-[10px] h-7 gap-1"
                            >
                              <RefreshCw className={cn("w-3 h-3", recalcOneMutation.isPending && recalcOneMutation.variables === livreur.id && "animate-spin")} />
                              Recalculer ce livreur
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="py-3 text-center">
                          <p className="text-[11px] text-gray-400 mb-2">Score non calculé</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => recalcOneMutation.mutate(livreur.id)}
                            disabled={recalcOneMutation.isPending}
                            className="text-[10px] h-7 gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Calculer
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Légende */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Formule du score (100 points)</p>
          <div className="space-y-2">
            {[
              { label: "Taux d'acceptation", pts: 25, icon: TrendingUp, desc: "Courses acceptées / notifications reçues" },
              { label: "Taux de livraison", pts: 25, icon: Truck, desc: "Courses livrées / courses acceptées" },
              { label: "Taux d'annulation", pts: 15, icon: TrendingDown, desc: "Inverse du taux d'annulation" },
              { label: "Délai de réponse", pts: 15, icon: Clock, desc: "Temps moyen entre notification et acceptation" },
              { label: "Note moyenne", pts: 10, icon: Star, desc: "Note des clients (sur 5)" },
              { label: "Fiabilité financière", pts: 10, icon: Wallet, desc: "Dette en cours vs seuil autorisé" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <item.icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-gray-700">{item.label}</span>
                  <span className="text-[10px] text-gray-400 ml-2">— {item.desc}</span>
                </div>
                <span className="text-[10px] font-bold text-gray-500 shrink-0">{item.pts} pts</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}