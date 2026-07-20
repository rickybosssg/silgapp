import React, { useState, useEffect } from 'react';
import { Workflow, Edit3, ScrollText, Zap } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import SubTabNav from './SubTabNav';
import WorkflowListTab from '@/components/venus-workflows/WorkflowListTab.jsx';
import WorkflowEditorTab from '@/components/venus-workflows/WorkflowEditorTab.jsx';
import WorkflowJournalTab from '@/components/venus-workflows/WorkflowJournalTab.jsx';

const SUB_TABS = [
  { id: 'list', label: 'Workflows', icon: Workflow },
  { id: 'editor', label: 'Éditeur', icon: Edit3 },
  { id: 'journal', label: 'Journal', icon: ScrollText },
];

export default function VIWorkflowsTab({ forcedSubTab }) {
  const [activeTab, setActiveTab] = useState('list');
  const [selectedWorkflowCode, setSelectedWorkflowCode] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (forcedSubTab) setActiveTab(forcedSubTab);
  }, [forcedSubTab]);

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.VenusWorkflow.list('-created_date', 50);
      setWorkflows(data || []);
    } catch (e) {
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWorkflows(); }, []);

  const handleSeed = async () => {
    try {
      const result = await base44.functions.invoke('venusWorkflowEventHandler', { action: 'seed' });
      toast({ title: 'Workflows initialisés', description: `${result?.created || 0} créés, ${result?.updated || 0} mis à jour` });
      fetchWorkflows();
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    }
  };

  const handleEdit = (code) => {
    setSelectedWorkflowCode(code);
    setActiveTab('editor');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SubTabNav tabs={SUB_TABS} activeTab={activeTab} onChange={setActiveTab} />
        <Button onClick={handleSeed} size="sm" variant="outline" className="flex-shrink-0 ml-2">
          <Zap className="w-4 h-4 mr-1" />
          Initialiser
        </Button>
      </div>
      {activeTab === 'list' && (
        <WorkflowListTab workflows={workflows} loading={loading} onEdit={handleEdit} onRefresh={fetchWorkflows} />
      )}
      {activeTab === 'editor' && (
        <WorkflowEditorTab workflows={workflows} selectedCode={selectedWorkflowCode} onRefresh={fetchWorkflows} />
      )}
      {activeTab === 'journal' && <WorkflowJournalTab />}
    </div>
  );
}