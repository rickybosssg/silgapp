import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield, Play, Clock, CheckCircle2, AlertTriangle,
  XCircle, RefreshCw, ChevronDown, ChevronUp, Wrench,
  Bug, Zap, ClipboardList
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// ─── Helpers ────────────────────────────────────────────────────────────────

function SeverityBadge({ severity }) {
  const map = {
    haute: "bg-red-100 text-red-700",
    moyenne: "bg-orange-100 text-orange-700",
    faible: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${map[severity] || "bg-gray-100 text-gray-600"}`}>
      {severity?.toUpperCase()}
    </span>
  );
}

function parseJSON(str) {
  try { return JSON.parse(str || "[]"); } catch { return []; }
}

function nextScanTime() {
  const now = new Date();
  const next = new Date();
  next.setDate(now.getDate() + (now.getHours() >= 0 ? 1 : 0));
  next.setHours(0, 0, 0, 0);
  return next;
}

// ─── Rapport Detail ─────────────────────────────────────────────────────────

function RapportDetail({ rapport }) {
  const [open, setOpen] = useState(false);
  const bugs = parseJSON(rapport.details_bugs);
  const corrections = parseJSON(rapport.details_corrections);
  const recommandations = parseJSON(rapport.actions_recommandees);

  const isOk = rapport.bugs_trouves === 0;
  const hasCritical = rapport.erreurs_critiques > 0;

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all ${
      hasCritical ? "border-red-200" : isOk ? "border-green-200" : "border-orange-200"
    }`}>
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            hasCritical ? "bg-red-100" : isOk ? "bg-green-100" : "bg-orange-100"
          }`}>
            {hasCritical ? <AlertTriangle className="w-5 h-5 text-red-600" /> :
             isOk ? <CheckCircle2 className="w-5 h-5 text-green-600" /> :
             <Shield className="w-5 h-5 text-orange-600" />}
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-gray-900">
              {format(new Date(rapport.date_scan), "EEEE d MMM yyyy — HH:mm", { locale: fr })}
            </p>
            <p className="text-xs text-gray-500">
              {rapport.declenchement === "manuel" ? "🖱️ Manuel" : "⏰ Auto"} · {rapport.duree_secondes || 0}s
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            {rapport.bugs_trouves > 0 && (
              <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                {rapport.bugs_trouves} bug{rapport.bugs_trouves > 1 ? "s" : ""}
              </span>
            )}
            {rapport.corrections_appliquees > 0 && (
              <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                {rapport.corrections_appliquees} corr.
              </span>
            )}
            {isOk && (
              <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✅ OK</span>
            )}
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Detail */}
      {open && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Bugs", val: rapport.bugs_trouves, color: "text-red-600", bg: "bg-red-50" },
              { label: "Corrections", val: rapport.corrections_appliquees, color: "text-green-600", bg: "bg-green-50" },
              { label: "Critiques", val: rapport.erreurs_critiques, color: "text-orange-600", bg: "bg-orange-50" },
              { label: "Admin requis", val: rapport.elements_non_corriges, color: "text-blue-600", bg: "bg-blue-50" },
            ].map((s) => (
              <div key={s.label} className={`${s.bg} rounded-xl p-2.5 text-center`}>
                <p className={`text-lg font-black ${s.color}`}>{s.val || 0}</p>
                <p className="text-[10px] text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Bugs */}
          {bugs.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase mb-2 flex items-center gap-1">
                <Bug className="w-3.5 h-3.5" /> Problèmes détectés
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {bugs.map((b, i) => (
                  <div key={i} className="flex items-start gap-2 bg-white rounded-lg p-2.5 border border-gray-200">
                    <SeverityBadge severity={b.severity} />
                    <div className="flex-1">
                      <p className="text-[11px] text-gray-700">{b.detail}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{b.categorie}</p>
                    </div>
                    {b.auto_fixable && (
                      <span className="text-[10px] text-green-600 font-bold bg-green-50 px-1.5 py-0.5 rounded">AUTO</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Corrections */}
          {corrections.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase mb-2 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-green-600" /> Corrections appliquées
              </p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {corrections.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 bg-green-50 rounded-lg p-2 border border-green-100">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                    <p className="text-[11px] text-green-800">{c.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommandations admin */}
          {recommandations.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase mb-2 flex items-center gap-1">
                <ClipboardList className="w-3.5 h-3.5 text-blue-600" /> Actions admin recommandées
              </p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {recommandations.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 bg-blue-50 rounded-lg p-2 border border-blue-100">
                    <AlertTriangle className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-bold text-blue-800">{r.action}</p>
                      <p className="text-[10px] text-blue-600">{r.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bugs.length === 0 && (
            <div className="text-center py-4">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-bold text-green-700">Aucun problème détecté</p>
              <p className="text-xs text-gray-400">SILGAPP est en bonne santé</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────

export default function Maintenance() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const queryClient = useQueryClient();

  const { data: rapports = [], isLoading } = useQuery({
    queryKey: ["rapports-maintenance"],
    queryFn: () => base44.entities.RapportMaintenance.list("-date_scan", 30),
    refetchInterval: 30000,
  });

  const dernierRapport = rapports[0] || null;
  const prochainScan = nextScanTime();

  const lancerScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await base44.functions.invoke("maintenanceNuit", { mode: "manuel" });
      setScanResult(res.data);
      queryClient.invalidateQueries({ queryKey: ["rapports-maintenance"] });
    } catch (e) {
      setScanResult({ success: false, error: e.message });
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-foreground">Maintenance SILGAPP</h1>
          <p className="text-sm text-muted-foreground">Contrôle automatique quotidien</p>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Dernier scan */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase">Dernier scan</p>
          </div>
          {dernierRapport ? (
            <>
              <p className="text-sm font-bold text-foreground">
                {format(new Date(dernierRapport.date_scan), "d MMM à HH:mm", { locale: fr })}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {dernierRapport.bugs_trouves || 0} bug(s) · {dernierRapport.corrections_appliquees || 0} corr.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Jamais lancé</p>
          )}
        </Card>

        {/* Prochain scan */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase">Prochain scan</p>
          </div>
          <p className="text-sm font-bold text-foreground">
            {format(prochainScan, "d MMM à HH:mm", { locale: fr })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Automatique (00h00)</p>
        </Card>
      </div>

      {/* Stats globales */}
      {dernierRapport && (
        <Card className={`p-4 border-2 ${
          dernierRapport.erreurs_critiques > 0 ? "border-red-200 bg-red-50/30" :
          dernierRapport.bugs_trouves === 0 ? "border-green-200 bg-green-50/30" :
          "border-orange-200 bg-orange-50/30"
        }`}>
          <div className="flex items-center gap-2 mb-3">
            {dernierRapport.erreurs_critiques > 0 ? (
              <AlertTriangle className="w-5 h-5 text-red-600" />
            ) : dernierRapport.bugs_trouves === 0 ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <Wrench className="w-5 h-5 text-orange-600" />
            )}
            <p className="font-bold text-foreground">
              {dernierRapport.erreurs_critiques > 0
                ? `⚠️ ${dernierRapport.erreurs_critiques} erreur(s) critique(s) !`
                : dernierRapport.bugs_trouves === 0
                ? "✅ SILGAPP est en bonne santé"
                : `🔧 ${dernierRapport.bugs_trouves} problème(s) — ${dernierRapport.corrections_appliquees} corrigé(s)`
              }
            </p>
          </div>
          {dernierRapport.resume && (
            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-white/80 rounded-xl p-3">
              {dernierRapport.resume}
            </pre>
          )}
        </Card>
      )}

      {/* Bouton scan manuel */}
      <Button
        onClick={lancerScan}
        disabled={scanning}
        className="w-full h-12 font-bold text-base rounded-2xl gap-2"
      >
        {scanning ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            Scan en cours...
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Lancer le scan maintenant
          </>
        )}
      </Button>

      {/* Résultat du scan manuel */}
      {scanResult && (
        <Card className={`p-4 border-2 ${scanResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
          <div className="flex items-center gap-2 mb-2">
            {scanResult.success
              ? <CheckCircle2 className="w-5 h-5 text-green-600" />
              : <XCircle className="w-5 h-5 text-red-600" />}
            <p className="font-bold text-sm">
              {scanResult.success ? "Scan terminé" : "Erreur scan"}
            </p>
          </div>
          {scanResult.success ? (
            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono">
              {scanResult.resume}
            </pre>
          ) : (
            <p className="text-xs text-red-700">{scanResult.error}</p>
          )}
        </Card>
      )}

      {/* Historique */}
      <div>
        <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <ClipboardList className="w-4 h-4" />
          Historique des rapports ({rapports.length})
        </p>

        {isLoading && (
          <div className="text-center py-8 text-muted-foreground text-sm">Chargement...</div>
        )}

        {!isLoading && rapports.length === 0 && (
          <Card className="p-8 text-center">
            <Shield className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-bold text-foreground">Aucun rapport encore</p>
            <p className="text-sm text-muted-foreground mt-1">Lancez le premier scan ci-dessus</p>
          </Card>
        )}

        <div className="space-y-3">
          {rapports.map((r) => (
            <RapportDetail key={r.id} rapport={r} />
          ))}
        </div>
      </div>
    </div>
  );
}