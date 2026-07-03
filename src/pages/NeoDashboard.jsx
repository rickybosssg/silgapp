import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sparkles, Play, FileText, TrendingUp, TrendingDown, Clock, Zap } from "lucide-react";
import NeoScoreGrid from "@/components/neo/NeoScoreGrid";
import NeoRecommendationsList from "@/components/neo/NeoRecommendationsList";
import { toast } from "sonner";

export default function NeoDashboard() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [analysing, setAnalysing] = useState(false);

  // ─── Dernière analyse ───
  const { data: analyses = [], isLoading: loadingAnalyses } = useQuery({
    queryKey: ["neo-analyses"],
    queryFn: () => base44.entities.NeoAnalyse.list("-date_analyse", 30),
    initialData: [],
    refetchInterval: 60000,
  });

  const latestAnalyse = analyses[0] || null;

  // ─── Recommandations ───
  const { data: recommendations = [], isLoading: loadingRecs } = useQuery({
    queryKey: ["neo-recommendations"],
    queryFn: () => base44.entities.NeoRecommendation.list("-created_date", 200),
    initialData: [],
    refetchInterval: 30000,
  });

  const newCount = useMemo(() => recommendations.filter(r => r.statut === "nouvelle").length, [recommendations]);

  // ─── Lancer une analyse ───
  const handleAnalyser = async () => {
    setAnalysing(true);
    try {
      const res = await base44.functions.invoke("neoAnalyse", { action: "analyser" });
      if (res?.data?.success) {
        toast.success(`Analyse terminée — Score: ${res.data.score_global}/100`);
        queryClient.invalidateQueries({ queryKey: ["neo-analyses"] });
        queryClient.invalidateQueries({ queryKey: ["neo-recommendations"] });
      } else {
        toast.error(res?.data?.error || "Erreur lors de l'analyse");
      }
    } catch (err) {
      toast.error("Erreur: " + (err?.message || "inconnue"));
    } finally {
      setAnalysing(false);
    }
  };

  // ─── Traiter une recommandation ───
  const handleRecAction = async (recId, statut) => {
    try {
      await base44.entities.NeoRecommendation.update(recId, {
        statut,
        date_traitement: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["neo-recommendations"] });
      toast.success(statut === "appliquee" ? "Recommandation marquée comme appliquée ✓" : "Recommandation ignorée");
    } catch (err) {
      toast.error("Erreur: " + (err?.message || "inconnue"));
    }
  };

  // ─── Marquer comme lues les recommandations affichées ───
  useEffect(() => {
    if (recommendations.length === 0) return;
    const nouvelles = recommendations.filter(r => r.statut === "nouvelle");
    if (nouvelles.length === 0) return;
    // Marquer comme lues après 3 secondes
    const timer = setTimeout(async () => {
      for (const rec of nouvelles.slice(0, 20)) {
        try {
          await base44.entities.NeoRecommendation.update(rec.id, { statut: "lue" });
        } catch (_) {}
      }
      queryClient.invalidateQueries({ queryKey: ["neo-recommendations"] });
    }, 3000);
    return () => clearTimeout(timer);
  }, [recommendations, queryClient]);

  // ─── Générer rapport PDF ───
  const handleGeneratePDF = async () => {
    if (!latestAnalyse) return;
    try {
      const scores = typeof latestAnalyse.scores_detail === "string"
        ? JSON.parse(latestAnalyse.scores_detail || "{}")
        : (latestAnalyse.scores_detail || {});

      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();

      // Header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 210, 40, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("NEO - Rapport SILGAPP", 14, 18);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Genere le ${new Date().toLocaleString("fr-FR")}`, 14, 28);

      // Score global
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`Score Global: ${latestAnalyse.score_global}/100`, 14, 55);

      // Scores detail
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      let y = 65;
      const scoreLabels = { design: "Design", ux: "UX", performance: "Performance", dispatch: "Dispatch", notifications: "Notifications", gps: "GPS", securite: "Securite", architecture: "Architecture" };
      Object.entries(scores).forEach(([key, val]) => {
        doc.text(`${scoreLabels[key] || key}: ${val}/100`, 14, y);
        y += 7;
      });

      // Resume
      y += 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Resume:", 14, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const resumeLines = doc.splitTextToSize(latestAnalyse.resume || "", 180);
      doc.text(resumeLines, 14, y);
      y += resumeLines.length * 5 + 5;

      // Recommendations
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`Recommandations (${recommendations.length}):`, 14, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);

      recommendations.slice(0, 30).forEach((rec, i) => {
        if (y > 270) { doc.addPage(); y = 20; }
        const priorityLabel = rec.priorite.toUpperCase();
        doc.setTextColor(rec.priorite === "critique" ? 220 : rec.priorite === "elevee" ? 200 : rec.priorite === "moyenne" ? 160 : 22, rec.priorite === "critique" ? 38 : rec.priorite === "elevee" ? 100 : rec.priorite === "moyenne" ? 160 : 163, rec.priorite === "critique" ? 38 : rec.priorite === "elevee" ? 22 : rec.priorite === "moyenne" ? 22 : 74);
        doc.setFont("helvetica", "bold");
        doc.text(`${i + 1}. [${priorityLabel}] ${rec.titre}`, 14, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        const probLines = doc.splitTextToSize(`Probleme: ${rec.probleme}`, 180);
        doc.text(probLines, 14, y);
        y += probLines.length * 4 + 2;
        const solLines = doc.splitTextToSize(`Solution: ${rec.solution}`, 180);
        doc.text(solLines, 14, y);
        y += solLines.length * 4 + 5;
      });

      doc.save(`NEO_Rapport_${new Date().toISOString().split("T")[0]}.pdf`);
      toast.success("Rapport PDF généré");
    } catch (err) {
      toast.error("Erreur génération PDF: " + (err?.message || ""));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ─── HERO ─── */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-5 py-6 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-white font-black text-xl tracking-tight">NEO</h1>
                <p className="text-white/40 text-xs">Moteur d'amélioration continue SILGAPP</p>
              </div>
            </div>
            {newCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/30">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-400 text-xs font-bold">{newCount} nouvelle(s)</span>
              </div>
            )}
          </div>

          {/* Boutons d'action */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAnalyser}
              disabled={analysing}
              className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/30 disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {analysing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyse en cours...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Lancer l'analyse NEO
                </>
              )}
            </button>
            <button
              onClick={handleGeneratePDF}
              disabled={!latestAnalyse}
              className="h-12 px-4 rounded-2xl bg-white/10 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/15 disabled:opacity-50 transition-all"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Rapport PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── CONTENU ─── */}
      <div className="max-w-4xl mx-auto px-4 py-5 pb-28 space-y-6">
        {/* État initial */}
        {!latestAnalyse && !analysing && (
          <div className="rounded-3xl bg-white border border-gray-100 p-8 text-center shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="font-bold text-gray-900 text-base mb-2">Aucune analyse disponible</h3>
            <p className="text-sm text-gray-500 mb-4">
              NEO n'a pas encore analysé SILGAPP. Lancez la première analyse pour obtenir un score et des recommandations.
            </p>
            <button
              onClick={handleAnalyser}
              className="h-11 px-6 rounded-xl bg-slate-900 text-white text-sm font-bold flex items-center gap-2 mx-auto hover:bg-slate-800 transition-colors"
            >
              <Zap className="w-4 h-4" />
              Lancer la première analyse
            </button>
          </div>
        )}

        {/* Analyse en cours */}
        {analysing && !latestAnalyse && (
          <div className="rounded-3xl bg-white border border-gray-100 p-8 text-center shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-cyan-100 flex items-center justify-center mx-auto mb-4">
              <div className="w-8 h-8 border-3 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
            </div>
            <p className="text-sm text-gray-600 font-medium">NEO analyse SILGAPP en cours...</p>
            <p className="text-xs text-gray-400 mt-1">Analyse du design, UX, performance, dispatch, sécurité et plus</p>
          </div>
        )}

        {/* Dernière analyse */}
        {latestAnalyse && (
          <>
            {/* Résumé */}
            <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500">
                  Dernière analyse: {new Date(latestAnalyse.date_analyse).toLocaleString("fr-FR")}
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{latestAnalyse.resume}</p>
            </div>

            {/* Scores */}
            <NeoScoreGrid scores={latestAnalyse.scores_detail} scoreGlobal={latestAnalyse.score_global} />

            {/* Évolution du score */}
            {analyses.length > 1 && (
              <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <h3 className="font-bold text-sm text-gray-900">Évolution du score</h3>
                </div>
                <div className="flex items-end gap-2 h-20">
                  {analyses.slice(0, 10).reverse().map((a, i) => {
                    const prev = i > 0 ? analyses.slice(0, 10).reverse()[i - 1]?.score_global : null;
                    const isUp = prev !== null && a.score_global > prev;
                    const isDown = prev !== null && a.score_global < prev;
                    return (
                      <div key={a.id} className="flex-1 flex flex-col items-center gap-1">
                        <div className="text-[9px] font-bold text-gray-500">{a.score_global}</div>
                        <div
                          className="w-full rounded-t-md bg-gradient-to-t from-slate-700 to-slate-900 transition-all"
                          style={{ height: `${Math.max(a.score_global * 0.6, 10)}%` }}
                        />
                        {isUp && <TrendingUp className="w-3 h-3 text-emerald-500" />}
                        {isDown && <TrendingDown className="w-3 h-3 text-red-500" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Recommandations */}
        {latestAnalyse && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-base text-gray-900">Recommandations</h3>
              <span className="text-xs text-gray-400">{recommendations.length} au total</span>
            </div>
            {loadingRecs ? (
              <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center">
                <p className="text-sm text-gray-400">Chargement...</p>
              </div>
            ) : (
              <NeoRecommendationsList
                recommendations={recommendations}
                onAction={handleRecAction}
                filter={filter}
                onFilterChange={setFilter}
              />
            )}
          </div>
        )}

        {/* Historique */}
        {analyses.length > 0 && (
          <div>
            <h3 className="font-black text-base text-gray-900 mb-3">Historique des analyses</h3>
            <div className="space-y-2">
              {analyses.slice(0, 10).map((a, i) => (
                <div key={a.id} className="rounded-xl bg-white border border-gray-100 p-3 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
                      a.score_global >= 90 ? "bg-emerald-100 text-emerald-600" :
                      a.score_global >= 75 ? "bg-cyan-100 text-cyan-600" :
                      a.score_global >= 60 ? "bg-amber-100 text-amber-600" :
                      "bg-red-100 text-red-600"
                    }`}>
                      {a.score_global}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-900">
                        {new Date(a.date_analyse).toLocaleDateString("fr-FR")} · {new Date(a.date_analyse).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {a.nb_recommandations} recommandation(s) · {a.nb_critique} critique(s)
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}