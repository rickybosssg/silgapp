import React, { useState } from 'react';
import { FileText, Upload, Search, BarChart3, Library } from 'lucide-react';
import DocumentListTab from '@/components/venus-documents/DocumentListTab';
import DocumentUploadTab from '@/components/venus-documents/DocumentUploadTab';
import DocumentSearchTab from '@/components/venus-documents/DocumentSearchTab';
import DocumentAnalyticsTab from '@/components/venus-documents/DocumentAnalyticsTab';

const TABS = [
  { id: 'list', label: 'Documents', icon: FileText },
  { id: 'upload', label: 'Importer', icon: Upload },
  { id: 'search', label: 'Tester la recherche', icon: Search },
  { id: 'analytics', label: 'Analytique', icon: BarChart3 },
];

export default function VenusDocumentLibrary() {
  const [activeTab, setActiveTab] = useState('list');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleDocumentIndexed = () => {
    setRefreshKey(k => k + 1);
    setActiveTab('list');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
            <Library className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Bibliothèque Documentaire</h1>
            <p className="text-xs text-slate-500">Source officielle de vérité pour VENUS (RAG)</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-6 flex gap-1 overflow-x-auto scrollbar-hide">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6">
        {activeTab === 'list' && <DocumentListTab key={refreshKey} />}
        {activeTab === 'upload' && <DocumentUploadTab onIndexed={handleDocumentIndexed} />}
        {activeTab === 'search' && <DocumentSearchTab />}
        {activeTab === 'analytics' && <DocumentAnalyticsTab />}
      </div>
    </div>
  );
}