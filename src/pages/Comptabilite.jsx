import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, Users, AlertTriangle,
  BarChart3, Download, FileText, Wallet,
  Calendar, MapPin, TrendingDown, Minus, Store, UtensilsCrossed
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import ComptabiliteLivreurDetail from "@/components/comptabilite/ComptabiliteLivreurDetail";
import PaiementsPartenairesAdmin from "@/components/admin/PaiementsPartenairesAdmin";
import CommandesPartenairesAdmin from "@/components/admin/CommandesPartenairesAdmin";

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];

function formatMontant(v) {
  return `${(v || 0).toLocaleString('fr-FR')}`;
}

function PctBadge({ value }) {
  if (value === null || value === undefined) return <Minus className="w-3 h-3 text-gray-300" />;
  const positif = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ml-1.5 ${positif ? 'text-emerald-600' : 'text-red-500'}`}>
      {positif ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positif ? '+' : ''}{value}%
    </span>
  );
}

export default function Comptabilite() {
  const queryClient = useQueryClient();
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [periodPreset, setPeriodPreset] = useState("month");
  const [selectedLivreur, setSelectedLivreur] = useState(null);

  const now = new Date();
  const periodDates = useMemo(() => {
    switch (periodPreset) {
      case "month": return { debut: format(startOfMonth(now), 'yyyy-MM-dd'), fin: format(endOfMonth(now), 'yyyy-MM-dd') };
      case "year": return { debut: format(new Date(now.getFullYear(), 0, 1), 'yyyy-MM-dd'), fin: format(now, 'yyyy-MM-dd') };
      case "all": return { debut: '2024-01-01', fin: format(now, 'yyyy-MM-dd') };
      default: return { debut: format(startOfMonth(now), 'yyyy-MM-dd'), fin: format(endOfMonth(now), 'yyyy-MM-dd') };
    }
  }, [periodPreset]);

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
    initialData: null,
    refetchInterval: 60000,
  });

  const kpis = compta?.kpis || {};
  const evolution = compta?.evolution || [];
  const parPays = compta?.par_pays || {};
  const topLivreurs = compta?.top_livreurs || [];
  const topPartenaires = compta?.top_partenaires || [];
  const paysConfig = compta?.pays_config || {};

  const devisePays = selectedCountry !== "all" && paysConfig[selectedCountry]
    ? paysConfig[selectedCountry].devise : "FCFA";

  const paysChartData = Object.entries(parPays).map(([code, data]) => ({
    name: paysConfig[code]?.nom || code,
    devise: paysConfig[code]?.devise || "FCFA",
    ca: data.ca,
    commission: data.commission,
    courses: data.nb_courses,
  }));

  const pieData = paysChartData.map(d => ({ name: d.name, value: d.ca, devise: d.devise }));

  const handleExportCSV = () => {
    if (!topLivreurs.length) return;
    const headers = "Livreur,Téléphone,CA,Commission,Gain,Courses,Encours\n";
    const rows = topLivreurs.map(l =>
      `"${l.livreur_nom}","${l.livreur_telephone}",${l.ca},${l.commission},${l.gain},${l.nb_courses},${l.encours}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `comptabilite_${selectedCountry}_${periodDates.debut}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    let jsPDF;
    try {
      jsPDF = (await import('jspdf')).jsPDF;
    } catch {
      alert("Module PDF non disponible");
      return;
    }
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Comptabilite SILGAPP - ${selectedCountry === 'all' ? 'Tous pays' : selectedCountry}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Periode: ${periodDates.debut} → ${periodDates.fin}`, 14, 28);
    doc.text(`CA: ${formatMontant(kpis.ca_total)} ${devisePays} | Commission: ${formatMontant(kpis.commission_totale)} ${devisePays}`, 14, 36);
    doc.text(`Gain livreurs: ${formatMontant(kpis.gain_livreurs)} ${devisePays} | Courses: ${kpis.nb_courses} | Encours: ${formatMontant(kpis.encours_total)} ${devisePays}`, 14, 42);

    if (topLivreurs.length > 0) {
      doc.text("Top livreurs:", 14, 52);
      let y = 58;
      topLivreurs.slice(0, 25).forEach((l, i) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(8);
        doc.text(`${i+1}. ${l.livreur_nom} - CA: ${formatMontant(l.ca)} ${devisePays} - Gain: ${formatMontant(l.gain)} ${devisePays} - Encours: ${formatMontant(l.encours)}`, 14, y);
        y += 8;
      });
    }
    doc.save(`comptabilite_${periodDates.debut}.pdf`);
  };

  const handlePaiement = (livreurId) => {
    queryClient.invalidateQueries({ queryKey: ["comptabilite"] });
    setSelectedLivreur(null);
  };

  if (isLoading && !compta) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
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
          <h1 className="text-2xl font-black text-gray-900"> Comptabilité</h1>
          <p className="text-sm text-gray-500 mt-1">
            {format(new Date(periodDates.debut), 'dd MMM yyyy', { locale: fr })} → {format(new Date(periodDates.fin), 'dd MMM yyyy', { locale: fr })}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedCountry} onValueChange={setSelectedCountry}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <MapPin className="w-3.5 h-3.5 mr-1" />
              <SelectValue placeholder="Pays" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all"> Tous les pays</SelectItem>
              {countries.map(c => (
                <SelectItem key={c.code} value={c.code}>{c.emoji_flag || ""} {c.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodPreset} onValueChange={setPeriodPreset}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <Calendar className="w-3.5 h-3.5 mr-1" />
              <SelectValue placeholder="Période" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Ce mois</SelectItem>
              <SelectItem value="year">Cette année</SelectItem>
              <SelectItem value="all">Tout</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5">
            <FileText className="w-3.5 h-3.5" /> PDF
          </Button>
        </div>
      </div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="overflow-hidden border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Chiffre d'affaires</p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className="text-xl font-black text-emerald-600">{formatMontant(kpis.ca_total)}</p>
              <span className="text-xs text-gray-400">{devisePays}</span>
              <PctBadge value={kpis.pct_ca} />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {kpis.nb_courses || 0} courses <PctBadge value={kpis.pct_courses} />
            </p>
            <p className="text-[10px] text-gray-400">Moy/jour: {formatMontant(kpis.moyenne_jour)} {devisePays}</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Commission SILGAPP</p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className="text-xl font-black text-blue-600">{formatMontant(kpis.commission_totale)}</p>
              <span className="text-xs text-gray-400">{devisePays}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {kpis.ca_total > 0
                ? `${Math.round((kpis.commission_totale / kpis.ca_total) * 100)}% du CA`
                : '—'}
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Gain livreurs</p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className="text-xl font-black text-violet-600">{formatMontant(kpis.gain_livreurs)}</p>
              <span className="text-xs text-gray-400">{devisePays}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Non payé: {formatMontant(kpis.dus_non_payes)} {devisePays}
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Encours total</p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className={`text-xl font-black ${kpis.nb_bloques > 0 ? 'text-red-600' : 'text-amber-600'}`}>
                {formatMontant(kpis.encours_total)}
              </p>
              <span className="text-xs text-gray-400">{devisePays}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {kpis.nb_bloques || 0} bloqué(s) / {kpis.nb_livreurs_actifs || 0} actifs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* KPIs Partenaires */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-violet-50">
          <CardContent className="p-4">
            <p className="text-xs text-purple-600 font-medium uppercase tracking-wider flex items-center gap-1">
              <Store className="w-3.5 h-3.5" /> CA Partenaires
            </p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className="text-xl font-black text-purple-700">{formatMontant(kpis.ca_partenaires)}</p>
              <span className="text-xs text-gray-400">{devisePays}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">{kpis.nb_commandes_partenaires || 0} commandes boutiques/restaurants</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-red-50 to-rose-50">
          <CardContent className="p-4">
            <p className="text-xs text-red-600 font-medium uppercase tracking-wider flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5" /> Commission due (Partenaires)
            </p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className="text-xl font-black text-red-600">{formatMontant(kpis.commission_partenaires)}</p>
              <span className="text-xs text-gray-400">{devisePays}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {kpis.ca_partenaires > 0 ? `${Math.round((kpis.commission_partenaires / kpis.ca_partenaires) * 100)}% du CA partenaires` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-green-50">
          <CardContent className="p-4">
            <p className="text-xs text-emerald-600 font-medium uppercase tracking-wider">Commission totale SILGAPP</p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className="text-xl font-black text-emerald-700">{formatMontant((kpis.commission_totale || 0) + (kpis.commission_partenaires || 0))}</p>
              <span className="text-xs text-gray-400">{devisePays}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Courses + Partenaires</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                  <Tooltip formatter={(v, name) => [`${v.toLocaleString('fr-FR')} ${devisePays}`, name === 'ca' ? 'CA' : 'Commission']} />
                  <Line type="monotone" dataKey="ca" stroke="#10b981" strokeWidth={2} dot={false} name="ca" />
                  <Line type="monotone" dataKey="commission" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="commission" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-gray-400 text-sm py-8">Aucune donnée</p>
            )}
          </CardContent>
        </Card>

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
                <ResponsiveContainer width="55%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v, name, props) => {
                      const devise = props?.payload?.devise || "FCFA";
                      return [`${v.toLocaleString('fr-FR')} ${devise}`, ''];
                    }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5 overflow-auto max-h-[220px]">
                  {paysChartData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-gray-700 truncate max-w-[100px]">{d.name}</span>
                      </div>
                      <span className="font-bold text-gray-900 whitespace-nowrap">{formatMontant(d.ca)} {d.devise}</span>
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

      {/* Top Livreurs — ouvert par défaut */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-500" />
            Top livreurs ({topLivreurs.length})
          </CardTitle>
        </CardHeader>
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
                    <th className="text-right py-2 text-xs text-gray-500 font-medium">Encours</th>
                    <th className="text-center py-2 text-xs text-gray-500 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {topLivreurs.map((l, i) => (
                    <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedLivreur({ id: l.id, nom: l.livreur_nom })}>
                      <td className="py-2.5">
                        <Badge variant={i < 3 ? "default" : "outline"} className="text-[10px] w-6 h-5 flex items-center justify-center">
                          {i + 1}
                        </Badge>
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          {l.bloque_encours && <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />}
                          <div>
                            <p className="font-semibold text-gray-900">{l.livreur_nom || '—'}</p>
                            <p className="text-[10px] text-gray-400">{l.livreur_telephone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-gray-600">{l.nb_courses}</td>
                      <td className="py-2.5 text-right font-bold text-emerald-700">{formatMontant(l.ca)}</td>
                      <td className="py-2.5 text-right text-blue-600">{formatMontant(l.commission)}</td>
                      <td className="py-2.5 text-right text-violet-600">{formatMontant(l.gain)}</td>
                      <td className="py-2.5 text-right">
                        <span className={l.bloque_encours ? "text-red-600 font-bold" : "text-amber-600"}>
                          {formatMontant(l.encours)}
                        </span>
                      </td>
                      <td className="py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => setSelectedLivreur({ id: l.id, nom: l.livreur_nom })}>
                          <Wallet className="w-3 h-3" /> Détail
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-gray-400 text-sm py-4">Aucune course sur la période</p>
          )}
        </CardContent>
      </Card>

      {/* Top Partenaires */}
      {topPartenaires.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <Store className="w-4 h-4 text-purple-500" />
              Top Partenaires ({topPartenaires.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 text-xs text-gray-500 font-medium">#</th>
                    <th className="text-left py-2 text-xs text-gray-500 font-medium">Établissement</th>
                    <th className="text-left py-2 text-xs text-gray-500 font-medium">Type</th>
                    <th className="text-right py-2 text-xs text-gray-500 font-medium">Commandes</th>
                    <th className="text-right py-2 text-xs text-gray-500 font-medium">CA</th>
                    <th className="text-right py-2 text-xs text-gray-500 font-medium">Commission SILGAPP</th>
                    <th className="text-right py-2 text-xs text-gray-500 font-medium">Net partenaire</th>
                  </tr>
                </thead>
                <tbody>
                  {topPartenaires.map((p, i) => (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5">
                        <Badge variant={i < 3 ? "default" : "outline"} className="text-[10px] w-6 h-5 flex items-center justify-center">
                          {i + 1}
                        </Badge>
                      </td>
                      <td className="py-2.5 font-semibold text-gray-900">{p.nom || '—'}</td>
                      <td className="py-2.5">
                        {p.type === 'restaurant'
                          ? <span className="text-[10px] font-bold text-orange-600 flex items-center gap-1"><UtensilsCrossed className="w-3 h-3" /> Restaurant</span>
                          : <span className="text-[10px] font-bold text-blue-600 flex items-center gap-1"><Store className="w-3 h-3" /> Boutique</span>}
                      </td>
                      <td className="py-2.5 text-right text-gray-600">{p.nb}</td>
                      <td className="py-2.5 text-right font-bold text-purple-700">{formatMontant(p.ca)}</td>
                      <td className="py-2.5 text-right text-red-600 font-bold">{formatMontant(p.commission)}</td>
                      <td className="py-2.5 text-right text-violet-600">{formatMontant(p.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Commandes Boutiques & Restaurants — suivi admin */}
      <CommandesPartenairesAdmin countryCode={selectedCountry !== "all" ? selectedCountry : null} />

      {/* Paiements Partenaires — validation admin */}
      <PaiementsPartenairesAdmin countryCode={selectedCountry !== "all" ? selectedCountry : null} />

      {/* Modal détail livreur */}
      {selectedLivreur && (
        <ComptabiliteLivreurDetail
          livreurId={selectedLivreur.id}
          livreurNom={selectedLivreur.nom}
          onClose={() => setSelectedLivreur(null)}
          onPaid={() => handlePaiement(selectedLivreur.id)}
        />
      )}
    </div>
  );
}
