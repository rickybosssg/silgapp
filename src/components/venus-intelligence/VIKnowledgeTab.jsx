import React, { useState, useEffect } from 'react';
import { BookOpen, FileText, Upload, Search, BarChart3, Library } from 'lucide-react';
import SubTabNav from './SubTabNav';
import KnowledgeBaseTab from '@/components/venus-learning/KnowledgeBaseTab';
import DocumentListTab from '@/components/venus-documents/DocumentListTab';
import DocumentUploadTab from '@/components/venus-documents/DocumentUploadTab';
import DocumentSearchTab from '@/components/venus-documents/DocumentSearchTab';
import DocumentAnalyticsTab from '@/components/venus-documents/DocumentAnalyticsTab';
import SearchTab from '@/components/venus-learning/SearchTab';

const SUB_TABS = [
  { id: 'base', label: 'FAQ & Procédures', icon: BookOpen },
  { id: 'documents', label: 'Documents RAG', icon: FileText },
  { id: 'upload', label: 'Importer', icon: Upload },
  { id: 'search', label: 'Recherche sémantique', icon: Search },
  { id: 'docsearch', label: 'Test RAG', icon: Library },
  { id: 'analytics', label: 'Analytique', icon: BarChart3 },
];

export default function VIKnowledgeTab({ forcedSubTab }) {
  const [activeTab, setActiveTab] = useState('base');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (forcedSubTab) setActiveTab(forcedSubTab);
  }, [forcedSubTab]);

  const handleDocumentIndexed = () => {
    setRefreshKey(k => k + 1);
    setActiveTab('documents');
  };

  return (
    <div>
      <SubTabNav tabs={SUB_TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'base' && <KnowledgeBaseTab />}
      {activeTab === 'documents' && <DocumentListTab key={refreshKey} />}
      {activeTab === 'upload' && <DocumentUploadTab onIndexed={handleDocumentIndexed} />}
      {activeTab === 'search' && <SearchTab />}
      {activeTab === 'docsearch' && <DocumentSearchTab />}
      {activeTab === 'analytics' && <DocumentAnalyticsTab />}
    </div>
  );
}