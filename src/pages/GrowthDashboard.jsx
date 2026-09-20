import React, { useState } from "react";
import {
  Users, Package, Send, TrendingUp, DollarSign, Wallet, Gift,
  Trophy, Zap, Megaphone, RefreshCw,
} from "lucide-react";
import {
  useGrowthData,
  useGrowthAutomationStatus,
  useGrowthAdBudget,
  useGrowthPrimeBudget,
  useGrowthTunnel,
  useGrowthJournal,
  useAttributionStats,
  useUpdateAdBudget,
  useUpdatePrimeBudget,
  useToggleGrowthEngine,
} from "@/hooks/useGrowthData";
import GrowthKpiCard from "@/components/growth/GrowthKpiCard";
import GrowthEngineToggle from "@/components/growth/GrowthEngineToggle";
import GrowthBudgetEditor from "@/components/growth/GrowthBudgetEditor";
import GrowthConversionTunnel from "@/components/growth/GrowthConversionTunnel";
import GrowthPerformancePanel from "@/components/growth/GrowthPerformancePanel";
import GrowthJournalTable from "@/components/growth/GrowthJournalTable";
import GrowthAlertsPanel from "@/components/growth/GrowthAlertsPanel";
import GrowthAttributionTable from "@/components/growth/GrowthAttributionTable";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PERIOD_OPTIONS = [
  { value: 1, label: "Aujourd'hui" },
  { value: 7, label: "7 jours" },
  { value: 30, label: "30 jours" },
];

