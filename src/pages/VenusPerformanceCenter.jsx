import React, { useState } from 'react';
import { Activity, Gauge, ListChecks, Database, Zap, Brain, TrendingUp } from 'lucide-react';
import PerformanceOverviewTab from '@/components/venus-performance/PerformanceOverviewTab';
import MetricsTab from '@/components/venus-performance/MetricsTab';
import QueueTab from '@/components/venus-performance/QueueTab';
import CacheTab from '@/components/venus-performance/CacheTab';
import LoadTestTab from '@/components/venus-performance/LoadTestTab';
import OptimizationsTab from '@/components/venus-performance/OptimizationsTab';

const TABS = [
  { id: 'overview', label: 'Vue globale', icon: Gauge, color: 'text-blue-600' },
  { id: 'metrics', label: 'Métriques', icon: Activity, color: 'text-green-600' },
  { id: 'queue', label: 'File d\'attente', icon: ListChecks, color: 'text-orange-600' },
  { id: 'cache', label: 'Cache', icon: Database, color: 'text-purple-600' },
  { id: 'loadtest', label: 'Tests de charge', icon: Zap, color: 'text-red-600' },
  { id: 'optimizations', label: 'Optimisations', icon: Brain, color: 'text-indigo-600' },
];

export default function VenusPerformanceCenter() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-8 h-8" />
            <h1 className="text-2xl font-bold">Centre de Performance VENUS</h1>
          </div>
          <p className="text-blue-100 text-sm">
            Monitoring temps réel, cache intelligent, file d'attente, tests de charge et optimisations automatiques
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
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? tab.color : ''}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'overview' && <PerformanceOverviewTab />}
        {activeTab === 'metrics' && <MetricsTab />}
        {activeTab === 'queue' && <QueueTab />}
        {activeTab === 'cache' && <CacheTab />}
        {activeTab === 'loadtest' && <LoadTestTab />}
        {activeTab === 'optimizations' && <OptimizationsTab />}
      </div>
    </div>
  );
}