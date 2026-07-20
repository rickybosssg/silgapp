import React, { useState } from 'react';
import { GraduationCap, LayoutDashboard, BookOpen, MessageSquare, AlertCircle, Edit3, History as HistoryIcon, Search, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import DashboardTab from '@/components/venus-learning/DashboardTab';
import KnowledgeBaseTab from '@/components/venus-learning/KnowledgeBaseTab';
import ScenariosTab from '@/components/venus-learning/ScenariosTab';
import MisunderstoodTab from '@/components/venus-learning/MisunderstoodTab';
import CorrectionTab from '@/components/venus-learning/CorrectionTab';
import HistoryTab from '@/components/venus-learning/HistoryTab';
import SearchTab from '@/components/venus-learning/SearchTab';
import AuditTab from '@/components/venus-learning/AuditTab';
import RagStatusTab from '@/components/venus-learning/RagStatusTab';
import { Database } from 'lucide-react';

const TABS = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'knowledge', label: 'Base de connaissances', icon: BookOpen },
  { id: 'rag_status', label: 'Statut RAG', icon: Database },
  { id: 'scenarios', label: 'Scénarios', icon: MessageSquare },
  { id: 'misunderstood', label: 'Questions non comprises', icon: AlertCircle },
  { id: 'correction', label: 'Correction VENUS', icon: Edit3 },
  { id: 'history', label: 'Historique', icon: HistoryIcon },
  { id: 'search', label: 'Recherche intelligente', icon: Search },
  { id: 'audit', label: 'Audit', icon: Shield },
];

export default function VenusLearningCenter() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [correctionData, setCorrectionData] = useState(null);

  const openCorrection = (interaction) => {
    setCorrectionData(interaction);
    setActiveTab('correction');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="px-4 md:px-6 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-red-600 flex items-center justify-center shadow-md">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Centre d'Apprentissage VENUS</h1>
              <p className="text-sm text-slate-500">Entraînez et améliorez l'intelligence de VENUS</p>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                    activeTab === tab.id
                      ? "bg-primary text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="p-4 md:p-6">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'knowledge' && <KnowledgeBaseTab />}
        {activeTab === 'scenarios' && <ScenariosTab />}
        {activeTab === 'misunderstood' && <MisunderstoodTab onCorriger={openCorrection} />}
        {activeTab === 'correction' && (
          <CorrectionTab
            presetData={correctionData}
            onDone={() => { setCorrectionData(null); setActiveTab('misunderstood'); }}
          />
        )}
        {activeTab === 'history' && <HistoryTab />}
        {activeTab === 'search' && <SearchTab />}
        {activeTab === 'rag_status' && <RagStatusTab />}
        {activeTab === 'audit' && <AuditTab />}
      </div>
    </div>
  );
}