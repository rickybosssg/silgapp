import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, Users, TrendingUp, AlertTriangle, BarChart2,
  RefreshCw, Loader2, Globe, Star,
  FileText, Lightbulb, HelpCircle, CheckCircle2, XCircle, Calendar
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { toast } from "sonner";
import { useAdminContext } from "@/hooks/useAdminContext";

const PAYS_FLAGS = { BF: "", CI: "", TG: "", BJ: "", SN: "", ML: "", GN: "", NE: "" };
const PAYS_NOMS = { BF: "Burkina Faso", CI: "Côte d'Ivoire", TG: "Togo", BJ: "Bénin", SN: "Sénégal", ML: "Mali", GN: "Guinée", NE: "Niger" };

const COLORS = ["#e53e3e","#dd6b20","#d69e2e","#38a169","#3182ce","#805ad5","#d53f8c","#319795","#e53e3e","#744210"];

const PERIODES = [
  { value: "today", label: "Aujourd'hui" },
  { value: "week", label: "7 derniers jours" },
  { value: "month", label: "30 derniers jours" },
  { value: "all", label: "Tout" },
];

const TOP_N_OPTIONS = [10, 20];

function StatCard({ icon: Icon, label, value, color = "from-primary to-red-600", sub }) {
  return (
    <div className={`bg-gradient-to-br ${color} rounded-2xl p-4 text-white shadow-md`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 opacity-80" />
        <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-black leading-none">{value}</p>
      {sub && <p className="text-[10px] opacity-70 mt-1">{sub}</p>}
    </div>
  );
}

function TendanceChart({ data }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} />
        <YAxis tick={{ fontSize: 9 }} />
        <Tooltip formatter={(v) => [v, "Questions"]} labelFormatter={l => l} />
        <Bar dataKey="count" fill="#e53e3e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CategoriesChart({ data }) {
  if (!data?.length) return null;
  const top = data.slice(0, 8);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 8 }}>
        <XAxis type="number" tick={{ fontSize: 9 }} />
        <YAxis type="category" dataKey="label" tick={{ fontSize: 9 }} width={100} />
        <Tooltip formatter={(v, n, p) => [`${v} (${p.payload.pct}%)`, "Questions"]} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {top.map((entry, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function PaysPieChart({ data }) {
  if (!data?.length) return null;
  const chartData = data.map(d => ({ name: `${PAYS_FLAGS[d.code] || ""} ${PAYS_NOMS[d.code] || d.code}`, value: d.count }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
          {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function VenusRapportsPanel() {
  const { selectedCountry, isGlobalAdmin } = useAdminContext();
  const [periode, setPeriode] = useState("week");
  const [topN, setTopN] = useState(10);
  const [viewAllCountries, setViewAllCountries] = useState(false);
  const [generatingRapport, setGeneratingRapport] = useState(null);
  const [lastRapport, setLastRapport] = useState(null);
  const [showRapport, setShowRapport] = useState(false);

  const countryParam = isGlobalAdmin && viewAllCountries ? "ALL" : (selectedCountry || "BF");

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["venus-stats", countryParam, periode, topN],
    queryFn: async () => {
      const res = await base44.functions.invoke("venusAnalytics", {
        action: "get_stats",
        country_code: countryParam,
        periode,
        top_n: topN,
      });
      return res.data;
    },
    refetchInterval: 60000,
  });

  const handleGenerateRapport = async (type) => {
    setGeneratingRapport(type);
    try {
      const res = await base44.functions.invoke("venusAnalytics", {
        action: "generate_rapport",
        type_rapport: type,
        country_code: countryParam,
      });
      setLastRapport({ type, contenu: res.data.recommandations });
      setShowRapport(true);
      toast.success(`Rapport ${type} généré `);
    } catch (err) {
      toast.error("Erreur : " + err.message);
    } finally {
      setGeneratingRapport(null);
    }
  };

  return (
    <div className="space-y-5" id="venus-rapports">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-purple-100">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm text-foreground flex items-center gap-2">
               Rapports VENUS
              <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[10px] font-bold">IA</Badge>
            </p>
            <p className="text-xs text-muted-foreground">Observatoire intelligent des conversations</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5" />
          Actualiser
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Période */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {PERIODES.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriode(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                periode === p.value ? "bg-white shadow text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Super admin : toggle tous les pays */}
        {isGlobalAdmin && (
          <button
            onClick={() => setViewAllCountries(!viewAllCountries)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              viewAllCountries
                ? "bg-violet-600 text-white border-violet-600"
                : "bg-white text-violet-600 border-violet-200 hover:bg-violet-50"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            {viewAllCountries ? " Tous les pays" : `${PAYS_FLAGS[countryParam] || ""} ${PAYS_NOMS[countryParam] || countryParam}`}
          </button>
        )}

        {/* Top N */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 ml-auto">
          {TOP_N_OPTIONS.map(n => (
            <button
              key={n}
              onClick={() => setTopN(n)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                topN === n ? "bg-white shadow text-primary" : "text-muted-foreground"
              }`}
            >
              Top {n}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
        </div>
      ) : !stats ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
          Aucune donnée disponible
        </div>
      ) : (
        <div className="space-y-5">

          {/* Stats générales */}
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Statistiques générales</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <StatCard icon={MessageSquare} label="Questions" value={stats.total_questions} color="from-violet-500 to-purple-600" />
              <StatCard icon={BarChart2} label="Conversations" value={stats.conversations_uniques} color="from-blue-500 to-indigo-600" />
              <StatCard icon={Users} label="Clients" value={stats.clients_uniques} color="from-pink-500 to-rose-500" />
              <StatCard icon={TrendingUp} label="Livreurs" value={stats.livreurs_uniques} color="from-orange-500 to-amber-500" />
              <StatCard icon={CheckCircle2} label="Résolues" value={stats.resolues} color="from-green-500 to-emerald-500" />
              <StatCard icon={XCircle} label="Non résolues" value={stats.non_resolues} color="from-red-500 to-rose-600" />
            </div>
          </div>

          {/* Tendance 7 jours */}
          {stats.tendance?.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3"> Tendance (7 jours)</p>
              <TendanceChart data={stats.tendance} />
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Top questions */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3"> Top {topN} questions</p>
              {stats.top_questions?.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Aucune question enregistrée</p>
              ) : (
                <div className="space-y-2">
                  {stats.top_questions?.map((q, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black flex-shrink-0 mt-0.5 ${
                        i === 0 ? "bg-yellow-100 text-yellow-700" :
                        i === 1 ? "bg-gray-100 text-gray-600" :
                        i === 2 ? "bg-orange-100 text-orange-700" :
                        "bg-gray-50 text-gray-400"
                      }`}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground line-clamp-2">{q.question}</p>
                      </div>
                      <Badge className="bg-violet-100 text-violet-700 border-0 text-[10px] flex-shrink-0">{q.count}x</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Répartition par catégorie */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3"> Répartition par catégorie</p>
              {stats.categories?.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Aucune donnée</p>
              ) : (
                <CategoriesChart data={stats.categories} />
              )}
            </div>
          </div>

          {/* Catégories liste */}
          {stats.categories?.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3"> Détail des catégories</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {stats.categories.map((cat, i) => (
                  <div key={cat.categorie} className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{cat.label}</p>
                    </div>
                    <span className="text-xs font-black text-muted-foreground flex-shrink-0">{cat.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analyse des problèmes */}
          {stats.problemes?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <p className="text-xs font-bold text-amber-800 uppercase tracking-widest">Problèmes détectés</p>
              </div>
              <div className="space-y-2">
                {stats.problemes.map((p, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-900">
                    <span className="mt-0.5 flex-shrink-0"></span>
                    <span>{p.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Répartition par pays (super admin ALL) */}
          {stats.par_pays?.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3"> Comparaison par pays</p>
              <div className="grid lg:grid-cols-2 gap-4">
                <PaysPieChart data={stats.par_pays} />
                <div className="space-y-2">
                  {stats.par_pays.map((p, i) => (
                    <div key={p.code} className="flex items-center gap-2">
                      <span className="text-base">{PAYS_FLAGS[p.code] || ""}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="font-semibold">{PAYS_NOMS[p.code] || p.code}</span>
                          <span className="text-muted-foreground">{p.count}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${(p.count / stats.par_pays[0].count) * 100}%`,
                              backgroundColor: COLORS[i % COLORS.length]
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Rapports automatiques */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
              <FileText className="w-3.5 h-3.5 inline mr-1.5" />
              Générer un rapport IA
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { type: "quotidien", label: "Quotidien", icon: Calendar, color: "from-blue-500 to-indigo-500" },
                { type: "hebdomadaire", label: "Hebdomadaire", icon: TrendingUp, color: "from-green-500 to-emerald-500" },
                { type: "mensuel", label: "Mensuel", icon: Star, color: "from-violet-500 to-purple-600" },
              ].map(r => {
                const Icon = r.icon;
                const isGen = generatingRapport === r.type;
                return (
                  <button
                    key={r.type}
                    onClick={() => handleGenerateRapport(r.type)}
                    disabled={!!generatingRapport}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-transparent bg-gradient-to-br ${r.color} text-white hover:opacity-90 transition-all disabled:opacity-50`}
                  >
                    {isGen ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
                    <span className="text-xs font-bold">{r.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Affichage du dernier rapport généré */}
          {showRapport && lastRapport && (
            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-violet-600" />
                  <p className="text-xs font-bold text-violet-800 uppercase tracking-widest">
                    Rapport {lastRapport.type} — Recommandations VENUS
                  </p>
                </div>
                <button onClick={() => setShowRapport(false)} className="text-violet-400 hover:text-violet-600">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs text-violet-900 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                {lastRapport.contenu}
              </div>
            </div>
          )}

          {/* Questions sans réponse / insatisfaction */}
          {stats.non_resolues > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <HelpCircle className="w-4 h-4 text-red-600" />
                <p className="text-xs font-bold text-red-800 uppercase tracking-widest">Lacunes identifiées</p>
              </div>
              <p className="text-xs text-red-700">
                <strong>{stats.non_resolues}</strong> conversation{stats.non_resolues > 1 ? "s" : ""} marquée{stats.non_resolues > 1 ? "s" : ""} "non résolue".
                Consultez les interactions pour identifier les questions sans réponse satisfaisante.
              </p>
              {stats.escalades > 0 && (
                <p className="text-xs text-red-700 mt-1">
                  <strong>{stats.escalades}</strong> escalade{stats.escalades > 1 ? "s" : ""} nécessitant une intervention humaine.
                </p>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}