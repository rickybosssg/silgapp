import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sparkles, Play, FileText, TrendingUp, TrendingDown, Clock, Zap, CheckCircle2, Building2, Bell, FlaskConical, ShieldCheck, Wrench, RefreshCw, Trash2, Palette } from "lucide-react";
import NeoScoreGrid from "@/components/neo/NeoScoreGrid";
import NeoRecommendationsList from "@/components/neo/NeoRecommendationsList";
import { toast } from "sonner";

// ── Imports ?raw : code source des pages clés pour analyse design ──
import clientAppCode from "@/pages/ClientExterneApp.jsx?raw";
import partenaireDashCode from "@/pages/PartenaireDashboard.jsx?raw";
import dashboardExtCode from "@/pages/DashboardExterne.jsx?raw";
import boutiqueDetailCode from "@/pages/BoutiqueDetail.jsx?raw";
import restaurantDetailCode from "@/pages/RestaurantDetail.jsx?raw";

export default function NeoDashboard() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all"); // "all" = à traiter (nouvelle + lue)
  const [analysing, setAnalysing] = useState(false);
  const [auditArchLoading, setAuditArchLoading] = useState(false);
  const [auditNotifLoading, setAuditNotifLoading] = useState(false);
  const [auditArchResult, setAuditArchResult] = useState(null);
  const [auditNotifResult, setAuditNotifResult] = useState(null);
  const [testsLoading, setTestsLoading] = useState(false);
  const [testsResult, setTestsResult] = useState(null);
  const [auditSecuLoading, setAuditSecuLoading] = useState(false);
  const [auditSecuResult, setAuditSecuResult] = useState(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceResult, setMaintenanceResult] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [nettoyageLoading, setNettoyageLoading] = useState(false);
  const [nettoyageResult, setNettoyageResult] = useState(null);
  const [designLoading, setDesignLoading] = useState(false);
  const [designResult, setDesignResult] = useState(null);

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
  const appliedCount = useMemo(() => recommendations.filter(r => r.statut === "appliquee").length, [recommendations]);
  const ignoredCount = useMemo(() => recommendations.filter(r => r.statut === "ignoree").length, [recommendations]);
  const resolutionRate = recommendations.length > 0 ? Math.round(appliedCount / recommendations.length * 100) : 0;

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

  // ─── Audit architecture ───
  const handleAuditArch = async () => {
    setAuditArchLoading(true);
    try {
      const res = await base44.functions.invoke("auditArchitecture", {});
      if (res?.data) {
        setAuditArchResult(res.data);
        toast.success("Audit architectural terminé");
      }
    } catch (err) {
      toast.error("Erreur audit architecture: " + (err?.message || ""));
    } finally {
      setAuditArchLoading(false);
    }
  };

  // ─── Audit notifications ───
  const handleAuditNotif = async () => {
    setAuditNotifLoading(true);
    try {
      const res = await base44.functions.invoke("auditerNotifications", { days: 7 });
      if (res?.data) {
        setAuditNotifResult(res.data);
        toast.success("Audit notifications terminé");
      }
    } catch (err) {
      toast.error("Erreur audit notifications: " + (err?.message || ""));
    } finally {
      setAuditNotifLoading(false);
    }
  };

  // ─── Lancer les tests automatisés ───
  const handleTests = async () => {
    setTestsLoading(true);
    try {
      const res = await base44.functions.invoke("lancerTestsAutomatises", {});
      if (res?.data) {
        setTestsResult(res.data);
        toast.success(res.data.resume);
      }
    } catch (err) {
      toast.error("Erreur tests automatisés: " + (err?.message || ""));
    } finally {
      setTestsLoading(false);
    }
  };

  // ─── Audit sécurité ───
  const handleAuditSecu = async () => {
    setAuditSecuLoading(true);
    try {
      const res = await base44.functions.invoke("auditSecurite", {});
      if (res?.data) {
        setAuditSecuResult(res.data);
        toast.success(`Audit sécurité terminé — Score: ${res.data.score_securite}/100`);
      }
    } catch (err) {
      toast.error("Erreur audit sécurité: " + (err?.message || ""));
    } finally {
      setAuditSecuLoading(false);
    }
  };

  // ─── Analyse design concret (avec code source réel) ───
  const handleAnalyseDesign = async () => {
    setDesignLoading(true);
    try {
      const snippets = [
        { filename: "ClientExterneApp.jsx", content: clientAppCode },
        { filename: "PartenaireDashboard.jsx", content: partenaireDashCode },
        { filename: "DashboardExterne.jsx", content: dashboardExtCode },
        { filename: "BoutiqueDetail.jsx", content: boutiqueDetailCode },
        { filename: "RestaurantDetail.jsx", content: restaurantDetailCode },
      ];
      const res = await base44.functions.invoke("neoAnalyseDesign", { snippets });
      if (res?.data?.success) {
        setDesignResult(res.data);
        toast.success(`${res.data.nb_recommandations} recommandation(s) design concrète(s) générée(s)`);
        queryClient.invalidateQueries({ queryKey: ["neo-recommendations"] });
      } else {
        toast.error(res?.data?.error || "Erreur analyse design");
      }
    } catch (err) {
      toast.error("Erreur: " + (err?.message || "inconnue"));
    } finally {
      setDesignLoading(false);
    }
  };

  // ─── Nettoyer tokens inactifs ───
  const handleNettoyageTokens = async () => {
    setNettoyageLoading(true);
    try {
      const res = await base44.functions.invoke("nettoyerTokensInactifs", {});
      if (res?.data) {
        setNettoyageResult(res.data);
        toast.success(res.data.resume);
      }
    } catch (err) {
      toast.error("Erreur nettoyage tokens: " + (err?.message || ""));
    } finally {
      setNettoyageLoading(false);
    }
  };

  // ─── Maintenance unifiée ───
  const handleMaintenance = async () => {
    setMaintenanceLoading(true);
    try {
      const res = await base44.functions.invoke("maintenanceUnifiee", { type: "all" });
      if (res?.data) {
        setMaintenanceResult(res.data);
        toast.success(res.data.resume);
      }
    } catch (err) {
      toast.error("Erreur maintenance: " + (err?.message || ""));
    } finally {
      setMaintenanceLoading(false);
    }
  };

  // ─── Sync unifiée ───
  const handleSync = async () => {
    setSyncLoading(true);
    try {
      const res = await base44.functions.invoke("syncUnifiee", { type: "all" });
      if (res?.data) {
        setSyncResult(res.data);
        toast.success(res.data.resume);
      }
    } catch (err) {
      toast.error("Erreur sync: " + (err?.message || ""));
    } finally {
      setSyncLoading(false);
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

          {/* Boutons d'audit */}
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleAuditArch}
              disabled={auditArchLoading}
              className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 text-white/80 font-medium text-xs flex items-center justify-center gap-2 hover:bg-white/10 disabled:opacity-50 transition-all"
            >
              {auditArchLoading ? (
                <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Audit en cours...</>
              ) : (
                <><Building2 className="w-3.5 h-3.5" /> Audit Architecture</>
              )}
            </button>
            <button
              onClick={handleAuditNotif}
              disabled={auditNotifLoading}
              className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 text-white/80 font-medium text-xs flex items-center justify-center gap-2 hover:bg-white/10 disabled:opacity-50 transition-all"
            >
              {auditNotifLoading ? (
                <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Audit en cours...</>
              ) : (
                <><Bell className="w-3.5 h-3.5" /> Audit Notifications</>
              )}
            </button>
          </div>

          {/* Bouton tests automatisés */}
          <button
            onClick={handleTests}
            disabled={testsLoading}
            className="w-full h-10 rounded-xl bg-white/5 border border-white/10 text-white/80 font-medium text-xs flex items-center justify-center gap-2 hover:bg-white/10 disabled:opacity-50 transition-all"
          >
            {testsLoading ? (
              <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Tests en cours...</>
            ) : (
              <><FlaskConical className="w-3.5 h-3.5" /> Lancer les tests automatisés</>
            )}
          </button>

          {/* Bouton audit sécurité */}
          <button
            onClick={handleAuditSecu}
            disabled={auditSecuLoading}
            className="w-full h-10 rounded-xl bg-white/5 border border-white/10 text-white/80 font-medium text-xs flex items-center justify-center gap-2 hover:bg-white/10 disabled:opacity-50 transition-all"
          >
            {auditSecuLoading ? (
              <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Audit en cours...</>
            ) : (
              <><ShieldCheck className="w-3.5 h-3.5" /> Audit Sécurité</>
            )}
          </button>

          {/* Bouton analyse design concret */}
          <button
            onClick={handleAnalyseDesign}
            disabled={designLoading}
            className="w-full h-10 rounded-xl bg-gradient-to-r from-fuchsia-500/20 to-purple-500/20 border border-fuchsia-400/30 text-fuchsia-200 font-medium text-xs flex items-center justify-center gap-2 hover:from-fuchsia-500/30 hover:to-purple-500/30 disabled:opacity-50 transition-all"
          >
            {designLoading ? (
              <><div className="w-3 h-3 border-2 border-fuchsia-400/30 border-t-fuchsia-400 rounded-full animate-spin" /> Analyse du code...</>
            ) : (
              <><Palette className="w-3.5 h-3.5" /> Analyse Design Concret (code source)</>
            )}
          </button>

          {/* Boutons maintenance & sync unifiées */}
          <div className="flex gap-2">
            <button
              onClick={handleMaintenance}
              disabled={maintenanceLoading}
              className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 text-white/80 font-medium text-xs flex items-center justify-center gap-2 hover:bg-white/10 disabled:opacity-50 transition-all"
            >
              {maintenanceLoading ? (
                <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> En cours...</>
              ) : (
                <><Wrench className="w-3.5 h-3.5" /> Maintenance Unifiée</>
              )}
            </button>
            <button
              onClick={handleSync}
              disabled={syncLoading}
              className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 text-white/80 font-medium text-xs flex items-center justify-center gap-2 hover:bg-white/10 disabled:opacity-50 transition-all"
            >
              {syncLoading ? (
                <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> En cours...</>
              ) : (
                <><RefreshCw className="w-3.5 h-3.5" /> Sync Unifiée</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ─── CONTENU ─── */}
      <div className="max-w-4xl mx-auto px-4 py-5 pb-28 space-y-6">
        {/* Résultat audit architecture */}
        {auditArchResult && (
          <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-slate-700" />
              <h3 className="font-bold text-gray-900 text-sm">Audit Architectural</h3>
              <button onClick={() => setAuditArchResult(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Fermer</button>
            </div>
            <p className="text-xs text-gray-500">{auditArchResult.resume}</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-lg font-black text-slate-900">{auditArchResult.stats.total_fonctions}</p>
                <p className="text-[10px] text-gray-500">Fonctions</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-lg font-black text-slate-900">{auditArchResult.stats.total_entites}</p>
                <p className="text-[10px] text-gray-500">Entités</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-lg font-black text-slate-900">{auditArchResult.recommandations?.length || 0}</p>
                <p className="text-[10px] text-gray-500">Recommandations</p>
              </div>
            </div>
            {auditArchResult.recommandations?.map((r, i) => (
              <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded " + (r.priorite === 'elevee' ? 'bg-red-100 text-red-700' : r.priorite === 'moyenne' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600')}>{r.priorite}</span>
                  <p className="text-xs font-bold text-gray-900">{r.titre}</p>
                </div>
                <p className="text-[11px] text-gray-600">{r.detail}</p>
              </div>
            ))}
          </div>
        )}

        {/* Résultat audit notifications */}
        {auditNotifResult && (
          <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-slate-700" />
              <h3 className="font-bold text-gray-900 text-sm">Audit Notifications ({auditNotifResult.periode_jours}j)</h3>
              <button onClick={() => setAuditNotifResult(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Fermer</button>
            </div>
            <p className="text-xs text-gray-500">{auditNotifResult.resume}</p>
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-lg font-black text-slate-900">{auditNotifResult.stats_globales.notifications_total}</p>
                <p className="text-[10px] text-gray-500">Notifs envoyées</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-lg font-black text-green-600">{auditNotifResult.stats_globales.taux_lecture}%</p>
                <p className="text-[10px] text-gray-500">Taux lecture</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-lg font-black text-blue-600">{auditNotifResult.stats_globales.taux_tokens_actifs}%</p>
                <p className="text-[10px] text-gray-500">Tokens actifs</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-lg font-black text-red-600">{auditNotifResult.stats_globales.taux_erreurs}%</p>
                <p className="text-[10px] text-gray-500">Taux erreurs</p>
              </div>
            </div>
            {auditNotifResult.recommandations?.length > 0 && (
              <div className="space-y-2">
                {auditNotifResult.recommandations.map((r, i) => (
                  <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded " + (r.priorite === 'elevee' ? 'bg-red-100 text-red-700' : r.priorite === 'moyenne' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600')}>{r.priorite}</span>
                      <p className="text-xs font-bold text-gray-900">{r.titre}</p>
                    </div>
                    <p className="text-[11px] text-gray-600">{r.detail}</p>
                    {r.titre.includes('tokens inactifs') && (
                      <button
                        onClick={handleNettoyageTokens}
                        disabled={nettoyageLoading}
                        className="mt-2 h-8 px-3 rounded-lg bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {nettoyageLoading ? (
                          <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Nettoyage...</>
                        ) : (
                          <><Trash2 className="w-3.5 h-3.5" /> Nettoyer maintenant</>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Résultat analyse design concret */}
        {designResult && (
          <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-fuchsia-600" />
              <h3 className="font-bold text-gray-900 text-sm">Analyse Design Concret</h3>
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-700">
                Score: {designResult.score_design}/100
              </span>
              <button onClick={() => setDesignResult(null)} className="text-xs text-gray-400 hover:text-gray-600">Fermer</button>
            </div>
            <p className="text-xs text-gray-500">{designResult.resume}</p>
            <p className="text-[10px] text-gray-400">Fichiers analysés: {designResult.fichiers_analyses?.join(", ")}</p>
            <div className="space-y-2">
              {designResult.recommandations?.map((r, i) => (
                <div key={i} className="rounded-lg border border-fuchsia-100 bg-fuchsia-50/50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded " + (r.priorite === 'critique' ? 'bg-red-100 text-red-700' : r.priorite === 'elevee' ? 'bg-orange-100 text-orange-700' : r.priorite === 'moyenne' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600')}>{r.priorite}</span>
                    <p className="text-xs font-bold text-gray-900">{r.titre}</p>
                  </div>
                  <p className="text-[10px] font-mono text-fuchsia-600 mb-1">📄 {r.fichier} → {r.section}</p>
                  <p className="text-[11px] text-gray-600 mb-1">⚠️ {r.probleme}</p>
                  <p className="text-[11px] text-emerald-700 font-medium">✓ {r.solution}</p>
                  <p className="text-[10px] text-blue-600 mt-1">→ {r.benefice}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Résultat nettoyage tokens */}
        {nettoyageResult && (
          <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-600" />
              <h3 className="font-bold text-gray-900 text-sm">Nettoyage Tokens Inactifs</h3>
              <button onClick={() => setNettoyageResult(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Fermer</button>
            </div>
            <p className="text-xs text-gray-500">{nettoyageResult.resume}</p>
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-sm font-black text-gray-900">{nettoyageResult.tokens_total_avant}</p>
                <p className="text-[10px] text-gray-500">Avant</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-sm font-black text-red-600">{nettoyageResult.tokens_supprimes}</p>
                <p className="text-[10px] text-gray-500">Supprimés</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-sm font-black text-amber-600">{nettoyageResult.tokens_desactives}</p>
                <p className="text-[10px] text-gray-500">Désactivés</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-sm font-black text-emerald-600">{nettoyageResult.taux_actif_apres}%</p>
                <p className="text-[10px] text-gray-500">Actifs</p>
              </div>
            </div>
          </div>
        )}

        {/* Résultat tests automatisés */}
        {testsResult && (
          <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-slate-700" />
              <h3 className="font-bold text-gray-900 text-sm">Tests Automatisés</h3>
              <span className={"ml-auto text-xs font-bold px-2 py-0.5 rounded-full " + (testsResult.taux_reussite >= 80 ? "bg-green-100 text-green-700" : testsResult.taux_reussite >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700")}>
                {testsResult.taux_reussite}%
              </span>
              <button onClick={() => setTestsResult(null)} className="text-xs text-gray-400 hover:text-gray-600">Fermer</button>
            </div>
            <p className="text-xs text-gray-500">{testsResult.resume}</p>
            <div className="space-y-1.5">
              {testsResult.tests?.map((t, i) => (
                <div key={i} className={"flex items-start gap-2 rounded-lg p-2.5 text-xs " + (t.statut === 'success' ? 'bg-green-50' : t.statut === 'warning' ? 'bg-amber-50' : 'bg-red-50')}>
                  <span className="text-base leading-none">{t.statut === 'success' ? '✅' : t.statut === 'warning' ? '⚠️' : '❌'}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{t.test}</p>
                    <p className="text-gray-500 mt-0.5">{t.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Résultat audit sécurité */}
        {auditSecuResult && (
          <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-slate-700" />
              <h3 className="font-bold text-gray-900 text-sm">Audit Sécurité</h3>
              <span className={"ml-auto text-xs font-bold px-2 py-0.5 rounded-full " + (auditSecuResult.score_securite >= 80 ? "bg-green-100 text-green-700" : auditSecuResult.score_securite >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700")}>
                Score: {auditSecuResult.score_securite}/100
              </span>
              <button onClick={() => setAuditSecuResult(null)} className="text-xs text-gray-400 hover:text-gray-600">Fermer</button>
            </div>
            <p className="text-xs text-gray-500">{auditSecuResult.resume}</p>
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-sm font-black text-red-600">{auditSecuResult.stats.fraudes_non_traitees}</p>
                <p className="text-[10px] text-gray-500">Fraudes</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-sm font-black text-orange-600">{auditSecuResult.stats.bugs_critiques}</p>
                <p className="text-[10px] text-gray-500">Bugs critiques</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-sm font-black text-amber-600">{auditSecuResult.stats.partenaires_non_valides}</p>
                <p className="text-[10px] text-gray-500">Non validés</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-sm font-black text-blue-600">{auditSecuResult.stats.multi_sessions}</p>
                <p className="text-[10px] text-gray-500">Multi-sessions</p>
              </div>
            </div>
            {auditSecuResult.findings?.length > 0 && (
              <div className="space-y-2">
                {auditSecuResult.findings.map((f, i) => (
                  <div key={i} className={"rounded-lg p-3 " + (f.priorite === 'critique' ? 'bg-red-50 border border-red-200' : f.priorite === 'elevee' ? 'bg-orange-50 border border-orange-200' : f.priorite === 'moyenne' ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200')}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded " + (f.priorite === 'critique' ? 'bg-red-100 text-red-700' : f.priorite === 'elevee' ? 'bg-orange-100 text-orange-700' : f.priorite === 'moyenne' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600')}>{f.priorite}</span>
                      <p className="text-xs font-bold text-gray-900">{f.titre}</p>
                    </div>
                    <p className="text-[11px] text-gray-600">{f.detail}</p>
                    <p className="text-[10px] text-blue-600 font-medium mt-1">→ {f.action}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Résultat maintenance unifiée */}
        {maintenanceResult && (
          <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-slate-700" />
              <h3 className="font-bold text-gray-900 text-sm">Maintenance Unifiée</h3>
              <button onClick={() => setMaintenanceResult(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Fermer</button>
            </div>
            <p className="text-xs text-gray-500">{maintenanceResult.resume}</p>
            <div className="space-y-1.5">
              {maintenanceResult.modules_executes?.map((m, i) => (
                <div key={i} className={"flex items-start gap-2 rounded-lg p-2.5 text-xs " + (m.success ? "bg-green-50" : "bg-red-50")}>
                  <span className="text-base leading-none">{m.success ? "✅" : "❌"}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{m.label}</p>
                    <p className="text-gray-500 mt-0.5">{m.detail || m.error}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Résultat sync unifiée */}
        {syncResult && (
          <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-slate-700" />
              <h3 className="font-bold text-gray-900 text-sm">Sync Unifiée</h3>
              <button onClick={() => setSyncResult(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Fermer</button>
            </div>
            <p className="text-xs text-gray-500">{syncResult.resume}</p>
            <div className="space-y-1.5">
              {syncResult.modules_executes?.map((m, i) => (
                <div key={i} className={"flex items-start gap-2 rounded-lg p-2.5 text-xs " + (m.success ? "bg-green-50" : "bg-red-50")}>
                  <span className="text-base leading-none">{m.success ? "✅" : "❌"}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{m.label}</p>
                    <p className="text-gray-500 mt-0.5">{m.detail || m.error}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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

            {/* Suivi des actions — taux de résolution */}
            {recommendations.length > 0 && (
              <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <h3 className="font-bold text-sm text-gray-900">Suivi des actions</h3>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="text-center">
                    <div className="text-xl font-black text-gray-900">{recommendations.length}</div>
                    <div className="text-[9px] text-gray-400 font-semibold uppercase">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-black text-blue-500">{newCount}</div>
                    <div className="text-[9px] text-gray-400 font-semibold uppercase">En attente</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-black text-emerald-500">{appliedCount}</div>
                    <div className="text-[9px] text-gray-400 font-semibold uppercase">Appliquées</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-black text-gray-400">{ignoredCount}</div>
                    <div className="text-[9px] text-gray-400 font-semibold uppercase">Ignorées</div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Taux de résolution</span>
                    <span className="text-xs font-black text-emerald-600">{resolutionRate}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all" style={{ width: `${resolutionRate}%` }} />
                  </div>
                </div>
              </div>
            )}

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