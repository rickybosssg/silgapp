import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Zap, Pause, Play, FlaskConical, Settings, Users, TrendingUp,
  ChevronRight, Loader2, Power, AlertTriangle, CheckCircle2,
} from "lucide-react";

export default function ReactivationAutoPanel() {
  const queryClient = useQueryClient();
  const [showConfig, setShowConfig] = useState(false);
  const [showTestPhones, setShowTestPhones] = useState(false);

  // ── Configuration du moteur ──
  const { data: config, refetch: refetchConfig } = useQuery({
    queryKey: ["reactivation-auto-config"],
    queryFn: async () => {
      const res = await base44.functions.invoke("configurerReactivationAuto", { action: "get_config" });
      return res.data;
    },
  });

  // ── Stats des scénarios ──
  const { data: scenarioStats, refetch: refetchStats } = useQuery({
    queryKey: ["reactivation-scenario-stats"],
    queryFn: async () => {
      const res = await base44.functions.invoke("configurerReactivationAuto", {
        action: "get_scenario_stats",
        campaign_id: config?.campaign_id || null,
      });
      return res.data;
    },
    enabled: !!config?.campaign_id,
    refetchInterval: 30000,
  });

  // ── Mutations ──
  const toggleEngine = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("configurerReactivationAuto", { action: "toggle_engine" });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.enabled ? "Moteur activé" : "Moteur désactivé");
      refetchConfig();
    },
  });

  const togglePause = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("configurerReactivationAuto", { action: "toggle_pause" });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.paused ? "Moteur en pause" : "Moteur repris");
      refetchConfig();
    },
  });

  const toggleTestMode = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("configurerReactivationAuto", { action: "toggle_test_mode" });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.testMode ? "Mode test activé" : "Mode test désactivé");
      refetchConfig();
    },
  });

  const initCampaign = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("configurerReactivationAuto", { action: "init_campaign" });
      return res.data;
    },
    onSuccess: () => {
      toast.success("Campagne automatique initialisée");
      refetchConfig();
      queryClient.invalidateQueries({ queryKey: ["reactivation-scenario-stats"] });
    },
  });

  const runNow = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("moteurReactivationAuto?manual=true");
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Exécuté: ${data.new_scenarios || 0} nouveaux scénarios, ${data.converted || 0} conversions, ${data.j2_sent || 0} J+2, ${data.j5_sent || 0} J+5`);
      refetchStats();
    },
    onError: (err) => toast.error("Erreur: " + (err.message || "échec")),
  });

  // ── États d'affichage ──
  const isEnabled = config?.enabled;
  const isPaused = config?.paused;
  const isTestMode = config?.testMode;
  const hasCampaign = !!config?.campaign_id;

  return (
    <div className="space-y-3">
      {/* ── Header avec statut du moteur ── */}
      <div className={`rounded-2xl border p-4 ${isEnabled ? (isPaused ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200') : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isEnabled ? (isPaused ? 'bg-amber-500' : 'bg-green-500') : 'bg-slate-400'}`}>
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-black text-sm text-slate-900">Moteur Automatique J0/J+2/J+5</p>
              <p className="text-[11px] text-slate-500">
                {isEnabled ? (isPaused ? 'En pause' : isTestMode ? 'Mode test actif' : 'Actif') : 'Désactivé'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasCampaign ? (
              <>
                <button
                  onClick={() => toggleEngine.mutate()}
                  disabled={toggleEngine.isPending}
                  className={`h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 ${isEnabled ? 'bg-red-500 text-white' : 'bg-green-600 text-white'}`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {isEnabled ? 'Arrêter' : 'Démarrer'}
                </button>
                {isEnabled && (
                  <button
                    onClick={() => togglePause.mutate()}
                    disabled={togglePause.isPending}
                    className="h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-slate-200 text-slate-700"
                  >
                    {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    {isPaused ? 'Reprendre' : 'Pause'}
                  </button>
                )}
                <button
                  onClick={() => runNow.mutate()}
                  disabled={runNow.isPending || !isEnabled}
                  className="h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-blue-600 text-white"
                >
                  {runNow.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  Exécuter
                </button>
              </>
            ) : (
              <button
                onClick={() => initCampaign.mutate()}
                disabled={initCampaign.isPending}
                className="h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-blue-600 text-white"
              >
                {initCampaign.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Settings className="w-3.5 h-3.5" />}
                Initialiser
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Alerte mode test ── */}
      {isTestMode && (
        <div className="rounded-xl bg-purple-50 border border-purple-200 p-3 flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-purple-600 flex-shrink-0" />
          <p className="text-[11px] font-bold text-purple-700">
            MODE TEST activé — seuls les téléphones de test recevront des pushes. Aucun vrai client ne sera notifié.
          </p>
          <button
            onClick={() => toggleTestMode.mutate()}
            disabled={toggleTestMode.isPending}
            className="ml-auto h-7 px-2 rounded-lg bg-purple-600 text-white text-[10px] font-bold"
          >
            Désactiver
          </button>
        </div>
      )}

      {/* ── Boutons de configuration rapide ── */}
      {hasCampaign && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="h-8 px-3 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 flex items-center gap-1.5"
          >
            <Settings className="w-3 h-3" /> Config messages
          </button>
          <button
            onClick={() => setShowTestPhones(!showTestPhones)}
            className={`h-8 px-3 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 ${isTestMode ? 'bg-purple-600 text-white border-purple-600' : 'bg-white border-slate-200 text-slate-700'}`}
          >
            <FlaskConical className="w-3 h-3" /> {isTestMode ? 'Mode test ON' : 'Mode test'}
          </button>
        </div>
      )}

      {/* ── Panneau de configuration des messages ── */}
      {showConfig && hasCampaign && (
        <MessageConfigPanel config={config} campaignId={config.campaign_id} onClose={() => setShowConfig(false)} onSaved={refetchConfig} />
      )}

      {/* ── Panneau téléphones de test ── */}
      {showTestPhones && (
        <TestPhonesPanel phones={config?.testPhones || []} onToggleTestMode={() => toggleTestMode.mutate()} isTestMode={isTestMode} />
      )}

      {/* ── Stats des scénarios ── */}
      {scenarioStats && (
        <ScenarioStatsPanel stats={scenarioStats} />
      )}
    </div>
  );
}

// ── Panneau de configuration des messages J0/J+2/J+5 ──────────────────────

function MessageConfigPanel({ config, campaignId, onClose, onSaved }) {
  const [messages, setMessages] = useState(config?.messages || {});
  const [titles, setTitles] = useState(config?.titles || {});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke("configurerReactivationAuto", {
        action: "set_config",
        config: {
          REACTIVATION_J0_MESSAGE_A: messages.j0_a || '',
          REACTIVATION_J0_MESSAGE_B: messages.j0_b || '',
          REACTIVATION_J2_MESSAGE_A: messages.j2_a || '',
          REACTIVATION_J2_MESSAGE_B: messages.j2_b || '',
          REACTIVATION_J5_MESSAGE_A: messages.j5_a || '',
          REACTIVATION_J5_MESSAGE_B: messages.j5_b || '',
          REACTIVATION_J0_TITLE: titles.j0 || '',
          REACTIVATION_J2_TITLE: titles.j2 || '',
          REACTIVATION_J5_TITLE: titles.j5 || '',
        },
      });
      toast.success("Messages enregistrés");
      onSaved();
      onClose();
    } catch (err) {
      toast.error("Erreur: " + (err.message || "échec"));
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { key: 'j0', label: 'J0 — Rappel', color: 'blue' },
    { key: 'j2', label: 'J+2 — Relance', color: 'amber' },
    { key: 'j5', label: 'J+5 — Réactivation forte', color: 'red' },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black text-slate-800">Messages J0 / J+2 / J+5 (A/B)</p>
        <button onClick={onClose} className="text-slate-400 text-sm">✕</button>
      </div>

      {steps.map(step => (
        <div key={step.key} className="rounded-xl bg-slate-50 p-3 space-y-2">
          <p className="text-[11px] font-black text-slate-700">{step.label}</p>
          <input
            value={titles[step.key] || ''}
            onChange={(e) => setTitles(prev => ({ ...prev, [step.key]: e.target.value }))}
            placeholder={`Titre ${step.label}`}
            className="w-full h-8 rounded-lg border border-slate-200 px-2 text-xs font-semibold bg-white"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-purple-600">Variante A</label>
              <textarea
                value={messages[`${step.key}_a`] || ''}
                onChange={(e) => setMessages(prev => ({ ...prev, [`${step.key}_a`]: e.target.value }))}
                placeholder="Message variante A"
                rows={2}
                className="w-full rounded-lg border border-purple-200 px-2 py-1 text-xs bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-purple-600">Variante B</label>
              <textarea
                value={messages[`${step.key}_b`] || ''}
                onChange={(e) => setMessages(prev => ({ ...prev, [`${step.key}_b`]: e.target.value }))}
                placeholder="Message variante B"
                rows={2}
                className="w-full rounded-lg border border-purple-200 px-2 py-1 text-xs bg-white"
              />
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-10 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
        Enregistrer
      </button>
    </div>
  );
}

// ── Panneau téléphones de test ─────────────────────────────────────────────

function TestPhonesPanel({ phones, isTestMode, onToggleTestMode }) {
  const [phoneInput, setPhoneInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState(phones);

  const addPhone = () => {
    if (!phoneInput.trim()) return;
    setList(prev => [...prev, phoneInput.trim()]);
    setPhoneInput('');
  };

  const removePhone = (idx) => {
    setList(prev => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke("configurerReactivationAuto", {
        action: "set_test_phones",
        phones: list,
      });
      toast.success("Téléphones de test enregistrés");
    } catch (err) {
      toast.error("Erreur: " + (err.message || "échec"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black text-purple-800 flex items-center gap-1.5">
          <FlaskConical className="w-3.5 h-3.5" /> Téléphones de test
        </p>
        <button
          onClick={onToggleTestMode}
          className={`h-7 px-2 rounded-lg text-[10px] font-bold ${isTestMode ? 'bg-red-500 text-white' : 'bg-purple-600 text-white'}`}
        >
          {isTestMode ? 'Désactiver test' : 'Activer test'}
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          placeholder="ex: 22670123456"
          className="flex-1 h-8 rounded-lg border border-purple-200 px-2 text-xs bg-white"
        />
        <button onClick={addPhone} className="h-8 px-3 rounded-lg bg-purple-600 text-white text-[11px] font-bold">+</button>
      </div>

      {list.length > 0 && (
        <div className="space-y-1">
          {list.map((phone, i) => (
            <div key={i} className="flex items-center justify-between bg-white rounded-lg px-2 py-1">
              <span className="text-xs font-mono text-slate-700">{phone}</span>
              <button onClick={() => removePhone(i)} className="text-red-500 text-xs">✕</button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="w-full h-9 rounded-xl bg-purple-600 text-white text-xs font-bold"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Enregistrer'}
      </button>
    </div>
  );
}

// ── Stats des scénarios ────────────────────────────────────────────────────

function ScenarioStatsPanel({ stats }) {
  const conversionRate = stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0;
  const controlRate = stats.control_group > 0 && stats.total > 0
    ? Math.round((stats.control_group / stats.total) * 100) : 0;

  const steps = [
    { label: 'J0', value: stats.by_step?.j0_sent || 0, color: 'bg-blue-500' },
    { label: 'J+2', value: stats.by_step?.j2_sent || 0, color: 'bg-amber-500' },
    { label: 'J+5', value: stats.by_step?.j5_sent || 0, color: 'bg-red-500' },
  ];

  const segments = [
    { label: 'VIP', value: stats.by_segment?.vip || 0, color: 'bg-purple-500' },
    { label: 'Régulier', value: stats.by_segment?.regular || 0, color: 'bg-blue-500' },
    { label: 'Occasionnel', value: stats.by_segment?.occasional || 0, color: 'bg-amber-500' },
    { label: 'Sans course', value: stats.by_segment?.no_course || 0, color: 'bg-slate-400' },
  ];

  const variants = [
    { label: 'A', value: stats.by_variant?.A || 0, color: 'bg-blue-500' },
    { label: 'B', value: stats.by_variant?.B || 0, color: 'bg-purple-500' },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <p className="text-xs font-black text-slate-800">Scénarios de réactivation</p>

      {/* Funnel global */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-900' },
          { label: 'Actifs', value: stats.active, color: 'text-blue-600' },
          { label: 'Convertis', value: stats.converted, color: 'text-green-600' },
          { label: 'Terminés', value: stats.completed, color: 'text-slate-500' },
        ].map((s, i) => (
          <div key={i} className="text-center">
            <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
            <p className="text-[9px] font-bold text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Taux de réactivation */}
      <div className="rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-green-700">TAUX DE RÉACTIVATION</span>
          <span className="text-2xl font-black text-green-900">{conversionRate}%</span>
        </div>
        <p className="text-[10px] text-green-600 mt-1">
          {stats.converted} course(s) créée(s) / {stats.total} scénario(s)
        </p>
      </div>

      {/* Par étape */}
      <div className="space-y-1">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Pushes par étape</p>
        <div className="flex gap-2">
          {steps.map((s, i) => (
            <div key={i} className="flex-1 text-center">
              <div className={`${s.color} text-white rounded-lg py-1.5`}>
                <p className="text-sm font-black">{s.value}</p>
              </div>
              <p className="text-[9px] font-bold text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Par segment */}
      <div className="space-y-1">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Par segment</p>
        <div className="grid grid-cols-4 gap-2">
          {segments.map((s, i) => (
            <div key={i} className="text-center">
              <div className={`${s.color} text-white rounded-lg py-1`}>
                <p className="text-xs font-black">{s.value}</p>
              </div>
              <p className="text-[9px] font-bold text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* A/B variants */}
      <div className="space-y-1">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">A/B Variants</p>
        <div className="flex gap-2">
          {variants.map((v, i) => (
            <div key={i} className="flex-1 text-center">
              <div className={`${v.color} text-white rounded-lg py-1`}>
                <p className="text-xs font-black">{v.value}</p>
              </div>
              <p className="text-[9px] font-bold text-slate-500 mt-0.5">Variante {v.label}</p>
            </div>
          ))}
          <div className="flex-1 text-center">
            <div className="bg-slate-200 text-slate-700 rounded-lg py-1">
              <p className="text-xs font-black">{stats.control_group || 0}</p>
            </div>
            <p className="text-[9px] font-bold text-slate-500 mt-0.5">Contrôle</p>
          </div>
        </div>
      </div>

      {/* Financier */}
      {(stats.revenue > 0 || stats.commission > 0) && (
        <div className="rounded-xl bg-green-50 border border-green-200 p-2">
          <p className="text-[11px] font-bold text-green-700">
            CA: {stats.revenue.toLocaleString()} FCFA — Commission: {stats.commission.toLocaleString()} FCFA
          </p>
        </div>
      )}
    </div>
  );
}