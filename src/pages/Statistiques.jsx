import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Users, Truck, Store, Pill, UtensilsCrossed, Package,
  CheckCircle2, XCircle, Wifi, WifiOff, Smartphone, Wallet,
  TrendingUp, Globe, Activity,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import StatsKpiCard from "@/components/statistiques/StatsKpiCard";
import StatsFilters, { computeDateRange } from "@/components/statistiques/StatsFilters";
import InstallationsSection from "@/components/statistiques/InstallationsSection";
import ExportButtons from "@/components/statistiques/ExportButtons";

const PAYS_INFO = {
  BF: { nom: "Burkina Faso", emoji: "🇧🇫", color: "#dc2626" },
  CI: { nom: "Côte d'Ivoire", emoji: "🇨🇮", color: "#f59e0b" },
  TG: { nom: "Togo", emoji: "🇹🇬", color: "#10b981" },
  BJ: { nom: "Bénin", emoji: "🇧🇯", color: "#3b82f6" },
  SN: { nom: "Sénégal", emoji: "🇸🇳", color: "#8b5cf6" },
  ML: { nom: "Mali", emoji: "🇲🇱", color: "#ec4899" },
  GN: { nom: "Guinée", emoji: "🇬🇳", color: "#06b6d4" },
  NE: { nom: "Niger", emoji: "🇳🇪", color: "#f97316" },
  GH: { nom: "Ghana", emoji: "🇬🇭", color: "#14b8a6" },
};

const CHART_COLOR = "#dc2626";
const CHART_COLOR_2 = "#f59e0b";
const CHART_COLOR_3 = "#3b82f6";
const CHART_COLOR_4 = "#10b981";

const tooltipStyle = {
  backgroundColor: "#1e293b",
  border: "none",
  borderRadius: "10px",
  fontSize: "12px",
  color: "#fff",
  padding: "8px 12px",
};

