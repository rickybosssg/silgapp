import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { MapPin, Phone, Package, User, Clock, CheckCircle, AlertCircle } from 'lucide-react';

const FIELD_LABELS = {
  type_course: { label: 'Type de course', icon: Package },
  adresse_depart: { label: 'Adresse de récupération', icon: MapPin },
  adresse_arrivee: { label: 'Adresse de livraison', icon: MapPin },
  gps_depart_lat: { label: 'GPS Récupération', icon: MapPin },
  gps_arrivee_lat: { label: 'GPS Livraison', icon: MapPin },
  contact_nom: { label: 'Nom du contact', icon: User },
  contact_telephone: { label: 'Téléphone du contact', icon: Phone },
  contact_is_client: { label: 'Client est le contact', icon: User },
  notes: { label: 'Notes', icon: AlertCircle },
  all_info_collected: { label: 'Toutes infos collectées', icon: CheckCircle },
  user_confirmed: { label: 'Client a confirmé', icon: CheckCircle },
  course_created: { label: 'Course créée', icon: CheckCircle },
  pending_location_lat: { label: 'Localisation en attente', icon: MapPin },
};

export default function ActiveMemoryTab() {
  const [selectedPhone, setSelectedPhone] = useState('');

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['venus-active-conversations'],
    queryFn: async () => {
      const list = await base44.entities.Conversation.filter(
        { source: 'whatsapp', venus_active: true },
        '-last_message_date', 30
      );
      return list.filter(c => c.venus_pending_course);
    },
    refetchInterval: 10000,
  });

  const selectedConv = conversations?.find(c => c.whatsapp_phone === selectedPhone) || conversations?.[0];

  let memory = null;
  try { memory = selectedConv?.venus_pending_course ? JSON.parse(selectedConv.venus_pending_course) : null; } catch {}

  const memoryEntries = memory ? Object.entries(memory).filter(([, v]) => v !== null && v !== undefined && v !== '') : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-1">
        <div className="bg-white rounded-xl shadow-sm p-3">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 px-1">Conversations actives</h3>
          {isLoading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Chargement...</div>
          ) : !conversations || conversations.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Aucune mémoire active</div>
          ) : (
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {conversations.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedPhone(c.whatsapp_phone)}
                  className={`w-full text-left p-2.5 rounded-lg transition-all ${
                    selectedConv?.id === c.id ? 'bg-purple-50 border border-purple-200' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium text-sm text-gray-900 truncate">{c.title || c.whatsapp_phone}</div>
                  <div className="text-xs text-gray-500 truncate">{c.whatsapp_phone}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {c.last_message_date ? new Date(c.last_message_date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="md:col-span-2">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Mémoire courte (conversation)</h3>
            {selectedConv && (
              <span className="text-xs text-gray-400">
                {selectedConv.whatsapp_phone}
              </span>
            )}
          </div>

          {!memory || memoryEntries.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucune information mémorisée</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {memoryEntries.map(([key, value]) => {
                const config = FIELD_LABELS[key] || { label: key, icon: AlertCircle };
                const Icon = config.icon;
                const displayValue = typeof value === 'boolean' ? (value ? 'Oui' : 'Non') :
                  key.includes('gps') && memory[`${key.split('_lat')[0]}_lat`] != null ?
                  `${memory[`${key.split('_lat')[0]}_lat`]}, ${memory[`${key.split('_lat')[0]}_lng`]}` :
                  String(value);
                return (
                  <div key={key} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                    <Icon className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500">{config.label}</div>
                      <div className="text-sm font-medium text-gray-900 break-words">{displayValue}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}