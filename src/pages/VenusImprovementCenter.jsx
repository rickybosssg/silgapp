import React, { useState } from 'react';
import { Brain, Lightbulb, TrendingDown, FileBarChart, Bell, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import ImprovementOverviewTab from '@/components/venus-improvement/ImprovementOverviewTab';
import SuggestionsTab from '@/components/venus-improvement/SuggestionsTab';
import WeaknessesTab from '@/components/venus-improvement/WeaknessesTab';
import ReportsTab from '@/components/venus-improvement/ReportsTab';
import AlertsTab from '@/components/venus-improvement/AlertsTab';

const TABS = [
  { id: 'overview', label: 'Centre d\'Amélioration', icon: Brain },
  { id: 'suggestions', label: 'Suggestions', icon: Lightbulb },
  { id: 'faiblesses', label: 'Faiblesses', icon: TrendingDown },
  { id: 'rapports', label: 'Rapports', icon: FileBarChart },
  { id: 'alertes', label: 'Alertes', icon: Bell },
];

export default function VenusImprovementCenter() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Moteur d'Apprentissage Continu VENUS</h1>
            <p className="text-sm text-gray-500">Analyse, suggestions et amélioration sous contrôle administrateur</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto scrollbar-hide bg-white rounded-xl p-1 shadow-sm border border-gray-100">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <Card className="p-4 md:p-6 border-gray-100">
        {activeTab === 'overview' && <ImprovementOverviewTab onNavigate={setActiveTab} />}
        {activeTab === 'suggestions' && <SuggestionsTab />}
        {activeTab === 'faiblesses' && <WeaknessesTab />}
        {activeTab === 'rapports' && <ReportsTab />}
        {activeTab === 'alertes' && <AlertsTab />}
      </Card>
    </div>
  );
}