export default function GrowthDashboard() {
  const [periodDays, setPeriodDays] = useState(7);
  const [countryCode, setCountryCode] = useState(null);
  const [journalPeriod, setJournalPeriod] = useState(7);

  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = useGrowthData(periodDays);
  const { data: automationStatus, isLoading: autoLoading } = useGrowthAutomationStatus();
  const { data: adBudget } = useGrowthAdBudget();
  const { data: primeBudget } = useGrowthPrimeBudget();
  const { data: tunnel, isLoading: tunnelLoading } = useGrowthTunnel();
  const { data: journal, isLoading: journalLoading } = useGrowthJournal(journalPeriod, countryCode);
  const { data: attributionStats } = useAttributionStats();

  const updateAdBudget = useUpdateAdBudget();
  const updatePrimeBudget = useUpdatePrimeBudget();
  const toggleEngine = useToggleGrowthEngine();

  const handleRefresh = () => {
    refetchOverview();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-3 md:p-6 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-blue-600" />
            Growth / Croissance
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Centre de contrôle de l'automatisation SILGAPP
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(parseInt(v))}>
            <SelectTrigger className="w-32 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="h-9">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Vue d'ensemble : KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <GrowthKpiCard
          label="Nouveaux clients"
          value={overview?.newClients ?? "—"}
          sub={`sur ${overview?.totalClients ?? 0} au total`}
          icon={Users}
          accent="blue"
        />
        <GrowthKpiCard
          label="Premières courses"
          value={overview?.firstCourses ?? "—"}
          icon={Package}
          accent="green"
        />
        <GrowthKpiCard
          label="Deuxièmes courses"
          value={overview?.secondCourses ?? "—"}
          icon={Trophy}
          accent="amber"
        />
        <GrowthKpiCard
          label="Clients réactivés"
          value={overview?.reactivatedClients ?? "—"}
          icon={Zap}
          accent="purple"
        />
        <GrowthKpiCard
          label="Clients réguliers"
          value={overview?.regularClients ?? "—"}
          sub="≥3 courses livrées"
          icon={Users}
          accent="gray"
        />
        <GrowthKpiCard
          label="Push envoyés"
          value={overview?.pushesSent ?? "—"}
          icon={Send}
          accent="blue"
        />
        <GrowthKpiCard
          label="Conversions après push"
          value={overview?.pushConversions ?? "—"}
          sub={`${overview?.pushConversionRate ?? 0}% de conversion`}
          icon={TrendingUp}
          accent="green"
        />
        <GrowthKpiCard
          label="Courses générées"
          value={overview?.automationCourses ?? "—"}
          sub="par automatisations"
          icon={Package}
          accent="amber"
        />
        <GrowthKpiCard
          label="CA généré"
          value={overview ? `${overview.automationRevenue.toLocaleString()} F` : "—"}
          icon={DollarSign}
          accent="green"
        />
        <GrowthKpiCard
          label="Commission SILGAPP"
          value={overview ? `${overview.automationCommission.toLocaleString()} F` : "—"}
          icon={Wallet}
          accent="blue"
        />
      </div>

      {/* ── Tunnel de conversion ── */}
      <GrowthConversionTunnel data={tunnel} />

      {/* ── Automatisations ── */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 mb-2 mt-4">Automatisations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <GrowthEngineToggle
            title="Réactivation clients"
            engineKey="reactivation"
            status={automationStatus?.reactivation?.status || "OFF"}
            description="Moteur J0/J+2/J+5 — relance des clients inactifs"
            lastRun={automationStatus?.reactivation?.lastRun}
            analyzed={automationStatus?.reactivation?.analyzed}
            sent={automationStatus?.reactivation?.sent}
            converted={automationStatus?.reactivation?.converted}
            onToggle={(newState) => toggleEngine.mutate({ engine: "reactivation", newState })}
          />
          <GrowthEngineToggle
            title="Relance 1ère → 2ème course"
            engineKey="firstCourseRelance"
            status={automationStatus?.firstCourseRelance?.status || "DRY-RUN"}
            description="Push 48h après la première livraison"
            lastRun={automationStatus?.firstCourseRelance?.lastRun}
            onToggle={(newState) => toggleEngine.mutate({ engine: "firstCourseRelance", newState })}
          />
          <GrowthEngineToggle
            title="Rappels d'habitude"
            engineKey="habitReminders"
            status={automationStatus?.habitReminders?.status || "OFF"}
            description="Rappel basé sur les habitudes de commande"
            lastRun={automationStatus?.habitReminders?.lastRun}
            sent={automationStatus?.habitReminders?.sent}
            converted={automationStatus?.habitReminders?.converted}
            onToggle={(newState) => toggleEngine.mutate({ engine: "habitReminders", newState })}
          />
          <GrowthEngineToggle
            title="Primes automatiques"
            engineKey="primePromo"
            status={automationStatus?.primePromo?.status || "OFF"}
            description="Versement de primes code promo"
            lastRun={automationStatus?.primePromo?.lastRun}
            onToggle={(newState) => toggleEngine.mutate({ engine: "primePromo", newState })}
          />
          <GrowthEngineToggle
            title="Publicité automatique"
            engineKey="advertising"
            status={automationStatus?.advertising?.status || "OFF"}
            description="Diffusion automatique de publicités"
            onToggle={(newState) => toggleEngine.mutate({ engine: "advertising", newState })}
          />
        </div>
      </div>

      {/* ── Budgets ── */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 mb-2 mt-4">Budgets</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {adBudget && (
            <GrowthBudgetEditor
              title="Budget publicité — Meta Ads"
              icon={Megaphone}
              budgetPerDay={adBudget.budgetPerDay}
              spentToday={adBudget.spentToday}
              remainingToday={adBudget.remainingToday}
              spent7Days={adBudget.spent7Days}
              spent30Days={adBudget.spent30Days}
              accent="blue"
              extraStats={
                adBudget.hasRealAdPlatform && adBudget.metaMetrics?.today
                  ? [
                      { label: "Plateforme Meta", value: "Connectée", color: "text-green-600" },
                      { label: "Impressions (jour)", value: adBudget.metaMetrics.today.impressions?.toLocaleString() || 0 },
                      { label: "Clics (jour)", value: adBudget.metaMetrics.today.clicks || 0 },
                      { label: "CTR", value: `${(adBudget.metaMetrics.today.ctr || 0).toFixed(2)}%` },
                      { label: "CPC", value: `${(adBudget.metaMetrics.today.cpc || 0).toFixed(2)}` },
                      { label: "Campagnes actives", value: (adBudget.metaMetrics.campaigns || []).filter(c => c.status === "ACTIVE").length },
                    ]
                  : [{ label: "Plateforme Meta", value: "Non connectée", color: "text-slate-400" }]
              }
              onBudgetChange={(budget) => updateAdBudget.mutate({ budgetPerDay: budget })}
            />
          )}
          {primeBudget && (
            <GrowthBudgetEditor
              title="Budget primes"
              icon={Gift}
              budgetPerDay={primeBudget.budgetPerDay}
              spentToday={primeBudget.spentToday}
              remainingToday={Math.max(0, primeBudget.budgetPerDay - primeBudget.spentToday)}
              spent7Days={primeBudget.spent7Days}
              spent30Days={primeBudget.spent30Days}
              accent="amber"
              extraStats={[
                { label: "Primes validées aujourd'hui", value: primeBudget.primesCountToday },
                { label: "Courses attribuées", value: primeBudget.coursesAttribuees },
              ]}
              onBudgetChange={(budget) => updatePrimeBudget.mutate({ budgetPerDay: budget })}
            />
          )}
        </div>
      </div>

      {/* ── Attribution Meta → Install → Client → Courses ── */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 mb-2 mt-4">Attribution publicitaire</h2>
        <GrowthAttributionTable data={attributionStats} />
      </div>

      {/* ── Performance + Alertes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <GrowthPerformancePanel automationStatus={automationStatus} overview={overview} />
        </div>
        <GrowthAlertsPanel
          automationStatus={automationStatus}
          adBudget={adBudget}
          primeBudget={primeBudget}
          tunnel={tunnel}
        />
      </div>

      {/* ── Journal Growth ── */}
      <div>
        <div className="flex items-center justify-between mb-2 mt-4">
          <h2 className="text-sm font-bold text-slate-700">Journal Growth</h2>
          <Select value={String(journalPeriod)} onValueChange={(v) => setJournalPeriod(parseInt(v))}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <GrowthJournalTable entries={journal} loading={journalLoading} />
      </div>

      {/* ── Footer ── */}
      <Card className="p-3 bg-slate-100 border-slate-200">
        <p className="text-[10px] text-slate-500 text-center">
          Dashboard Growth — Centre de contrôle. Les budgets et activations sont modifiables
          directement depuis cette page. Chaque changement est journalisé dans GrowthSpend.
          Dépenses publicitaires réelles synchronisées depuis Meta Ads (lecture seule). Aucune campagne créée ou modifiée par SILGAPP.
        </p>
      </Card>
    </div>
  );
}