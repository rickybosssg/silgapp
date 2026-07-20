import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard, GraduationCap, BookOpen, FlaskConical, Workflow,
  MessageCircle, Brain, BarChart3, Settings, ShieldCheck,
  ArrowLeft, Bot, Sparkles, Menu, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import GlobalSearch from '@/components/venus-intelligence/GlobalSearch';
import VIDashboardTab from '@/components/venus-intelligence/VIDashboardTab';
import VITrainingTab from '@/components/venus-intelligence/VITrainingTab';
import VIKnowledgeTab from '@/components/venus-intelligence/VIKnowledgeTab';
import VIScenariosTab from '@/components/venus-intelligence/VIScenariosTab';
import VIWorkflowsTab from '@/components/venus-intelligence/VIWorkflowsTab';
import VIConversationsTab from '@/components/venus-intelligence/VIConversationsTab';
import VIIntelligenceTab from '@/components/venus-intelligence/VIIntelligenceTab';
import VIAnalysisTab from '@/components/venus-intelligence/VIAnalysisTab';
import VIConfigurationTab from '@/components/venus-intelligence/VIConfigurationTab';
import VISupervisionTab from '@/components/venus-intelligence/VISupervisionTab';

const TABS = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'training', label: 'Entraînement', icon: GraduationCap },
  { id: 'knowledge', label: 'Base de connaissances', icon: BookOpen },
  { id: 'scenarios', label: 'Scénarios', icon: FlaskConical },
  { id: 'workflows', label: 'Workflows', icon: Workflow },
  { id: 'conversations', label: 'Conversations', icon: MessageCircle },
  { id: 'intelligence', label: 'Intelligence', icon: Brain },
  { id: 'analysis', label: 'Analyse', icon: BarChart3 },
  { id: 'configuration', label: 'Configuration', icon: Settings },
  { id: 'supervision', label: 'Supervision', icon: ShieldCheck },
];

