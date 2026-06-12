import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Shield, Play, Clock, CheckCircle2, AlertTriangle,
  XCircle, RefreshCw, ChevronDown, ChevronUp, Wrench,
  Bug, Zap, ClipboardList
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import DiagnosticPushPanel from "@/components/admin/DiagnosticPushPanel";

// ─── Helpers ────────────────────────────────────────────────────────────────

function SeverityBadge({ severity }) {
  const map = {
    haute:   "bg-red-100 text-red-700",
    moyenne: "bg-orange-100 text-orange-700",
    faible:  "bg-yellow-100 text-yellow-700",
  };
  return (
    <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full ${map[severity] || "bg-gray-100 text-gray-600"}`}>
      {severity?.toUpperCase()}
    </span>
  );
}

function parseJSON(str) {
  try { return JSON.parse(str || "[]"); } catch { return []; }
}

function nextScanTime() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
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

  const borderColor = hasCritical ? "border-red-100" : isOk ? "border-green-100" : "border-orange-100";
  const iconBg      = hasCritical ? "bg-red-100"    : isOk ? "bg-green-100"    : "bg-orange-100";
  const IconComp    = hasCritical ? AlertTriangle    : isOk ? CheckCircle2      : Shield;
  const iconColor   = hasCritical ? "text-red-600"  : isOk ? "text-green-600"  : "text-orange-600";

  return (
    <div className={`rounded-2xl border ${borderColor} overflow-hidden bg-white transition-all`}>
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
            <IconComp className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-gray-900">
              {format(new Date(rapport.date_scan), "EEEE d MMM yyyy · HH:mm", { locale: fr })}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {rapport.declenchement === "manuel" ? "🖱️ Manuel" : "⏰ Auto"} · {rapport.duree_secondes || 0}s
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {rapport.bugs_trouves > 0 && (
            <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
              {rapport.bugs_trouves} bug{rapport.bugs_trouves > 1 ? "s" : ""}
            </span>
          )}
          {rapport.corrections_appliquees > 0 && (
            <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              {rapport.corrections_appliquees} corr.
            </span>
          )}
          {isOk && (
            <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✅ OK</span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-gray-300 ml-1" /> : <ChevronDown className="w-4 h-4 text-gray-300 ml-1" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50/80 p-4 space-y-4">
          {/* Stats mini */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Bugs",        val: rapport.bugs_trouves,            bg: "bg-red-50",    text: "text-red-600" },
              { label: "Corrections", val: rapport.corrections_appliquees,  bg: "bg-green-50",  text: "text-green-600" },
              { label: "Critiques",   val: rapport.erreurs_critiques,       bg: "bg-orange-50", text: "text-orange-600" },
              { label: "Admin req.",  val: rapport.elements_non_corriges,   bg: "bg-blue-50",   text: "text-blue-600" },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl p-2.5 text-center`}>
                <p className={`text-lg font-black ${s.text}`}>{s.val || 0}</p>
                <p className="text-[9px] text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Bugs */}
          {bugs.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Bug className="w-3 h-3" /> Problèmes détectés
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {bugs.map((b, i) => (
                  <div key={i} className="flex items-start gap-2 bg-white rounded-xl p-2.5 border border-gray-100">
                    <SeverityBadge severity={b.severity} />
                    <div className="flex-1">
                      <p className="text-[11px] text-gray-700">{b.detail}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{b.categorie}</p>
                    </div>
                    {b.auto_fixable && (
                      <span className="text-[10px] text-green-600 font-black bg-green-50 px-1.5 py-0.5 rounded-full">AUTO</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Corrections */}
          {corrections.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-green-600" /> Corrections appliquées
              </p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {corrections.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 bg-green-50 rounded-xl p-2 border border-green-100">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                    <p className="text-[11px] text-green-800">{c.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommandations */}
          {recommandations.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <ClipboardList className="w-3 h-3 text-blue-600" /> Actions admin requises
              </p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {recommandations.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 bg-blue-50 rounded-xl p-2.5 border border-blue-100">
                    <AlertTriangle className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-bold text-blue-800">{r.action}</p>
                      <p className="text-[10px] text-blue-500">{r.detail}</p>
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
              <p className="text-xs text-gray-400">SILGAPP est en bonne santé 🎉</p>
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
  const [retrocorr, setRetrocorr] = useState(false);
  const [retrocorrResult, setRetrocorrResult] = useState(null);
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

  const statusSante = !dernierRapport ? null
    : dernierRapport.erreurs_critiques > 0 ? "critique"
    : dernierRapport.bugs_trouves === 0 ? "ok"
    : "warning";

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto pb-10">

      {/* ── HERO HEADER ──────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900 p-5 shadow-xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full" />
          <div className="absolute -bottom-12 -left-6 w-56 h-56 bg-white rounded-full" />
        </div>
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Maintenance SILGAPP</h1>
              <p className="text-white/60 text-xs mt-0.5">Contrôle automatique · scan quotidien à 00h00</p>
            </div>
          </div>
          {statusSante && (
            <div className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
              statusSante === "ok"       ? "bg-green-500/20 border-green-400/30 text-green-300" :
              statusSante === "critique" ? "bg-red-500/20 border-red-400/30 text-red-300" :
                                           "bg-orange-500/20 border-orange-400/30 text-orange-300"
            }`}>
              {statusSante === "ok" ? "✅ OK" : statusSante === "critique" ? "⚠️ CRITIQUE" : "🔧 AVERTISSEMENT"}
            </div>
          )}
        </div>
      </div>

      {/* ── CARDS STATUS ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Dernier scan</p>
          </div>
          {dernierRapport ? (
            <>
              <p className="text-sm font-black text-foreground">
                {format(new Date(dernierRapport.date_scan), "d MMM · HH:mm", { locale: fr })}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {dernierRapport.bugs_trouves || 0} bug(s) · {dernierRapport.corrections_appliquees || 0} corr.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Jamais lancé</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center">
              <RefreshCw className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Prochain scan</p>
          </div>
          <p className="text-sm font-black text-foreground">
            {format(prochainScan, "d MMM · HH:mm", { locale: fr })}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Automatique (00h00)</p>
        </div>
      </div>

      {/* ── ÉTAT DE SANTÉ ────────────────────────────── */}
      {dernierRapport && (
        <div className={`rounded-2xl border p-4 ${
          statusSante === "critique" ? "border-red-100 bg-red-50/40" :
          statusSante === "ok"       ? "border-green-100 bg-green-50/40" :
                                       "border-orange-100 bg-orange-50/40"
        }`}>
          <div className="flex items-center gap-2.5 mb-2">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              statusSante === "critique" ? "bg-red-100" : statusSante === "ok" ? "bg-green-100" : "bg-orange-100"
            }`}>
              {statusSante === "critique" ? <AlertTriangle className="w-4 h-4 text-red-600" /> :
               statusSante === "ok"       ? <CheckCircle2  className="w-4 h-4 text-green-600" /> :
                                            <Wrench        className="w-4 h-4 text-orange-600" />}
            </div>
            <p className="font-black text-sm text-foreground">
              {statusSante === "critique"
                ? `⚠️ ${dernierRapport.erreurs_critiques} erreur(s) critique(s) !`
                : statusSante === "ok"
                ? "✅ SILGAPP est en bonne santé"
                : `🔧 ${dernierRapport.bugs_trouves} problème(s) — ${dernierRapport.corrections_appliquees} corrigé(s)`}
            </p>
          </div>
          {dernierRapport.resume && (
            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-white/80 rounded-xl p-3 border border-gray-100">
              {dernierRapport.resume}
            </pre>
          )}
        </div>
      )}

      {/* ── BOUTON SCAN ──────────────────────────────── */}
      <button
        onClick={lancerScan}
        disabled={scanning}
        className="w-full h-14 rounded-2xl font-black text-base flex items-center justify-center gap-2.5 transition-all shadow-lg
          bg-gradient-to-r from-primary to-red-600 text-white hover:opacity-90 disabled:opacity-60"
      >
        {scanning ? (
          <><RefreshCw className="w-5 h-5 animate-spin" />Scan en cours...</>
        ) : (
          <><Play className="w-5 h-5" />Lancer le scan maintenant</>
        )}
      </button>

      {/* ── RÉTRO-CORRECTION ─────────────────────────── */}
      <div className="rounded-2xl border border-orange-100 bg-orange-50/30 p-4">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
            <Zap className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <p className="font-black text-sm text-orange-900">Rétro-correction des prix manquants</p>
            <p className="text-[11px] text-orange-600">Recalcule <code>prix_final</code>, <code>montant_livreur</code>, <code>commission_silga</code></p>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full border-orange-200 text-orange-700 hover:bg-orange-100 gap-2 rounded-xl"
          disabled={retrocorr}
          onClick={async () => {
            setRetrocorr(true);
            setRetrocorrResult(null);
            try {
              const res = await base44.functions.invoke("retroCorrigerCourses", {});
              setRetrocorrResult(res.data);
            } catch (e) {
              setRetrocorrResult({ success: false, error: e.message });
            } finally {
              setRetrocorr(false);
            }
          }}
        >
          {retrocorr
            ? <><RefreshCw className="w-4 h-4 animate-spin" />Correction en cours...</>
            : <><Wrench className="w-4 h-4" />Corriger les prix manquants</>}
        </Button>
        {retrocorrResult && (
          <div className={`mt-3 p-3 rounded-xl text-xs ${retrocorrResult.success ? "bg-green-50 border border-green-100 text-green-800" : "bg-red-50 border border-red-100 text-red-700"}`}>
            {retrocorrResult.success ? (
              <>
                <p className="font-bold mb-1">✅ {retrocorrResult.corrigees} course(s) corrigée(s) sur {retrocorrResult.sans_prix}</p>
                {retrocorrResult.details?.map((d, i) => (
                  <p key={i} className="text-[10px] text-green-700">#{d.id} · {d.distance} km · {d.prix} F · source: {d.source}</p>
                ))}
              </>
            ) : (
              <p>❌ {retrocorrResult.error}</p>
            )}
          </div>
        )}
      </div>

      {/* ── RÉSULTAT SCAN MANUEL ─────────────────────── */}
      {scanResult && (
        <div className={`rounded-2xl border p-4 ${scanResult.success ? "border-green-100 bg-green-50/40" : "border-red-100 bg-red-50/40"}`}>
          <div className="flex items-center gap-2.5 mb-2">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${scanResult.success ? "bg-green-100" : "bg-red-100"}`}>
              {scanResult.success
                ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                : <XCircle      className="w-4 h-4 text-red-600" />}
            </div>
            <p className="font-black text-sm">{scanResult.success ? "Scan terminé avec succès" : "Erreur lors du scan"}</p>
          </div>
          {scanResult.success ? (
            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-white/80 rounded-xl p-3 border border-gray-100">
              {scanResult.resume}
            </pre>
          ) : (
            <p className="text-xs text-red-700">{scanResult.error}</p>
          )}
        </div>
      )}

      {/* ── DIAGNOSTIC PUSH ──────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <DiagnosticPushPanel />
      </div>

      {/* ── HISTORIQUE ───────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
            <ClipboardList className="w-4 h-4 text-gray-500" />
          </div>
          <p className="font-black text-sm text-foreground">
            Historique des rapports <span className="text-muted-foreground font-normal">({rapports.length})</span>
          </p>
        </div>

        {isLoading && (
          <div className="text-center py-8 text-muted-foreground text-sm">Chargement...</div>
        )}

        {!isLoading && rapports.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Shield className="w-6 h-6 text-gray-300" />
            </div>
            <p className="font-bold text-foreground">Aucun rapport encore</p>
            <p className="text-sm text-muted-foreground mt-1">Lancez le premier scan ci-dessus</p>
          </div>
        )}

        <div className="space-y-3">
          {rapports.map(r => <RapportDetail key={r.id} rapport={r} />)}
        </div>
      </div>
    </div>
  );
}