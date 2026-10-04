import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Rocket, AlertTriangle, CheckCircle2, XCircle, Zap, RefreshCw, Activity, Eye, Target, DollarSign, MousePointerClick, Smartphone, UserPlus, TrendingUp, Repeat, Percent } from 'lucide-react';

const META_USD_TO_FCFA = 600;

const META_STATUS_MAP = {
  ACTIVE: { emoji: '🟢', label: 'En diffusion', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  IN_PROCESS: { emoji: '🟠', label: 'En validation Meta', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  PAUSED: { emoji: '⚪', label: 'En pause', bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
  WITH_ISSUES: { emoji: '🔴', label: 'Problème', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  ERROR: { emoji: '🔴', label: 'Erreur', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  DISAPPROVED: { emoji: '🔴', label: 'Rejeté', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  PENDING_REVIEW: { emoji: '🟠', label: 'En validation Meta', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  DELETED: { emoji: '⚫', label: 'Supprimé', bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
};

function formatFcfa(n) {
  if (n == null) return 'N/A';
  return Math.round(n).toLocaleString('fr-FR') + ' FCFA';
}

function formatDateTime(iso) {
  if (!iso) return 'Jamais';
  try {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return 'N/A'; }
}

function getMetaStatusInfo(effectiveStatus) {
  return META_STATUS_MAP[effectiveStatus] || { emoji: '❓', label: effectiveStatus || 'Inconnu', bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' };
}

function MiniStat({ icon: Icon, label, value, sub }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-[11px] text-gray-500">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </div>
      <div className="text-sm font-bold text-gray-900">{value}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  );
}

export default function AutopiloteStatusCard({ data }) {
  const cb = data.circuit_breakers || {};
  const activeExp = data.active_experiment || null;
  const metaStatus = data.meta_status || null;
  const metaInsights = data.meta_insights || null;

  // ── Determine overall Autopilote status ──
  let autopiloteState = 'disabled';
  let autopiloteLabel = 'DÉSACTIVÉ';
  let autopiloteEmoji = '🔴';
  let autopiloteBg = 'bg-red-50';
  let autopiloteBorder = 'border-red-300';
  let autopiloteText = 'text-red-700';

  if (cb.kill_switch) {
    autopiloteState = 'disabled';
    autopiloteLabel = 'DÉSACTIVÉ (Kill switch)';
  } else if (!cb.meta_enabled) {
    autopiloteState = 'disabled';
    autopiloteLabel = 'DÉSACTIVÉ (Meta Ads off)';
  } else if (!activeExp) {
    autopiloteState = 'idle';
    autopiloteLabel = 'AUCUNE EXPÉRIENCE ACTIVE';
    autopiloteEmoji = '⚪';
    autopiloteBg = 'bg-gray-50';
    autopiloteBorder = 'border-gray-200';
    autopiloteText = 'text-gray-600';
  } else {
    const adEff = metaStatus?.ad?.effective_status;
    const chainValid = !!(activeExp.meta_campaign_id && activeExp.meta_adset_id && activeExp.meta_creative_id && activeExp.meta_ad_id);

    if (adEff === 'ACTIVE' && chainValid) {
      autopiloteState = 'active';
      autopiloteLabel = 'EN DIFFUSION';
      autopiloteEmoji = '🟢';
      autopiloteBg = 'bg-green-50';
      autopiloteBorder = 'border-green-300';
      autopiloteText = 'text-green-700';
    } else if (adEff === 'IN_PROCESS' || adEff === 'PENDING_REVIEW') {
      autopiloteState = 'attention';
      autopiloteLabel = 'EN VALIDATION META';
      autopiloteEmoji = '🟠';
      autopiloteBg = 'bg-amber-50';
      autopiloteBorder = 'border-amber-300';
      autopiloteText = 'text-amber-700';
    } else if (adEff === 'PAUSED') {
      autopiloteState = 'paused';
      autopiloteLabel = 'EN PAUSE';
      autopiloteEmoji = '⚪';
      autopiloteBg = 'bg-gray-50';
      autopiloteBorder = 'border-gray-200';
      autopiloteText = 'text-gray-600';
    } else if (adEff === 'WITH_ISSUES' || adEff === 'ERROR' || adEff === 'DISAPPROVED') {
      autopiloteState = 'problem';
      autopiloteLabel = 'PROBLÈME META';
      autopiloteEmoji = '🔴';
      autopiloteBg = 'bg-red-50';
      autopiloteBorder = 'border-red-300';
      autopiloteText = 'text-red-700';
    } else if (!chainValid) {
      autopiloteState = 'attention';
      autopiloteLabel = 'CHAÎNE INCOMPLÈTE';
      autopiloteEmoji = '🟠';
      autopiloteBg = 'bg-amber-50';
      autopiloteBorder = 'border-amber-300';
      autopiloteText = 'text-amber-700';
    } else {
      autopiloteState = 'attention';
      autopiloteLabel = 'STATUT INCONNU';
      autopiloteEmoji = '🟠';
      autopiloteBg = 'bg-amber-50';
      autopiloteBorder = 'border-amber-300';
      autopiloteText = 'text-amber-700';
    }
  }

  // ── Circuit breaker items ──
  const cbItems = [];
  if (cb.kill_switch) cbItems.push({ label: 'Kill switch actif', severity: 'red' });
  if (!cb.meta_enabled) cbItems.push({ label: 'Meta Ads désactivé', severity: 'red' });
  if (cb.acquisition?.exceeded) cbItems.push({ label: 'Budget acquisition atteint', severity: 'red' });
  if (cb.global?.exceeded) cbItems.push({ label: 'Budget global atteint', severity: 'red' });
  if (cbItems.length === 0) cbItems.push({ label: 'Tous les contrôles OK', severity: 'green' });

  // ── Meta chain objects ──
  const metaObjects = [
    { name: 'Campaign', data: metaStatus?.campaign, id: activeExp?.meta_campaign_id },
    { name: 'Ad Set', data: metaStatus?.adset, id: activeExp?.meta_adset_id },
    { name: 'Ad', data: metaStatus?.ad, id: activeExp?.meta_ad_id },
  ];

  const spendUsd = metaInsights?.spend_usd || 0;
  const spendFcfa = Math.round(spendUsd * META_USD_TO_FCFA);
  const expSpendFcfa = activeExp?.spend_fcfa || 0;
  const expBudgetCap = activeExp?.budget_test_fcfa || 3000;
  const spendPct = expBudgetCap > 0 ? Math.min(100, (expSpendFcfa / expBudgetCap) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* ── ÉTAT DE L'AUTOPILOTE ── */}
      <Card className={`p-4 border-2 ${autopiloteBorder} ${autopiloteBg}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-gray-700" />
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">État de l'Autopilote</h2>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-bold ${autopiloteBg} ${autopiloteText} border ${autopiloteBorder}`}>
            {autopiloteEmoji} {autopiloteLabel}
          </div>
        </div>

        {/* Active experiment */}
        {activeExp ? (
          <div className="mb-3 pb-3 border-b border-gray-200">
            <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Expérience active</div>
            <div className="text-sm font-semibold text-gray-900">{activeExp.name}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {activeExp.meta_objective} · {activeExp.message_angle} · Budget {formatFcfa(expBudgetCap)}
            </div>
          </div>
        ) : (
          <div className="mb-3 pb-3 border-b border-gray-200 text-sm text-gray-500">
            Aucune expérience active. L'Autopilote ne dépense rien.
          </div>
        )}

        {/* Meta chain status */}
        {activeExp && metaStatus && !metaStatus.error && (
          <div className="mb-3 pb-3 border-b border-gray-200">
            <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-2">Chaîne Meta Ads</div>
            <div className="grid grid-cols-3 gap-2">
              {metaObjects.map((obj) => {
                const eff = obj.data?.effective_status;
                const info = getMetaStatusInfo(eff);
                return (
                  <div key={obj.name} className={`rounded-lg border p-2 ${info.border} ${info.bg}`}>
                    <div className="text-[10px] text-gray-500 mb-0.5">{obj.name}</div>
                    <div className={`text-xs font-semibold ${info.text}`}>{info.emoji} {info.label}</div>
                    {obj.id && <div className="text-[9px] text-gray-400 mt-0.5 truncate">{obj.id}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeExp && metaStatus?.error && (
          <div className="mb-3 pb-3 border-b border-gray-200">
            <div className="flex items-center gap-2 text-xs text-red-600">
              <AlertTriangle className="w-4 h-4" />
              <span>Erreur API Meta: {metaStatus.error}</span>
            </div>
          </div>
        )}

        {/* Circuit breakers */}
        <div className="mb-3 pb-3 border-b border-gray-200">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-2">Circuit breakers</div>
          <div className="flex flex-wrap gap-2">
            {cbItems.map((item, i) => (
              <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${item.severity === 'red' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {item.severity === 'red' ? '🔴' : '🟢'} {item.label}
              </span>
            ))}
          </div>
        </div>

        {/* Sync info */}
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <div className="text-gray-500">Sync Meta</div>
            <div className="font-medium text-gray-700">{formatDateTime(data.last_meta_sync)}</div>
          </div>
          <div>
            <div className="text-gray-500">Analyse Autopilote</div>
            <div className="font-medium text-gray-700">{formatDateTime(data.last_autopilote_analysis)}</div>
          </div>
          <div>
            <div className="text-gray-500">Collecte métriques</div>
            <div className="font-medium text-gray-700">{formatDateTime(data.last_metrics_update)}</div>
          </div>
        </div>
      </Card>

      {/* ── RÉSULTATS DU TEST EN COURS ── */}
      {activeExp && (
        <Card className="p-4 border-2 border-blue-200 bg-blue-50/30">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Résultats du Test en cours</h2>
          </div>

          {/* Budget progress */}
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-600 font-medium">Dépense Test A</span>
              <span className="text-gray-900 font-bold">{formatFcfa(expSpendFcfa)} / {formatFcfa(expBudgetCap)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className={`h-2 rounded-full transition-all ${spendPct > 80 ? 'bg-red-500' : spendPct > 50 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${spendPct}%` }} />
            </div>
          </div>

          {/* Meta insights */}
          {metaInsights && (
            <div className="grid grid-cols-4 gap-2 mb-3 pb-3 border-b border-blue-100">
              <MiniStat icon={Eye} label="Impressions" value={metaInsights.impressions?.toLocaleString('fr-FR') || 0} />
              <MiniStat icon={MousePointerClick} label="Clics" value={metaInsights.clicks?.toLocaleString('fr-FR') || 0} />
              <MiniStat icon={Activity} label="Reach" value={metaInsights.reach?.toLocaleString('fr-FR') || 0} />
              <MiniStat icon={Percent} label="CTR" value={metaInsights.ctr ? metaInsights.ctr.toFixed(2) + '%' : '0%'} />
            </div>
          )}

          {/* Attribution metrics */}
          <div className="grid grid-cols-4 gap-2">
            <MiniStat icon={Smartphone} label="Installations" value={activeExp.installs || 0} />
            <MiniStat icon={UserPlus} label="Inscriptions" value={activeExp.signups || 0} />
            <MiniStat icon={TrendingUp} label="1ères courses" value={activeExp.first_courses || 0} />
            <MiniStat icon={Repeat} label="2èmes courses" value={activeExp.second_courses || 0} />
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-blue-100">
            <MiniStat icon={DollarSign} label="CAC 1ère course" value={formatFcfa(activeExp.cac_first_course_fcfa)} />
            <MiniStat icon={DollarSign} label="CA attribué" value={formatFcfa(activeExp.attributed_revenue_fcfa)} />
            <MiniStat icon={DollarSign} label="Commissions" value={formatFcfa(activeExp.attributed_commission_fcfa)} />
          </div>

          {activeExp.activated_at && (
            <div className="mt-3 pt-3 border-t border-blue-100 text-[11px] text-gray-500">
              Démarrage réel: {formatDateTime(activeExp.activated_at)} · Observation: {activeExp.observation_days || 0} jours
            </div>
          )}
        </Card>
      )}
    </div>
  );
}