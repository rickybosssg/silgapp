import React from 'react';
import { Card } from '@/components/ui/card';
import { Users, CheckCircle, Clock, Zap, TrendingUp, TrendingDown, Brain, AlertCircle } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#eab308', '#06b6d4', '#ec4899'];

function KpiCard({ icon: Icon, label, value, unit, trend, color }) {
  return (
    <Card className="p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {value}<span className="text-sm text-gray-400 ml-1">{unit}</span>
          </p>
          {trend != null && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </Card>
  );
}

export default function SupervisionOverviewTab({ dashboard, onRefresh }) {
  const m = dashboard?.metrics?.temps_reel;
  const evol = dashboard?.metrics?.evolution_7j || [];
  const intentions = dashboard?.metrics?.repartition_intentions || [];
  const sources = dashboard?.metrics?.repartition_sources || [];
  const pays = dashboard?.metrics?.repartition_pays || [];

  if (!m) return <div className="text-center py-10 text-gray-500">Aucune donnée disponible</div>;

  const santeGlobale = Math.round((m.taux_reussite + m.score_qualite_moyen + m.confiance_moyenne) / 3);

  return (
    <div className="space-y-6">
      {/* Santé globale */}
      <Card className="p-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">Santé globale de VENUS</p>
            <p className="text-4xl font-bold mt-1">{santeGlobale}<span className="text-lg text-slate-400">/100</span></p>
            <p className="text-sm text-slate-400 mt-1">
              {santeGlobale >= 80 ? 'Excellent' : santeGlobale >= 60 ? 'Correct' : 'Attention requise'}
            </p>
          </div>
          <div className="text-right space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-slate-300">Outils: {dashboard?.tools?.operationnels}/{dashboard?.tools?.total}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-slate-300">Alertes: {m.alerts_actives}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-slate-300">Workflows: {m.workflows_en_cours}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="Conversations en cours" value={m.conversations_en_cours} color="bg-blue-500" />
        <KpiCard icon={CheckCircle} label="Terminées (jour)" value={m.conversations_terminees_jour} color="bg-green-500" />
        <KpiCard icon={Clock} label="Temps de réponse" value={m.temps_reponse_moyen_ms} unit="ms" color="bg-purple-500" />
        <KpiCard icon={Zap} label="Temps résolution" value={m.temps_resolution_moyen_sec} unit="s" color="bg-orange-500" />
        <KpiCard icon={TrendingUp} label="Taux de réussite" value={m.taux_reussite} unit="%" color="bg-green-600" />
        <KpiCard icon={TrendingDown} label="Taux d'échec" value={m.taux_echec} unit="%" color="bg-red-500" />
        <KpiCard icon={AlertCircle} label="Escalades humaines" value={m.interventions_humaines} color="bg-amber-500" />
        <KpiCard icon={Brain} label="Score confiance" value={m.confiance_moyenne} unit="/100" color="bg-indigo-500" />
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Évolution 7 jours</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={evol}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="total" stroke="#3b82f6" name="Total" strokeWidth={2} />
              <Line type="monotone" dataKey="reussites" stroke="#22c55e" name="Réussies" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Répartition des intentions</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={intentions} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="intention" type="category" tick={{ fontSize: 10 }} width={100} />
              <Tooltip />
              <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Sources de réponses</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={sources} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={80} label={({ source, count }) => `${source}: ${count}`}>
                {sources.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Répartition par pays</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={pays}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="pays" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}