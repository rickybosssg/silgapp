import React, { useState, useEffect } from 'react';
import { MessageSquare, FlaskConical } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import SubTabNav from './SubTabNav';
import ScenariosTab from '@/components/venus-learning/ScenariosTab';
import WorkflowSimulatorTab from '@/components/venus-workflows/WorkflowSimulatorTab.jsx';

const SUB_TABS = [
  { id: 'library', label: 'Bibliothèque', icon: MessageSquare },
  { id: 'simulator', label: 'Simulateur', icon: FlaskConical },
];

export default function VIScenariosTab({ forcedSubTab }) {
  const [activeTab, setActiveTab] = useState('library');
  const [workflows, setWorkflows] = useState([]);

  useEffect(() => {
    if (forcedSubTab) setActiveTab(forcedSubTab);
  }, [forcedSubTab]);

  useEffect(() => {
    base44.entities.VenusWorkflow.list('-created_date', 50).then(setWorkflows).catch(() => {});
  }, []);

  return (
    <div>
      <SubTabNav tabs={SUB_TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'library' && <ScenariosTab />}
      {activeTab === 'simulator' && <WorkflowSimulatorTab workflows={workflows} />}
    </div>
  );
}