function ChartCard({ title, icon: Icon, iconColor, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-8 h-8 rounded-lg ${iconColor} flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function formatDateTick(dateStr) {
  const d = new Date(dateStr);
  return format(d, "dd/MM");
}

export default function Statistiques() {
  const [period, setPeriod] = useState("30days");
  const [customRange, setCustomRange] = useState({ debut: "", fin: "" });

  const dateRange = useMemo(() => computeDateRange(period, customRange), [period, customRange]);

  const { data, isLoading } = useQuery({
    queryKey: ["stats-globales", dateRange.debut, dateRange.fin],
    queryFn: async () => {
      const res = await base44.functions.invoke("getStatsGlobales", {
        date_debut: dateRange.debut,
        date_fin: dateRange.fin,
      });
      return res.data;
    },
    refetchInterval: 30000,
  });

  const kpis = data?.kpis || {};
  const evolution = data?.evolution || {};
  const parPays = data?.par_pays || {};
  const installations = data?.installations || {};

  const countryChartData = useMemo(() => {
    return Object.entries(parPays)
      .filter(([code]) => PAYS_INFO[code])
      .map(([code, d]) => ({
        name: PAYS_INFO[code].nom,
        code,
        value: d.clients + d.livreurs,
        color: PAYS_INFO[code].color,
        emoji: PAYS_INFO[code].emoji,
        ...d,
      }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [parPays]);

  const kpiCards = [
    { icon: Users, label: "Total clients", value: kpis.total_clients, gradient: "from-blue-500 to-indigo-600" },
    { icon: Truck, label: "Total livreurs", value: kpis.total_livreurs, gradient: "from-green-500 to-emerald-600" },
    { icon: Store, label: "Total partenaires", value: kpis.total_partenaires, gradient: "from-violet-500 to-purple-600" },
    { icon: Pill, label: "Pharmacies", value: kpis.total_pharmacies, gradient: "from-cyan-500 to-blue-500" },
    { icon: Store, label: "Boutiques", value: kpis.total_boutiques, gradient: "from-pink-500 to-rose-500" },
    { icon: UtensilsCrossed, label: "Restaurants", value: kpis.total_restaurants, gradient: "from-orange-500 to-red-500" },
    { icon: Package, label: "Courses créées", value: kpis.courses_creees, gradient: "from-indigo-500 to-blue-600" },
    { icon: CheckCircle2, label: "Courses terminées", value: kpis.courses_terminees, gradient: "from-emerald-500 to-green-600" },
    { icon: XCircle, label: "Courses annulées", value: kpis.courses_annulees, gradient: "from-red-500 to-rose-600" },
    { icon: Wifi, label: "Livreurs en ligne", value: kpis.livreurs_en_ligne, gradient: "from-green-400 to-teal-500" },
    { icon: WifiOff, label: "Livreurs hors ligne", value: kpis.livreurs_hors_ligne, gradient: "from-gray-400 to-slate-500" },
    { icon: Smartphone, label: "Utilisateurs connectés", value: kpis.utilisateurs_connectes, gradient: "from-teal-500 to-cyan-600" },
    { icon: Wallet, label: "Chiffre d'affaires", value: kpis.ca_total, gradient: "from-amber-500 to-orange-500", isMoney: true, delay: 0.36 },
  ];

  if (isLoading && !data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">Chargement des statistiques...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* ── HERO HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-red-900 to-slate-900 p-5 sm:p-6 shadow-xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full" />
          <div className="absolute -bottom-12 -left-6 w-56 h-56 bg-white rounded-full" />
        </div>
        <div className="relative flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Statistiques SILGAPP</h1>
              <p className="text-white/60 text-xs mt-0.5 capitalize">
                {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5 border border-white/20">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-white text-xs font-semibold">Temps réel</span>
            </div>
            <ExportButtons kpis={kpis} parPays={parPays} periode={data?.periode} />
          </div>
        </div>
      </div>

      {/* ── FILTRES PÉRIODE ── */}
      <StatsFilters
        period={period}
        setPeriod={setPeriod}
        customRange={customRange}
        setCustomRange={setCustomRange}
      />

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {kpiCards.map((kpi, i) => (
          <StatsKpiCard key={kpi.label} {...kpi} delay={i * 0.03} />
        ))}
      </div>

      {/* ── GRAPHIQUES ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Évolution du chiffre d'affaires */}
        <ChartCard title="Évolution du chiffre d'affaires" icon={Wallet} iconColor="bg-gradient-to-br from-amber-500 to-orange-500">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={evolution.revenue || []}>
              <defs>
                <linearGradient id="caGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLOR_2} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={CHART_COLOR_2} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={formatDateTick} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => formatDateTick(l)} formatter={(v) => [`${Number(v).toLocaleString()} FCFA`, "CA"]} />
              <Area type="monotone" dataKey="montant" stroke={CHART_COLOR_2} strokeWidth={2.5} fill="url(#caGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Évolution des courses */}
        <ChartCard title="Évolution des courses" icon={Package} iconColor="bg-gradient-to-br from-indigo-500 to-blue-600">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={evolution.courses || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={formatDateTick} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => formatDateTick(l)} />
              <Bar dataKey="creees" name="Créées" fill={CHART_COLOR_3} radius={[4, 4, 0, 0]} />
              <Bar dataKey="terminees" name="Terminées" fill={CHART_COLOR_4} radius={[4, 4, 0, 0]} />
              <Bar dataKey="annulees" name="Annulées" fill={CHART_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Évolution des utilisateurs */}
        <ChartCard title="Évolution des utilisateurs" icon={Users} iconColor="bg-gradient-to-br from-blue-500 to-indigo-600">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={evolution.users || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={formatDateTick} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => formatDateTick(l)} formatter={(v) => [v, "Nouveaux clients"]} />
              <Line type="monotone" dataKey="count" name="Nouveaux clients" stroke={CHART_COLOR_3} strokeWidth={2.5} dot={{ fill: CHART_COLOR_3, r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Évolution des installations */}
        <ChartCard title="Évolution des installations" icon={Smartphone} iconColor="bg-gradient-to-br from-violet-500 to-purple-600">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={evolution.installations || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={formatDateTick} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => formatDateTick(l)} />
              <Bar dataKey="android" name="Android" fill="#10b981" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="ios" name="iOS" fill="#6b7280" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="web" name="Web" fill="#3b82f6" stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Évolution des livreurs actifs */}
        <ChartCard title="Évolution des livreurs actifs" icon={Truck} iconColor="bg-gradient-to-br from-green-500 to-emerald-600">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={evolution.livreurs_actifs || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={formatDateTick} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => formatDateTick(l)} formatter={(v) => [v, "Livreurs actifs"]} />
              <Line type="monotone" dataKey="count" name="Livreurs actifs" stroke={CHART_COLOR_4} strokeWidth={2.5} dot={{ fill: CHART_COLOR_4, r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Répartition par pays */}
        <ChartCard title="Répartition par pays" icon={Globe} iconColor="bg-gradient-to-br from-cyan-500 to-blue-500">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={countryChartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={40}
                paddingAngle={2}
              >
                {countryChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v, name, props) => {
                  const d = props.payload;
                  return [`${d.clients} clients, ${d.livreurs} livreurs`, `${d.emoji} ${name}`];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── DÉTAIL PAR PAYS ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
            <Globe className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-gray-900 text-sm">Détail par pays</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2.5 px-3 font-semibold text-gray-500 text-xs">Pays</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-500 text-xs">Clients</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-500 text-xs">Livreurs</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-500 text-xs">Courses</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-500 text-xs">CA (FCFA)</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-500 text-xs">Installations</th>
              </tr>
            </thead>
            <tbody>
              {countryChartData.map((d) => (
                <tr key={d.code} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="py-2.5 px-3 font-medium text-gray-700">{d.emoji} {d.name}</td>
                  <td className="text-right py-2.5 px-3 font-semibold text-gray-800">{d.clients}</td>
                  <td className="text-right py-2.5 px-3 font-semibold text-gray-800">{d.livreurs}</td>
                  <td className="text-right py-2.5 px-3 font-semibold text-gray-800">{d.courses}</td>
                  <td className="text-right py-2.5 px-3 font-semibold text-emerald-600">{d.ca.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 font-semibold text-violet-600">{d.installations}</td>
                </tr>
              ))}
              {countryChartData.length === 0 && (
                <tr><td colSpan="6" className="text-center py-8 text-gray-400 text-sm">Aucune donnée disponible</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── INSTALLATIONS ── */}
      <InstallationsSection installations={installations} evolution={evolution.installations} activeUsers={kpis.utilisateurs_connectes || 0} />
    </div>
  );
}