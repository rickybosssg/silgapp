import React, { useState } from 'react';
import { Brain, Sparkles, Eye, BarChart3, MemoryStick, Zap, ScrollText, Bot } from 'lucide-react';
import AgentOverviewTab from '@/components/venus-agent/AgentOverviewTab.jsx';
import AdminAssistantTab from '@/components/venus-agent/AdminAssistantTab.jsx';
import AgentActionsTab from '@/components/venus-agent/AgentActionsTab.jsx';
import BusinessInsightsTab from '@/components/venus-agent/BusinessInsightsTab.jsx';
import StrategicMemoryTab from '@/components/venus-agent/StrategicMemoryTab.jsx';
import AutomationRulesTab from '@/components/venus-agent/AutomationRulesTab.jsx';
import DecisionLogTab from '@/components/venus-agent/DecisionLogTab.jsx';

const TABS = [
  { id: 'overview', label: 'Tableau de Bord', icon: Bot },
  { id: 'assistant', label: 'Assistant Admin', icon: Sparkles },
  { id: 'actions', label: 'Actions Agent', icon: Zap },
  { id: 'insights', label: 'Insights Métier', icon: BarChart3 },
  { id: 'memory', label: 'Mémoire Stratégique', icon: MemoryStick },
  { id: 'rules', label: 'Automatisations', icon: Brain },
  { id: 'decisions', label: 'Journal Décisions', icon: ScrollText },
];

export default function VenusAgentCenter() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg">
            <Bot className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Agent IA Autonome VENUS</h1>
            <p className="text-sm text-muted-foreground">Comprendre · Raisonner · Planifier · Agir · Vérifier · Améliorer</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 flex gap-2 overflow-x-auto scrollbar-hide pb-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-card text-muted-foreground hover:bg-accent/10 hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto">
        {activeTab === 'overview' && <AgentOverviewTab />}
        {activeTab === 'assistant' && <AdminAssistantTab />}
        {activeTab === 'actions' && <AgentActionsTab />}
        {activeTab === 'insights' && <BusinessInsightsTab />}
        {activeTab === 'memory' && <StrategicMemoryTab />}
        {activeTab === 'rules' && <AutomationRulesTab />}
        {activeTab === 'decisions' && <DecisionLogTab />}
      </div>
    </div>
  );
}