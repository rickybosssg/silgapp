import React, { useState, useEffect } from 'react';
import { AlertCircle, Edit3, Lightbulb, TrendingDown, History, FileBarChart, Bell } from 'lucide-react';
import SubTabNav from './SubTabNav';
import MisunderstoodTab from '@/components/venus-learning/MisunderstoodTab';
import CorrectionTab from '@/components/venus-learning/CorrectionTab';
import SuggestionsTab from '@/components/venus-improvement/SuggestionsTab';
import WeaknessesTab from '@/components/venus-improvement/WeaknessesTab';
import HistoryTab from '@/components/venus-learning/HistoryTab';
import ReportsTab from '@/components/venus-improvement/ReportsTab';
import AlertsTab from '@/components/venus-improvement/AlertsTab';

const SUB_TABS = [
  { id: 'misunderstood', label: 'Questions non comprises', icon: AlertCircle },
  { id: 'correction', label: 'Corrections', icon: Edit3 },
  { id: 'suggestions', label: 'Suggestions VENUS', icon: Lightbulb },
  { id: 'faiblesses', label: 'Faiblesses', icon: TrendingDown },
  { id: 'history', label: 'Historique', icon: History },
  { id: 'reports', label: 'Rapports', icon: FileBarChart },
  { id: 'alerts', label: 'Alertes', icon: Bell },
];

export default function VITrainingTab({ forcedSubTab }) {
  const [activeTab, setActiveTab] = useState('misunderstood');
  const [correctionData, setCorrectionData] = useState(null);

  useEffect(() => {
    if (forcedSubTab) setActiveTab(forcedSubTab);
  }, [forcedSubTab]);

  const openCorrection = (interaction) => {
    setCorrectionData(interaction);
    setActiveTab('correction');
  };

  return (
    <div>
      <SubTabNav tabs={SUB_TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'misunderstood' && <MisunderstoodTab onCorriger={openCorrection} />}
      {activeTab === 'correction' && (
        <CorrectionTab
          presetData={correctionData}
          onDone={() => { setCorrectionData(null); setActiveTab('misunderstood'); }}
        />
      )}
      {activeTab === 'suggestions' && <SuggestionsTab />}
      {activeTab === 'faiblesses' && <WeaknessesTab />}
      {activeTab === 'history' && <HistoryTab />}
      {activeTab === 'reports' && <ReportsTab />}
      {activeTab === 'alerts' && <AlertsTab />}
    </div>
  );
}