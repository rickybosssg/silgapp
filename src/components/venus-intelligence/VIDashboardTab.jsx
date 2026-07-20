import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { MessageCircle, Bot, Zap, Package, Activity, TrendingUp, AlertCircle } from 'lucide-react';
import AgentOverviewTab from '@/components/venus-agent/AgentOverviewTab.jsx';
import PendingCoursesStatus from '@/components/admin/PendingCoursesStatus';
import TranscriptionJournal from '@/components/admin/TranscriptionJournal';

function KpiCard({ icon: Icon, label, value, sub, gradient }) {
  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-2xl p-4 text-white shadow-md`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 opacity-80" />
        <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-black leading-none">{value}</p>
      {sub && <p className="text-[10px] opacity-70 mt-1">{sub}</p>}
    </div>
  );
}

export default function VIDashboardTab() {
  const { data: convs = [] } = useQuery({
    queryKey: ['vi-convs'],
    queryFn: () => base44.entities.Conversation.filter({ source: 'whatsapp', archived: false }, '-last_message_date', 100),
    refetchInterval: 15000,
  });

  const { data: interactions = [] } = useQuery({
    queryKey: ['vi-interactions'],
    queryFn: () => base44.entities.VenusInteraction.list('-created_date', 50),
    refetchInterval: 30000,
  });

  const { data: courses = [] } = useQuery({
    queryKey: ['vi-courses-wa'],
    queryFn: () => base44.entities.CourseExterne.filter({ source: 'client' }, '-created_date', 50),
    refetchInterval: 30000,
  });

  const totalConvs = convs.length;
  const venusActive = convs.filter(c => c.venus_active !== false).length;
  const adminTakeover = convs.filter(c => c.venus_active === false).length;
  const venusRate = totalConvs > 0 ? Math.round((venusActive / totalConvs) * 100) : 0;

  const todayStr = new Date().toISOString().split('T')[0];
  const interactionsToday = interactions.filter(i => i.date_conversation === todayStr);
  const coursesToday = courses.filter(c => c.created_date?.startsWith(todayStr));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard icon={MessageCircle} label="Conversations actives" value={totalConvs} sub={`${coursesToday.length} course(s) aujourd'hui`} gradient="from-violet-500 to-purple-600" />
        <KpiCard icon={Bot} label="Venus active" value={`${venusRate}%`} sub={`${venusActive} auto / ${adminTakeover} manuel`} gradient="from-green-500 to-emerald-500" />
        <KpiCard icon={Zap} label="Interactions aujourd'hui" value={interactionsToday.length} sub={`${interactions.length} total`} gradient="from-blue-500 to-indigo-500" />
        <KpiCard icon={Package} label="Courses via WhatsApp" value={coursesToday.length} sub="créées par Venus" gradient="from-orange-500 to-amber-500" />
      </div>

      {totalConvs > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Répartition automation</p>
            <span className="text-xs text-gray-400">{totalConvs} conversations</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
            <div className="bg-gradient-to-r from-green-500 to-emerald-500" style={{ width: `${venusRate}%` }} />
            <div className="bg-gradient-to-r from-orange-400 to-red-500" style={{ width: `${100 - venusRate}%` }} />
          </div>
          <div className="flex items-center justify-between mt-2 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="font-semibold text-green-700">{venusActive} Venus auto</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              <span className="font-semibold text-orange-700">{adminTakeover} admin manuel</span>
            </span>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4 text-primary" />
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Agent IA Autonome</p>
        </div>
        <AgentOverviewTab />
      </div>

      <PendingCoursesStatus />
      <TranscriptionJournal />
    </div>
  );
}