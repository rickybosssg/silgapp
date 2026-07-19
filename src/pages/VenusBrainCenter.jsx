import React, { useState } from 'react';
import ActiveMemoryTab from '@/components/venus-brain/ActiveMemoryTab.jsx';
import LongTermMemoryTab from '@/components/venus-brain/LongTermMemoryTab.jsx';
import ReasoningLogTab from '@/components/venus-brain/ReasoningLogTab.jsx';
import { Brain, Clock, Database, Activity } from 'lucide-react';

const TABS = [
  { id: 'active', label: 'Mémoire Active', icon: Activity },
  { id: 'longterm', label: 'Mémoire Longue', icon: Database },
  { id: 'reasoning', label: 'Raisonnement', icon: Brain },
];

export default function VenusBrainCenter() {
  const [activeTab, setActiveTab] = useState('reasoning');

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Venus Brain Center</h1>
              <p className="text-sm text-gray-500">Mémoire intelligente et moteur de raisonnement</p>
            </div>
          </div>
        </div>

        <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 shadow-sm overflow-x-auto scrollbar-hide">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'active' && <ActiveMemoryTab />}
        {activeTab === 'longterm' && <LongTermMemoryTab />}
        {activeTab === 'reasoning' && <ReasoningLogTab />}
      </div>
    </div>
  );
}