const SEARCH_INDEX = [
  // Dashboard
  { tab: 'dashboard', label: 'État de santé de VENUS', keywords: ['santé', 'health', 'status', 'état'] },
  { tab: 'dashboard', label: 'Conversations du jour', keywords: ['conversation', 'jour', 'today', 'actif'] },
  { tab: 'dashboard', label: 'Score global', keywords: ['score', 'global', 'taux', 'réussite'] },
  { tab: 'dashboard', label: 'Temps de réponse', keywords: ['temps', 'réponse', 'latence', 'response'] },
  { tab: 'dashboard', label: 'Activité temps réel', keywords: ['activité', 'real time', 'temps réel'] },
  // Training
  { tab: 'training', subTab: 'misunderstood', label: 'Questions non comprises', keywords: ['non compris', 'mal compris', 'incompris', 'question'] },
  { tab: 'training', subTab: 'correction', label: 'Corrections proposées', keywords: ['correction', 'corriger', 'proposée', 'valider'] },
  { tab: 'training', subTab: 'suggestions', label: 'Suggestions de VENUS', keywords: ['suggestion', 'amélioration', 'amelioration'] },
  { tab: 'training', subTab: 'faiblesses', label: 'Faiblesses détectées', keywords: ['faiblesse', 'weakness', 'problème'] },
  { tab: 'training', subTab: 'history', label: 'Historique d\'apprentissage', keywords: ['historique', 'apprentissage', 'history'] },
  { tab: 'training', subTab: 'reports', label: 'Rapports d\'amélioration', keywords: ['rapport', 'report', 'amélioration'] },
  { tab: 'training', subTab: 'alerts', label: 'Alertes d\'apprentissage', keywords: ['alerte', 'alert', 'training'] },
  // Knowledge
  { tab: 'knowledge', subTab: 'base', label: 'FAQ & Procédures', keywords: ['faq', 'connaissance', 'knowledge', 'procédure', 'tarif', 'réponse officielle'] },
  { tab: 'knowledge', subTab: 'documents', label: 'Documents RAG', keywords: ['document', 'rag', 'bibliothèque', 'library'] },
  { tab: 'knowledge', subTab: 'upload', label: 'Importer un document', keywords: ['importer', 'upload', 'ajouter', 'document'] },
  { tab: 'knowledge', subTab: 'search', label: 'Recherche sémantique', keywords: ['recherche', 'search', 'sémantique', 'intelligente'] },
  { tab: 'knowledge', subTab: 'docsearch', label: 'Test RAG', keywords: ['test', 'rag', 'recherche document'] },
  { tab: 'knowledge', subTab: 'analytics', label: 'Analytique documents', keywords: ['analytique', 'analytics', 'statistique document'] },
  // Scenarios
  { tab: 'scenarios', subTab: 'library', label: 'Bibliothèque de scénarios', keywords: ['scénario', 'scenario', 'bibliothèque'] },
  { tab: 'scenarios', subTab: 'simulator', label: 'Simulateur de scénarios', keywords: ['simulation', 'simulateur', 'test scénario'] },
  // Workflows
  { tab: 'workflows', subTab: 'list', label: 'Liste des workflows', keywords: ['workflow', 'processus', 'flux', 'liste'] },
  { tab: 'workflows', subTab: 'list', label: 'Création de course', keywords: ['création', 'course', 'creer'] },
  { tab: 'workflows', subTab: 'list', label: 'Recherche de livreur', keywords: ['recherche', 'livreur', 'dispatch'] },
  { tab: 'workflows', subTab: 'list', label: 'QR Code', keywords: ['qr', 'code', 'flasher', 'scanner'] },
  { tab: 'workflows', subTab: 'list', label: 'Code PIN', keywords: ['pin', 'code pin', 'chiffre'] },
  { tab: 'workflows', subTab: 'list', label: 'Paiement', keywords: ['paiement', 'payment', 'orange money', 'moov'] },
  { tab: 'workflows', subTab: 'list', label: 'Pharmacie', keywords: ['pharmacie', 'médicament', 'ordonnance'] },
  { tab: 'workflows', subTab: 'list', label: 'Restaurant', keywords: ['restaurant', 'repas', 'plat', 'menu'] },
  { tab: 'workflows', subTab: 'list', label: 'Boutique', keywords: ['boutique', 'produit', 'achat'] },
  { tab: 'workflows', subTab: 'list', label: 'Réclamations', keywords: ['réclamation', 'plainte', 'reclamation', 'problème'] },
  { tab: 'workflows', subTab: 'list', label: 'Livraison programmée', keywords: ['programmée', 'programmer', 'future', 'rappel', 'date'] },
  { tab: 'workflows', subTab: 'list', label: 'Annulation', keywords: ['annulation', 'annuler', 'stop', 'annuler course'] },
  { tab: 'workflows', subTab: 'editor', label: 'Éditeur de workflows', keywords: ['éditeur', 'editor', 'créer workflow', 'modifier'] },
  { tab: 'workflows', subTab: 'journal', label: 'Journal des workflows', keywords: ['journal', 'log', 'exécution', 'execution'] },
  // Conversations
  { tab: 'conversations', label: 'Historique des conversations', keywords: ['conversation', 'historique', 'whatsapp', 'message'] },
  { tab: 'conversations', label: 'Conversations test', keywords: ['test', 'conversation test'] },
  { tab: 'conversations', label: 'Conversations réelles', keywords: ['réelle', 'real', 'conversation'] },
  // Intelligence
  { tab: 'intelligence', subTab: 'reasoning', label: 'Raisonnement', keywords: ['raisonnement', 'reasoning', 'logique', 'pensée'] },
  { tab: 'intelligence', subTab: 'longterm', label: 'Mémoire longue durée', keywords: ['mémoire', 'memory', 'long terme', 'longterm'] },
  { tab: 'intelligence', subTab: 'active', label: 'Mémoire active', keywords: ['mémoire active', 'active memory', 'contexte'] },
  { tab: 'intelligence', subTab: 'decisions', label: 'Décisions prises', keywords: ['décision', 'decision', 'log', 'choix'] },
  { tab: 'intelligence', subTab: 'strategic', label: 'Mémoire stratégique', keywords: ['stratégique', 'strategic', 'tendance', 'business'] },
  { tab: 'intelligence', subTab: 'actions', label: 'Actions de l\'agent', keywords: ['action', 'agent', 'autonome', 'initiative'] },
  { tab: 'intelligence', subTab: 'reasoning', label: 'Score de confiance', keywords: ['score', 'confiance', 'confidence'] },
  { tab: 'intelligence', subTab: 'reasoning', label: 'Outils utilisés', keywords: ['outil', 'tool', 'utilisé'] },
  // Analysis
  { tab: 'analysis', subTab: 'reports', label: 'Rapports VENUS', keywords: ['rapport', 'report', 'statistique'] },
  { tab: 'analysis', subTab: 'performance', label: 'Performances', keywords: ['performance', 'métrique', 'latence', 'cache'] },
  { tab: 'analysis', subTab: 'metrics', label: 'Métriques détaillées', keywords: ['métrique', 'metric', 'throughput', 'erreur'] },
  { tab: 'analysis', subTab: 'optimizations', label: 'Optimisations', keywords: ['optimisation', 'optimization', 'suggestion'] },
  { tab: 'analysis', subTab: 'certification', label: 'Certification', keywords: ['certification', 'audit', 'conformité', 'conformity'] },
  { tab: 'analysis', subTab: 'insights', label: 'Insights métier', keywords: ['insight', 'business', 'tendance', 'analyse métier'] },
  { tab: 'analysis', subTab: 'metrics', label: 'Erreurs', keywords: ['erreur', 'error', 'fail'] },
  { tab: 'analysis', subTab: 'reports', label: 'Évolution de VENUS', keywords: ['évolution', 'evolution', 'progression'] },
  // Configuration
  { tab: 'configuration', subTab: 'countries', label: 'Pays', keywords: ['pays', 'country', 'international', 'zone'] },
  { tab: 'configuration', subTab: 'cities', label: 'Villes & Quartiers', keywords: ['ville', 'quartier', 'city', 'zone', 'secteur'] },
  { tab: 'configuration', subTab: 'languages', label: 'Langues', keywords: ['langue', 'language', 'traduction', 'mooré', 'dioula'] },
  { tab: 'configuration', subTab: 'translations', label: 'Traductions', keywords: ['traduction', 'translation', 'localisation'] },
  { tab: 'configuration', subTab: 'personalities', label: 'Personnalités', keywords: ['personnalité', 'ton', 'voix', 'personality'] },
  { tab: 'configuration', subTab: 'brands', label: 'Marques', keywords: ['marque', 'brand', 'logo', 'silgapp'] },
  { tab: 'configuration', subTab: 'audio', label: 'Paramètres WhatsApp & Twilio', keywords: ['whatsapp', 'twilio', 'audio', 'vocal', 'note vocale', 'tts'] },
  // Supervision
  { tab: 'supervision', subTab: 'overview', label: 'Monitoring global', keywords: ['supervision', 'monitoring', 'santé', 'global'] },
  { tab: 'supervision', subTab: 'audit', label: 'Journal d\'audit', keywords: ['audit', 'journal', 'log', 'trace'] },
  { tab: 'supervision', subTab: 'alerts', label: 'Alertes système', keywords: ['alerte', 'alert', 'système'] },
  { tab: 'supervision', subTab: 'tools', label: 'Santé des APIs', keywords: ['api', 'outil', 'tool', 'health', 'santé api'] },
  { tab: 'supervision', subTab: 'anomalies', label: 'Anomalies', keywords: ['anomalie', 'anomaly', 'anormal'] },
  { tab: 'supervision', subTab: 'backups', label: 'Sauvegardes', keywords: ['sauvegarde', 'backup', 'restore', 'restauration'] },
  { tab: 'supervision', subTab: 'security', label: 'Sécurité', keywords: ['sécurité', 'security', 'firewall', 'protection'] },
  { tab: 'supervision', subTab: 'readiness', label: 'Prêt pour production', keywords: ['production', 'readiness', 'ready', 'launch'] },
  { tab: 'supervision', subTab: 'maintenance', label: 'Maintenance', keywords: ['maintenance', 'mode dégradé', 'settings'] },
];

