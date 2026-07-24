import React, { useState, useEffect } from 'react';
import { Workflow, Edit3, ScrollText, FlaskConical, Zap } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import WorkflowListTab from '@/components/venus-workflows/WorkflowListTab.jsx';
import WorkflowEditorTab from '@/components/venus-workflows/WorkflowEditorTab.jsx';
import WorkflowJournalTab from '@/components/venus-workflows/WorkflowJournalTab.jsx';
import WorkflowSimulatorTab from '@/components/venus-workflows/WorkflowSimulatorTab.jsx';

const TABS = [
  { id: 'list', label: 'Workflows', icon: Workflow },
  { id: 'editor', label: 'Éditeur', icon: Edit3 },
  { id: 'journal', label: 'Journal', icon: ScrollText },
  { id: 'simulator', label: 'Simulateur', icon: FlaskConical },
];

export default function VenusWorkflowCenter() {
  const [activeTab, setActiveTab] = useState('list');
  const [selectedWorkflowCode, setSelectedWorkflowCode] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.VenusWorkflow.list('-created_date', 50);
      setWorkflows(data || []);
    } catch (e) {
      // Fallback: pas d'entité, les workflows intégrés seront utilisés
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Moteur de Workflows Métier</h1>
                <p className="text-xs text-muted-foreground">Exécution déterministe des processus SILGAPP</p>
              </div>
            </div>
            <Button onClick={handleSeed} size="sm" variant="outline">
              <Zap className="w-4 h-4 mr-1" />
              Initialiser les 12 workflows
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3 overflow-x-auto scrollbar-hide">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        {activeTab === 'list' && (
          <WorkflowListTab workflows={workflows} loading={loading} onEdit={handleEdit} onRefresh={fetchWorkflows} />
        )}
        {activeTab === 'editor' && (
          <WorkflowEditorTab workflows={workflows} selectedCode={selectedWorkflowCode} onRefresh={fetchWorkflows} />
        )}
        {activeTab === 'journal' && <WorkflowJournalTab />}
        {activeTab === 'simulator' && <WorkflowSimulatorTab workflows={workflows} />}
      </div>
    </div>
  );
}