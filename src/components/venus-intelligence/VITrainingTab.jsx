import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertCircle, Edit3, Lightbulb, TrendingDown, History, FileBarChart, Bell, GraduationCap, Target, MessageSquareText, ScrollText, FlaskConical, Trophy } from 'lucide-react';
import SubTabNav from './SubTabNav';
import MisunderstoodTab from '@/components/venus-learning/MisunderstoodTab';
import CorrectionTab from '@/components/venus-learning/CorrectionTab';
import SuggestionsTab from '@/components/venus-improvement/SuggestionsTab';
import WeaknessesTab from '@/components/venus-improvement/WeaknessesTab';
import HistoryTab from '@/components/venus-learning/HistoryTab';
import ReportsTab from '@/components/venus-improvement/ReportsTab';
import AlertsTab from '@/components/venus-improvement/AlertsTab';
import TrainingPathsTab from './TrainingPathsTab';
import IntentionsTab from './IntentionsTab';
import TrainingDialoguesTab from './TrainingDialoguesTab';
import BusinessRulesTab from './BusinessRulesTab';
import SimulationModeTab from './SimulationModeTab';
import EvaluationTab from './EvaluationTab';

const SUB_TABS = [
  { id: 'misunderstood', label: 'Questions non comprises', icon: AlertCircle },
  { id: 'correction', label: 'Corrections', icon: Edit3 },
  { id: 'suggestions', label: 'Suggestions VENUS', icon: Lightbulb },
  { id: 'faiblesses', label: 'Faiblesses', icon: TrendingDown },
  { id: 'paths', label: 'Parcours', icon: GraduationCap },
  { id: 'intentions', label: 'Intentions', icon: Target },
  { id: 'dialogues', label: 'Dialogues', icon: MessageSquareText },
  { id: 'rules', label: 'Règles métier', icon: ScrollText },
  { id: 'simulation', label: 'Simulation', icon: FlaskConical },
  { id: 'evaluation', label: 'Évaluation', icon: Trophy },
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

  const handleCorrectionDone = async () => {
    // Auto-apprentissage: mettre à jour le score du domaine concerné
    if (correctionData?.categorie) {
      try {
        const existing = await base44.entities.VenusDomainScore.filter({ domaine: correctionData.categorie });
        if (existing.length > 0) {
          const d = existing[0];
          await base44.entities.VenusDomainScore.update(d.id, {
            nb_interactions: (d.nb_interactions || 0) + 1,
            nb_reussies: (d.nb_reussies || 0) + 1,
            date_maj: new Date().toISOString(),
          });
        }
      } catch (e) { console.warn('Auto-learning error:', e); }
    }
    setCorrectionData(null);
    setActiveTab('misunderstood');
  };

  return (
    <div>
      <SubTabNav tabs={SUB_TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'misunderstood' && <MisunderstoodTab onCorriger={openCorrection} />}
      {activeTab === 'correction' && (
        <CorrectionTab presetData={correctionData} onDone={handleCorrectionDone} />
      )}
      {activeTab === 'suggestions' && <SuggestionsTab />}
      {activeTab === 'faiblesses' && <WeaknessesTab />}
      {activeTab === 'paths' && <TrainingPathsTab />}
      {activeTab === 'intentions' && <IntentionsTab />}
      {activeTab === 'dialogues' && <TrainingDialoguesTab />}
      {activeTab === 'rules' && <BusinessRulesTab />}
      {activeTab === 'simulation' && <SimulationModeTab />}
      {activeTab === 'evaluation' && <EvaluationTab />}
      {activeTab === 'history' && <HistoryTab />}
      {activeTab === 'reports' && <ReportsTab />}
      {activeTab === 'alerts' && <AlertsTab />}
    </div>
  );
}