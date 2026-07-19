import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { MessageCircle, CheckCircle, XCircle, Edit3, BookOpen, MessageSquare, Clock, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

export default function DashboardTab() {
  const { data: interactions = [] } = useQuery({
    queryKey: ['venus-interactions-dashboard'],
    queryFn: () => base44.entities.VenusInteraction.list('-created_date', 500),
  });
  const { data: knowledge = [] } = useQuery({
    queryKey: ['venus-knowledge-dashboard'],
    queryFn: () => base44.entities.VenusKnowledge.list('-created_date', 200),
  });
  const { data: corrections = [] } = useQuery({
    queryKey: ['venus-corrections-dashboard'],
    queryFn: () => base44.entities.VenusCorrection.list('-created_date', 200),
  });
  const { data: scenarios = [] } = useQuery({
    queryKey: ['venus-scenarios-dashboard'],
    queryFn: () => base44.entities.VenusScenario.list('-created_date', 200),
  });

  const today = new Date().toISOString().split('T')[0];
  const todayInteractions = interactions.filter(i => i.date_conversation === today);
  const understood = interactions.filter(i => i.statut === 'resolu');
  const notUnderstood = interactions.filter(i => i.statut === 'non_resolu' || i.satisfaction === 'negative');
  const successRate = interactions.length > 0 ? Math.round((understood.length / interactions.length) * 100) : 0;
  const failureRate = interactions.length > 0 ? 100 - successRate : 0;
  const avgResponseTime = interactions.length > 0
    ? Math.round(interactions.reduce((sum, i) => sum + (i.duree_secondes || 0), 0) / interactions.length)
    : 0;

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });
  const dailyData = last7Days.map(date => {
    const dayInteractions = interactions.filter(i => i.date_conversation === date);
    const dayResolved = dayInteractions.filter(i => i.statut === 'resolu');
    return { date: date.substring(5), conversations: dayInteractions.length, resolues: dayResolved.length };
  });

  const stats = [
    { label: 'Total conversations', value: interactions.length, icon: MessageCircle, color: 'text-blue-600 bg-blue-50' },
    { label: "Aujourd'hui", value: todayInteractions.length, icon: TrendingUp, color: 'text-green-600 bg-green-50' },
    { label: 'Questions comprises', value: understood.length, icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Non comprises', value: notUnderstood.length, icon: XCircle, color: 'text-red-600 bg-red-50' },
    { label: 'Taux de réussite', value: `${successRate}%`, icon: CheckCircle, color: 'text-green-600 bg-green-50' },
    { label: "Taux d'échec", value: `${failureRate}%`, icon: XCircle, color: 'text-orange-600 bg-orange-50' },
    { label: 'Corrections', value: corrections.length, icon: Edit3, color: 'text-purple-600 bg-purple-50' },
    { label: 'Connaissances', value: knowledge.length, icon: BookOpen, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Scénarios', value: scenarios.length, icon: MessageSquare, color: 'text-cyan-600 bg-cyan-50' },
    { label: 'Temps moyen (s)', value: avgResponseTime, icon: Clock, color: 'text-slate-600 bg-slate-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-4">Évolution journalière (7 jours)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip />
              <Line type="monotone" dataKey="conversations" stroke="#3b82f6" strokeWidth={2} name="Conversations" />
              <Line type="monotone" dataKey="resolues" stroke="#10b981" strokeWidth={2} name="Résolues" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-4">Répartition par statut</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={[
              { name: 'Résolu', value: understood.length, fill: '#10b981' },
              { name: 'Non résolu', value: notUnderstood.length, fill: '#ef4444' },
              { name: 'Escalade', value: interactions.filter(i => i.statut === 'escalade').length, fill: '#f59e0b' },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}