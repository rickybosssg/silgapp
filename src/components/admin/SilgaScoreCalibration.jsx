import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Trophy, RefreshCw, ChevronDown, ChevronUp, Truck, Star,
  AlertTriangle, TrendingUp, TrendingDown, Wallet, Clock,
  Award, AlertCircle, Info, Shield, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const CONFIANCE_CONFIG = {
  elevee: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", label: "Confiance élevée", icon: Shield },
  moyenne: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "Confiance moyenne", icon: Clock },
  faible: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", label: "Confiance faible", icon: AlertTriangle },
};

const NIVEAU_CONFIG = {
  excellent: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", label: "Excellent", bar: "bg-emerald-500" },
  bon: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", label: "Bon", bar: "bg-blue-500" },
  moyen: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "Moyen", bar: "bg-amber-500" },
  faible: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", label: "Faible", bar: "bg-red-500" },
  non_calcule: { bg: "bg-gray-50", text: "text-gray-500", border: "border-gray-200", label: "Non calculé", bar: "bg-gray-300" },
};

const ANOMALY_CONFIG = {
  critical: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", icon: AlertCircle, label: "Critique" },
  warning: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: AlertTriangle, label: "Attention" },
  info: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: Info, label: "Info" },
};

function LivreurScoreCard({ livreur, rank, expanded, onToggle }) {
  const niveau = livreur.silga_score_niveau || "non_calcule";
  const niveauConfig = NIVEAU_CONFIG[niveau];
  const score = livreur.silga_score || 0;
  const confiance = livreur.silga_score_confiance || "faible";
  const confianceConfig = CONFIANCE_CONFIG[confiance] || CONFIANCE_CONFIG.faible;
  const dataPoints = livreur.silga_score_data_points || 0;

  let breakdown = null;
  try { breakdown = livreur.silga_score_breakdown ? JSON.parse(livreur.silga_score_breakdown) : null; } catch (_) {}

  let anomalies = [];
  try { anomalies = livreur.silga_score_anomalies ? JSON.parse(livreur.silga_score_anomalies) : []; } catch (_) {}

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors">
        <span className="text-[10px] font-bold text-gray-300 w-5 text-center shrink-0">{rank}</span>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
          {livreur.photo_url ? (
            <img src={livreur.photo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Truck className="w-4 h-4 text-gray-400" />
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-bold text-gray-900 truncate">{livreur.prenom} {livreur.nom}</p>
          <p className="text-[10px] text-gray-400">{livreur.telephone} · {livreur.country_code || "—"}</p>
        </div>
        <div className="flex items-center gap-2 min-w-[100px]">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full", niveauConfig.bar)} style={{ width: `${score}%` }} />
          </div>
          <span className={cn("text-sm font-black tabular-nums w-8 text-right", niveauConfig.text)}>{score}</span>
        </div>
        <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0", niveauConfig.bg, niveauConfig.text)}>
          {niveauConfig.label}
        </span>
        {anomalies.length > 0 && (
          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0", "bg-red-50 text-red-600")}>
            {anomalies.length}⚠
          </span>
        )}
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-300 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-300 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t border-gray-50 space-y-3">
          {/* Confiance */}
          <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2", confianceConfig.bg, confianceConfig.border)}>
            <confianceConfig.icon className={cn("w-4 h-4 shrink-0", confianceConfig.text)} />
            <div className="flex-1">
              <p className={cn("text-[11px] font-bold", confianceConfig.text)}>{confianceConfig.label}</p>
              <p className="text-[10px] text-gray-500">{dataPoints} point(s) de données</p>
            </div>
          </div>

          {/* Breakdown des 6 critères */}
          {breakdown && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Détail des 6 critères</p>
              {Object.values(breakdown).map((cat, i) => {
                const pct = Math.round((cat.score / cat.max) * 100);
                const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
                return (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700">{cat.label}</p>
                      <p className="text-[10px] text-gray-400 truncate">{cat.detail}</p>
                    </div>
                    <div className="flex items-center gap-2 w-24 shrink-0">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-500 tabular-nums w-10 text-right">{cat.score}/{cat.max}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Anomalies */}
          {anomalies.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Anomalies détectées</p>
              {anomalies.map((a, i) => {
                const config = ANOMALY_CONFIG[a.severity] || ANOMALY_CONFIG.warning;
                return (
                  <div key={i} className={cn("flex items-start gap-2 rounded-xl border p-2 mb-1", config.bg, config.border)}>
                    <config.icon className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", config.text)} />
                    <p className={cn("text-[11px]", config.text)}>{a.message}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SilgaScoreCalibration({ onRecalc, isRecalculating }) {
  const [expandedId, setExpandedId] = useState(null);

  const { data: livreurs = [], isLoading } = useQuery({
    queryKey: ["silga-score-calibration"],
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 text-gray-300 animate-spin" />
      </div>
    );
  }

  // ── Filtrer livreurs avec score calculé ──
  const withScores = livreurs.filter((l) => l.silga_score_niveau && l.silga_score_niveau !== "non_calcule");
  const sorted = [...withScores].sort((a, b) => (b.silga_score || 0) - (a.silga_score || 0));
  const top10 = sorted.slice(0, 10);
  const bottom10 = sorted.slice(-10).reverse();

  // ── Distribution ──
  const distribution = {
    excellent: withScores.filter((l) => l.silga_score_niveau === "excellent").length,
    bon: withScores.filter((l) => l.silga_score_niveau === "bon").length,
    moyen: withScores.filter((l) => l.silga_score_niveau === "moyen").length,
    faible: withScores.filter((l) => l.silga_score_niveau === "faible").length,
  };

  // ── Confiance ──
  const confianceBreakdown = {
    elevee: withScores.filter((l) => l.silga_score_confiance === "elevee").length,
    moyenne: withScores.filter((l) => l.silga_score_confiance === "moyenne").length,
    faible: withScores.filter((l) => l.silga_score_confiance === "faible" || !l.silga_score_confiance).length,
  };

  // ── Score moyen ──
  const scoreMoyen = withScores.length > 0
    ? Math.round(withScores.reduce((sum, l) => sum + (l.silga_score || 0), 0) / withScores.length)
    : 0;

  // ── Toutes les anomalies (depuis le cache) ──
  const allAnomalies = [];
  withScores.forEach((l) => {
    let anomalies = [];
    try { anomalies = l.silga_score_anomalies ? JSON.parse(l.silga_score_anomalies) : []; } catch (_) {}
    anomalies.forEach((a) => {
      allAnomalies.push({ ...a, livreur_nom: `${l.prenom} ${l.nom}`, livreur_id: l.id, score: l.silga_score });
    });
  });

  // ── Recommandations d'ajustement des poids ──
  const recommendations = [];
  const highScoreHighCancel = allAnomalies.filter(a => a.type === "HIGH_SCORE_HIGH_CANCELLATION").length;
  const highScoreSlowResponse = allAnomalies.filter(a => a.type === "HIGH_SCORE_SLOW_RESPONSE").length;
  const lowScoreLowData = allAnomalies.filter(a => a.type === "LOW_SCORE_LOW_DATA").length;
  const highScoreNoDeliveries = allAnomalies.filter(a => a.type === "HIGH_SCORE_NO_DELIVERIES").length;
  const slowPickup = allAnomalies.filter(a => a.type === "SLOW_PICKUP").length;

  if (highScoreHighCancel > 0) {
    recommendations.push({
      title: "Taux d'annulation sous-pondéré ?",
      detail: `${highScoreHighCancel} livreur(s) ont un score élevé malgré un taux d'annulation > 30%. Le poids actuel (15 pts) pourrait être trop faible.`,
    });
  }
  if (highScoreSlowResponse > 0) {
    recommendations.push({
      title: "Délai de réponse sous-pondéré ?",
      detail: `${highScoreSlowResponse} livreur(s) ont un score élevé malgré un délai lent. Le poids actuel (15 pts) pourrait être insuffisant.`,
    });
  }
  if (confianceBreakdown.faible > withScores.length * 0.3 && withScores.length > 0) {
    recommendations.push({
      title: "Beaucoup de livreurs avec confiance faible",
      detail: `${confianceBreakdown.faible}/${withScores.length} livreurs ont peu de données. Le score moyen (${scoreMoyen}) est faussé. Attendre plus d'historique avant de valider les poids.`,
    });
  }
  if (highScoreNoDeliveries > 0) {
    recommendations.push({
      title: "Scores élevés sans livraison",
      detail: `${highScoreNoDeliveries} livreur(s) ont un score ≥ 70 sans aucune course livrée. Vérifier si les scores neutres (12.5 pts par défaut) ne gonflent pas artificiellement le score.`,
    });
  }
  if (slowPickup > 0) {
    recommendations.push({
      title: "Temps de récupération long",
      detail: `${slowPickup} livreur(s) ont un temps de récupération > 30 min. Ce critère n'est pas pondéré dans le score actuel — envisager l'ajouter si récurrent.`,
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      title: "Aucune anomalie majeure détectée",
      detail: "Les poids actuels (25/25/15/15/10/10) semblent cohérents avec les données terrain. Continuer l'observation.",
    });
  }

  return (
    <div className="space-y-5">
      {/* Banner mode observation */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-blue-900">Phase de calibration — ne pas modifier les poids</p>
          <p className="text-[11px] text-blue-700 mt-0.5">
            Vérification de la pertinence des 6 critères et de leurs poids sur les données réelles.
            Aucun impact sur le dispatch V2. Les recommandations ci-dessous sont indicatives.
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
          <p className="text-[10px] text-gray-400 mt-0.5">{withScores.length} livreur(s) calculé(s)</p>
        </div>
        {[
          { key: "excellent", label: "Excellent", color: "text-emerald-500" },
          { key: "bon", label: "Bon", color: "text-blue-500" },
          { key: "moyen", label: "Moyen", color: "text-amber-500" },
        ].map((stat) => (
          <div key={stat.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className={cn("w-4 h-4", stat.color)} />
              <span className="text-[10px] font-bold text-gray-400 uppercase">{stat.label}</span>
            </div>
            <p className="text-2xl font-black text-gray-900">{distribution[stat.key]}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">livreur(s)</p>
          </div>
        ))}
      </div>

      {/* Distribution visuelle */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Distribution des scores</p>
        <div className="flex items-end gap-2 h-32">
          {[
            { key: "excellent", label: "Excellent", color: "bg-emerald-500", range: "80-100" },
            { key: "bon", label: "Bon", color: "bg-blue-500", range: "60-79" },
            { key: "moyen", label: "Moyen", color: "bg-amber-500", range: "40-59" },
            { key: "faible", label: "Faible", color: "bg-red-500", range: "0-39" },
          ].map((bar) => {
            const count = distribution[bar.key];
            const maxCount = Math.max(...Object.values(distribution), 1);
            const height = (count / maxCount) * 100;
            return (
              <div key={bar.key} className="flex-1 flex flex-col items-center justify-end gap-1">
                <span className="text-[10px] font-bold text-gray-700">{count}</span>
                <div className={cn("w-full rounded-t-lg transition-all", bar.color)} style={{ height: `${Math.max(height, 4)}%` }} />
                <span className="text-[9px] text-gray-400 text-center">{bar.label}</span>
                <span className="text-[8px] text-gray-300">{bar.range}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confiance */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
          Confiance du score (volume de données)
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: "elevee", label: "Élevée", desc: "≥ 20 données", color: "text-emerald-500", bg: "bg-emerald-50", icon: Shield },
            { key: "moyenne", label: "Moyenne", desc: "5-19 données", color: "text-amber-500", bg: "bg-amber-50", icon: Clock },
            { key: "faible", label: "Faible", desc: "< 5 données", color: "text-red-500", bg: "bg-red-50", icon: AlertTriangle },
          ].map((c) => (
            <div key={c.key} className={cn("rounded-xl p-3 text-center border border-gray-100", c.bg)}>
              <c.icon className={cn("w-5 h-5 mx-auto mb-1", c.color)} />
              <p className="text-xl font-black text-gray-900">{confianceBreakdown[c.key]}</p>
              <p className="text-[10px] font-bold text-gray-600">{c.label}</p>
              <p className="text-[9px] text-gray-400">{c.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          Un nouveau livreur avec peu de données ne doit pas être jugé comme mauvais. La confiance indique la fiabilité du score.
        </p>
      </div>

      {/* TOP 10 */}
      <div>
        <div className="flex items-center gap-2 px-1 mb-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">TOP 10 — Meilleurs scores</p>
        </div>
        <div className="space-y-2">
          {top10.map((l, i) => (
            <LivreurScoreCard
              key={l.id}
              livreur={l}
              rank={i + 1}
              expanded={expandedId === l.id}
              onToggle={() => setExpandedId(expandedId === l.id ? null : l.id)}
            />
          ))}
          {top10.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">Aucun livreur avec score calculé. Cliquez sur "Recalculer".</p>
          )}
        </div>
      </div>

      {/* BOTTOM 10 */}
      <div>
        <div className="flex items-center gap-2 px-1 mb-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">BOTTOM 10 — Scores les plus bas</p>
        </div>
        <div className="space-y-2">
          {bottom10.map((l, i) => (
            <LivreurScoreCard
              key={l.id}
              livreur={l}
              rank={sorted.length - i}
              expanded={expandedId === l.id}
              onToggle={() => setExpandedId(expandedId === l.id ? null : l.id)}
            />
          ))}
          {bottom10.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">Aucun livreur avec score calculé. Cliquez sur "Recalculer".</p>
          )}
        </div>
      </div>

      {/* Anomalies détectées */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
            Anomalies détectées ({allAnomalies.length})
          </p>
        </div>
        {allAnomalies.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Aucune anomalie détectée</p>
        ) : (
          <div className="space-y-2">
            {allAnomalies.map((a, i) => {
              const config = ANOMALY_CONFIG[a.severity] || ANOMALY_CONFIG.warning;
              return (
                <div key={i} className={cn("flex items-start gap-2 rounded-xl border p-3", config.bg, config.border)}>
                  <config.icon className={cn("w-4 h-4 shrink-0 mt-0.5", config.text)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900">{a.livreur_nom} <span className="text-gray-400 font-normal">— Score: {a.score}</span></p>
                    <p className="text-[11px] text-gray-600">{a.message}</p>
                  </div>
                  <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0", config.bg, config.text)}>
                    {config.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recommandations d'ajustement des poids */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-blue-500" />
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
            Recommandations d'ajustement (indicatif — ne pas modifier)
          </p>
        </div>
        <div className="space-y-3">
          {recommendations.map((r, i) => (
            <div key={i} className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
              <p className="text-xs font-bold text-blue-900">{r.title}</p>
              <p className="text-[11px] text-blue-700 mt-0.5">{r.detail}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-3">
          Les poids actuels (25/25/15/15/10/10) ne sont pas modifiés. Ces recommandations seront évaluées après plusieurs semaines d'observation.
        </p>
      </div>

      {/* Bouton recalculer */}
      <Button
        onClick={onRecalc}
        disabled={isRecalculating}
        className="w-full h-12 rounded-2xl gap-2"
        variant="outline"
      >
        <RefreshCw className={cn("w-4 h-4", isRecalculating && "animate-spin")} />
        Recalculer tous les scores
      </Button>
    </div>
  );
}