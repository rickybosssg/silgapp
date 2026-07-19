import React, { useState } from 'react';
import { ShieldCheck, Gauge, GitBranch, Workflow, Lock, Zap, ClipboardCheck, GraduationCap, FileText, Map } from 'lucide-react';
import CertificationDashboardTab from '@/components/venus-certification/CertificationDashboardTab';
import ArchitectureAuditTab from '@/components/venus-certification/ArchitectureAuditTab';
import IntegrationValidationTab from '@/components/venus-certification/IntegrationValidationTab';
import FunctionalTestsTab from '@/components/venus-certification/FunctionalTestsTab';
import SecurityAuditTab from '@/components/venus-certification/SecurityAuditTab';
import PerformanceTestTab from '@/components/venus-certification/PerformanceTestTab';
import ProductionReadinessTab from '@/components/venus-certification/ProductionReadinessTab';

const TABS = [
  { id: 'dashboard', label: 'Tableau de bord', icon: Gauge },
  { id: 'architecture', label: 'Architecture', icon: GitBranch },
  { id: 'integrations', label: 'Intégrations', icon: Workflow },
  { id: 'tests', label: 'Tests fonctionnels', icon: ClipboardCheck },
  { id: 'securite', label: 'Sécurité', icon: Lock },
  { id: 'performance', label: 'Performance', icon: Zap },
  { id: 'readiness', label: 'Production', icon: ShieldCheck },
];

export default function VenusCertificationCenter() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-pink-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="w-8 h-8" />
            <h1 className="text-2xl font-bold">Centre de Certification VENUS</h1>
          </div>
          <p className="text-indigo-100 text-sm">
            Audit final, validation des modules, tests de conformité et préparation à la mise en production
          </p>
        </div>
      </div>

      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
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

      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'dashboard' && <CertificationDashboardTab />}
        {activeTab === 'architecture' && <ArchitectureAuditTab />}
        {activeTab === 'integrations' && <IntegrationValidationTab />}
        {activeTab === 'tests' && <FunctionalTestsTab />}
        {activeTab === 'securite' && <SecurityAuditTab />}
        {activeTab === 'performance' && <PerformanceTestTab />}
        {activeTab === 'readiness' && <ProductionReadinessTab />}
      </div>
    </div>
  );
}