import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, DollarSign, Users, AlertTriangle, 
  BarChart3, Banknote, ChevronDown, ChevronUp,
  Calendar, MapPin, Download
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { fr } from "date-fns/locale";

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];

function formatMontant(v, devise = "FCFA") {
  return `${(v || 0).toLocaleString('fr-FR')} ${devise}`;
}

function StatCard({ icon: Icon, label, value, sub, color, bgColor }) {
  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{label}</p>
            <p className={`text-xl font-black ${color || 'text-gray-900'}`}>{value}</p>
            {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgColor || 'bg-gray-100'}`}>
            <Icon className={`w-5 h-5 ${color || 'text-gray-500'}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Comptabilite() {
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [periodPreset, setPeriodPreset] = useState("month");
  const [expandedSection, setExpandedSection] = useState("kpis");

  const now = new Date();
  const periodDates = useMemo(() => {
    switch (periodPreset) {
      case "week": return { debut: format(subMonths(now, 0), 'yyyy-MM-dd'), fin: format(now, 'yyyy-MM-dd') };
      case "month": return { debut: format(startOfMonth(now), 'yyyy-MM-dd'), fin: format(endOfMonth(now), 'yyyy-MM-dd') };
      case "year": return { debut: format(new Date(now.getFullYear(), 0, 1), 'yyyy-MM-dd'), fin: format(now, 'yyyy-MM-dd') };
      case "all": return { debut: '2024-01-01', fin: format(now, 'yyyy-MM-dd') };
      default: return { debut: format(startOfMonth(now), 'yyyy-MM-dd'), fin: format(endOfMonth(now), 'yyyy-MM-dd') };
    }
  }, [periodPreset, now]);

  const { data: countries = [] } = useQuery({
    queryKey: ["compta-countries"],
    queryFn: () => base44.entities.Country.filter({ actif: true }),
    initialData: [],
  });

  const { data: compta, isLoading } = useQuery({
    queryKey: ["comptabilite", selectedCountry, periodPreset],
    queryFn: () => base44.functions.invoke("getComptabiliteData", {
      country_code: selectedCountry !== "all" ? selectedCountry : undefined,
      date_debut: periodDates.debut,
      date_fin: periodDates.fin,
    }).then(r => r.data),
    enabled: true,
    initialData: null,
    refetchInterval: 60000,
  });

  const kpis = compta?.kpis || {};
  const evolution = compta?.evolution || [];
  const parPays = compta?.par_pays || {};
  const topLivreurs = compta?.top_livreurs || [];
  const paysConfig = compta?.pays_config || {};

  const paysChartData = Object.entries(parPays).map(([code, data]) => ({
    name: paysConfig[code]?.nom || code,
    ca: data.ca,
    commission: data.commission,
    courses: data.nb_courses,
  }));

  const pieData = paysChartData.map(d => ({ name: d.name, value: d.ca }));

  const handleExport = () => {
    if (!topLivreurs.length) return;
    const headers = "Livreur,Téléphone,CA,Commission,Gain,Courses\n";
    const rows = topLivreurs.map(l => 
      `${l.livreur_nom},${l.livreur_telephone},${l.ca},${l.commission},${l.gain},${l.nb_courses}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comptabilite_${selectedCountry}_${periodDates.debut}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const devisePays = selectedCountry !== "all" && paysConfig[selectedCountry] 
    ? paysConfig[selectedCountry].devise 
    : "FCFA";

  if (isLoading && !compta) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">📊 Comptabilité</h1>
          <p className="text-sm text-gray-500 mt-1">
            {format(new Date(periodDates.debut), 'dd MMM yyyy', { locale: fr })} → {format(new Date(periodDates.fin), 'dd MMM yyyy', { locale: fr })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedCountry} onValueChange={setSelectedCountry}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <MapPin className="w-3.5 h-3.5 mr-1" />
              <SelectValue placeholder="Pays" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">🌍 Tous les pays</SelectItem>
              {countries.map(c => (
                <SelectItem key={c.code} value={c.code}>{c.emoji_flag || "🏳️"} {c.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodPreset} onValueChange={setPeriodPreset}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <Calendar className="w-3.5 h-3.5 mr-1" />
              <SelectValue placeholder="Période" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Cette semaine</SelectItem>
              <SelectItem value="month">Ce mois</SelectItem>
              <SelectItem value="year">Cette année</SelectItem>
              <SelectItem value="all">Tout</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        </div>
      </div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={DollarSign}
          label="Chiffre d'affaires"
          value={formatMontant(kpis.ca_total, devisePays)}
          sub={`${kpis.nb_courses || 0} courses`}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
        />
        <StatCard
          icon={Banknote}
          label="Commission SILGAPP"
          value={formatMontant(kpis.commission_totale, devisePays)}
          color="text-blue-600"
          bgColor="bg-blue-50"
        />
        <StatCard
          icon={Users}
          label="Gain livreurs"
          value={formatMontant(kpis.gain_livreurs, devisePays)}
          sub={`Dus non payés: ${formatMontant(kpis.dus_non_payes, devisePays)}`}
          color="text-violet-600"
          bgColor="bg-violet-50"
        />
        <StatCard
          icon={AlertTriangle}
          label="Encours total"
          value={formatMontant(kpis.encours_total, devisePays)}
          sub={`${kpis.nb_bloques || 0} livreur(s) bloqué(s) / ${kpis.nb_livreurs_actifs || 0} actifs`}
          color={kpis.nb_bloques > 0 ? "text-red-600" : "text-amber-600"}
          bgColor={kpis.nb_bloques > 0 ? "bg-red-50" : "bg-amber-50"}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Évolution CA */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Évolution du CA
            </CardTitle>
          </CardHeader>
          <CardContent>
            {evolution.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={evolution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [formatMontant(v, devisePays), '']} />
                  <Line type="monotone" dataKey="ca" stroke="#10b981" strokeWidth={2} dot={false} name="CA" />
                  <Line type="monotone" dataKey="commission" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="Commission" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-gray-400 text-sm py-8">Aucune donnée sur cette période</p>
            )}
          </CardContent>
        </Card>

        {/* Répartition par pays */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              CA par pays
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paysChartData.length > 0 ? (
              <div className="flex gap-4">
                <ResponsiveContainer width="60%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [formatMontant(v, devisePays), '']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5 overflow-auto max-h-[220px]">
                  {paysChartData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-gray-700">{d.name}</span>
                      </div>
                      <span className="font-bold text-gray-900">{formatMontant(d.ca, devisePays)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-400 text-sm py-8">Aucune donnée</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Livreurs */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-500" />
            Top 20 livreurs (CA généré)
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setExpandedSection(expandedSection === 'livreurs' ? 'kpis' : 'livreurs')}>
            {expandedSection === 'livreurs' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </CardHeader>
        {expandedSection === 'livreurs' && (
          <CardContent>
            {topLivreurs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs text-gray-500 font-medium">#</th>
                      <th className="text-left py-2 text-xs text-gray-500 font-medium">Livreur</th>
                      <th className="text-right py-2 text-xs text-gray-500 font-medium">Courses</th>
                      <th className="text-right py-2 text-xs text-gray-500 font-medium">CA</th>
                      <th className="text-right py-2 text-xs text-gray-500 font-medium">Commission</th>
                      <th className="text-right py-2 text-xs text-gray-500 font-medium">Gain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topLivreurs.map((l, i) => (
                      <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5">
                          <Badge variant={i < 3 ? "default" : "outline"} className="text-[10px] w-6 h-5 flex items-center justify-center">
                            {i + 1}
                          </Badge>
                        </td>
                        <td className="py-2.5">
                          <p className="font-semibold text-gray-900">{l.livreur_nom || '—'}</p>
                          <p className="text-[10px] text-gray-400">{l.livreur_telephone}</p>
                        </td>
                        <td className="py-2.5 text-right text-gray-600">{l.nb_courses}</td>
                        <td className="py-2.5 text-right font-bold text-emerald-700">{formatMontant(l.ca, devisePays)}</td>
                        <td className="py-2.5 text-right text-blue-600">{formatMontant(l.commission, devisePays)}</td>
                        <td className="py-2.5 text-right text-violet-600">{formatMontant(l.gain, devisePays)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-gray-400 text-sm py-4">Aucune course sur la période</p>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}