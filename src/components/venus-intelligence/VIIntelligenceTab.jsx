import React, { useState, useEffect } from 'react';
import { Brain, Database, Activity, ScrollText, MemoryStick, Zap } from 'lucide-react';
import SubTabNav from './SubTabNav';
import ReasoningLogTab from '@/components/venus-brain/ReasoningLogTab.jsx';
import LongTermMemoryTab from '@/components/venus-brain/LongTermMemoryTab.jsx';
import ActiveMemoryTab from '@/components/venus-brain/ActiveMemoryTab.jsx';
import DecisionLogTab from '@/components/venus-agent/DecisionLogTab.jsx';
import StrategicMemoryTab from '@/components/venus-agent/StrategicMemoryTab.jsx';
import AgentActionsTab from '@/components/venus-agent/AgentActionsTab.jsx';

const SUB_TABS = [
  { id: 'reasoning', label: 'Raisonnement', icon: Brain },
  { id: 'longterm', label: 'Mémoire longue', icon: Database },
  { id: 'active', label: 'Mémoire active', icon: Activity },
  { id: 'decisions', label: 'Décisions', icon: ScrollText },
  { id: 'strategic', label: 'Mémoire stratégique', icon: MemoryStick },
  { id: 'actions', label: 'Actions agent', icon: Zap },
];

export default function VIIntelligenceTab({ forcedSubTab }) {
  const [activeTab, setActiveTab] = useState('reasoning');

  useEffect(() => {
    if (forcedSubTab) setActiveTab(forcedSubTab);
  }, [forcedSubTab]);

  return (
    <div>
      <SubTabNav tabs={SUB_TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'reasoning' && <ReasoningLogTab />}
      {activeTab === 'longterm' && <LongTermMemoryTab />}
      {activeTab === 'active' && <ActiveMemoryTab />}
      {activeTab === 'decisions' && <DecisionLogTab />}
      {activeTab === 'strategic' && <StrategicMemoryTab />}
      {activeTab === 'actions' && <AgentActionsTab />}
    </div>
  );
}