export default function VenusIntelligenceCenter() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTarget, setSearchTarget] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navigateTo = (tab, subTab = null) => {
    setActiveTab(tab);
    setSearchTarget({ tab, subTab, ts: Date.now() });
    setMobileNavOpen(false);
  };

  const getForcedSubTab = (tabId) => {
    if (!searchTarget || searchTarget.tab !== tabId) return null;
    return searchTarget.subTab;
  };

  const currentTab = useMemo(() => TABS.find(t => t.id === activeTab), [activeTab]);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex w-60 bg-slate-900 flex-col flex-shrink-0">
        <div className="h-16 flex items-center px-5 gap-3 border-b border-white/8 flex-shrink-0">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-1.5 text-white/60 hover:text-white hover:bg-white/10 px-2">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-sm text-white tracking-wide">Intelligence</h1>
              <p className="text-[10px] text-white/40">Centre VENUS</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigateTo(tab.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary text-white shadow-lg shadow-primary/30"
                    : "text-white/50 hover:bg-white/8 hover:text-white/90"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="border-t border-white/8 p-3 flex-shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
            <Sparkles className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
            <p className="text-[10px] text-white/40 leading-tight">10 modules unifiés — toutes les fonctionnalités VENUS en un seul endroit</p>
          </div>
        </div>
      </aside>

      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setMobileNavOpen(false)}>
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="h-16 flex items-center justify-between px-4 border-b border-white/8">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-violet-400" />
                <span className="text-sm font-bold text-white">Centre VENUS</span>
              </div>
              <button onClick={() => setMobileNavOpen(false)} className="text-white/50">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
              {TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => navigateTo(tab.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                      isActive ? "bg-primary text-white" : "text-white/50 hover:bg-white/8"
                    )}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-gray-100 flex items-center gap-3 px-4 flex-shrink-0">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <Link to="/" className="hidden lg:block">
            <Button variant="ghost" size="sm" className="gap-1.5 text-gray-500">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden xl:inline">Retour</span>
            </Button>
          </Link>
          <div className="hidden md:flex items-center gap-2">
            {currentTab && (
              <>
                <currentTab.icon className="w-5 h-5 text-primary" />
                <h1 className="text-base font-bold text-gray-900">{currentTab.label}</h1>
                <Badge className="bg-violet-100 text-violet-700 text-[10px]">VENUS</Badge>
              </>
            )}
          </div>
          <div className="flex-1 flex justify-end">
            <GlobalSearch index={SEARCH_INDEX} onNavigate={navigateTo} />
          </div>
        </header>

        {/* Mobile tab bar */}
        <div className="lg:hidden bg-white border-b border-gray-100 px-2 py-2 flex gap-1 overflow-x-auto scrollbar-hide flex-shrink-0">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigateTo(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  isActive ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && <VIDashboardTab />}
            {activeTab === 'training' && <VITrainingTab forcedSubTab={getForcedSubTab('training')} key={searchTarget?.ts || 't'} />}
            {activeTab === 'knowledge' && <VIKnowledgeTab forcedSubTab={getForcedSubTab('knowledge')} key={searchTarget?.ts || 'k'} />}
            {activeTab === 'scenarios' && <VIScenariosTab forcedSubTab={getForcedSubTab('scenarios')} key={searchTarget?.ts || 's'} />}
            {activeTab === 'workflows' && <VIWorkflowsTab forcedSubTab={getForcedSubTab('workflows')} key={searchTarget?.ts || 'w'} />}
            {activeTab === 'conversations' && <VIConversationsTab />}
            {activeTab === 'intelligence' && <VIIntelligenceTab forcedSubTab={getForcedSubTab('intelligence')} key={searchTarget?.ts || 'i'} />}
            {activeTab === 'analysis' && <VIAnalysisTab forcedSubTab={getForcedSubTab('analysis')} key={searchTarget?.ts || 'a'} />}
            {activeTab === 'configuration' && <VIConfigurationTab forcedSubTab={getForcedSubTab('configuration')} key={searchTarget?.ts || 'c'} />}
            {activeTab === 'supervision' && <VISupervisionTab forcedSubTab={getForcedSubTab('supervision')} key={searchTarget?.ts || 'sup'} />}
          </div>
        </main>
      </div>
    </div>
  );
}