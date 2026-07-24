import React, { useState, useEffect } from 'react';
import { FileBarChart, Gauge, Activity, Brain, ShieldCheck, BarChart3 } from 'lucide-react';
import SubTabNav from './SubTabNav';
import VenusRapportsPanel from '@/components/admin/VenusRapportsPanel';
import PerformanceOverviewTab from '@/components/venus-performance/PerformanceOverviewTab';
import MetricsTab from '@/components/venus-performance/MetricsTab';
import OptimizationsTab from '@/components/venus-performance/OptimizationsTab';
import CertificationDashboardTab from '@/components/venus-certification/CertificationDashboardTab';
import BusinessInsightsTab from '@/components/venus-agent/BusinessInsightsTab.jsx';

const SUB_TABS = [
  { id: 'reports', label: 'Rapports', icon: FileBarChart },
  { id: 'performance', label: 'Performances', icon: Gauge },
  { id: 'metrics', label: 'Métriques', icon: Activity },
  { id: 'optimizations', label: 'Optimisations', icon: Brain },
  { id: 'certification', label: 'Certification', icon: ShieldCheck },
  { id: 'insights', label: 'Insights métier', icon: BarChart3 },
];

export default function VIAnalysisTab({ forcedSubTab }) {
  const [activeTab, setActiveTab] = useState('reports');

  useEffect(() => {
    if (forcedSubTab) setActiveTab(forcedSubTab);
  }, [forcedSubTab]);

  return (
    <div>
      <SubTabNav tabs={SUB_TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'reports' && <VenusRapportsPanel />}
      {activeTab === 'performance' && <PerformanceOverviewTab />}
      {activeTab === 'metrics' && <MetricsTab />}
      {activeTab === 'optimizations' && <OptimizationsTab />}
      {activeTab === 'certification' && <CertificationDashboardTab />}
      {activeTab === 'insights' && <BusinessInsightsTab />}
    </div>
  );
}