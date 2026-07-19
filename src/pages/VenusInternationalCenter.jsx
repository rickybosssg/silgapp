import React, { useState } from 'react';
import { Globe, MapPin, Languages, FileText, Smile, Building2, Sparkles } from 'lucide-react';
import CountriesTab from '@/components/venus-international/CountriesTab';
import CitiesTab from '@/components/venus-international/CitiesTab';
import LanguagesTab from '@/components/venus-international/LanguagesTab';
import TranslationsTab from '@/components/venus-international/TranslationsTab';
import PersonalitiesTab from '@/components/venus-international/PersonalitiesTab';
import BrandsTab from '@/components/venus-international/BrandsTab';

const TABS = [
  { id: 'pays', label: 'Pays', icon: Globe, color: 'text-blue-600' },
  { id: 'villes', label: 'Villes & Quartiers', icon: MapPin, color: 'text-green-600' },
  { id: 'langues', label: 'Langues', icon: Languages, color: 'text-purple-600' },
  { id: 'traductions', label: 'Traductions', icon: FileText, color: 'text-orange-600' },
  { id: 'personnalites', label: 'Personnalités', icon: Smile, color: 'text-pink-600' },
  { id: 'marques', label: 'Marques', icon: Building2, color: 'text-indigo-600' },
];

export default function VenusInternationalCenter() {
  const [activeTab, setActiveTab] = useState('pays');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-8 h-8" />
            <h1 className="text-2xl font-bold">Centre International VENUS</h1>
          </div>
          <p className="text-indigo-100 text-sm">
            Moteur multilingue, multi-pays et de personnalisation — ajoutez un pays par configuration, sans modifier le code.
          </p>
        </div>
      </div>

      {/* Tabs */}
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
                  <Icon className={`w-4 h-4 ${isActive ? tab.color : ''}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'pays' && <CountriesTab />}
        {activeTab === 'villes' && <CitiesTab />}
        {activeTab === 'langues' && <LanguagesTab />}
        {activeTab === 'traductions' && <TranslationsTab />}
        {activeTab === 'personnalites' && <PersonalitiesTab />}
        {activeTab === 'marques' && <BrandsTab />}
      </div>
    </div>
  );
}