import React, { useState, useEffect } from 'react';
import { Globe, MapPin, Languages, FileText, Smile, Building2, Mic } from 'lucide-react';
import SubTabNav from './SubTabNav';
import CountriesTab from '@/components/venus-international/CountriesTab';
import CitiesTab from '@/components/venus-international/CitiesTab';
import LanguagesTab from '@/components/venus-international/LanguagesTab';
import TranslationsTab from '@/components/venus-international/TranslationsTab';
import PersonalitiesTab from '@/components/venus-international/PersonalitiesTab';
import BrandsTab from '@/components/venus-international/BrandsTab';
import VenusAudioSettings from '@/components/admin/VenusAudioSettings';

const SUB_TABS = [
  { id: 'countries', label: 'Pays', icon: Globe },
  { id: 'cities', label: 'Villes & Quartiers', icon: MapPin },
  { id: 'languages', label: 'Langues', icon: Languages },
  { id: 'translations', label: 'Traductions', icon: FileText },
  { id: 'personalities', label: 'Personnalités', icon: Smile },
  { id: 'brands', label: 'Marques', icon: Building2 },
  { id: 'audio', label: 'Notes vocales', icon: Mic },
];

export default function VIConfigurationTab({ forcedSubTab }) {
  const [activeTab, setActiveTab] = useState('countries');

  useEffect(() => {
    if (forcedSubTab) setActiveTab(forcedSubTab);
  }, [forcedSubTab]);

  return (
    <div>
      <SubTabNav tabs={SUB_TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'countries' && <CountriesTab />}
      {activeTab === 'cities' && <CitiesTab />}
      {activeTab === 'languages' && <LanguagesTab />}
      {activeTab === 'translations' && <TranslationsTab />}
      {activeTab === 'personalities' && <PersonalitiesTab />}
      {activeTab === 'brands' && <BrandsTab />}
      {activeTab === 'audio' && <VenusAudioSettings />}
    </div>
  );
}