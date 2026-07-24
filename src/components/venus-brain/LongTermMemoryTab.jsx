import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Search, MapPin, Phone, User, Package, TrendingUp } from 'lucide-react';

export default function LongTermMemoryTab() {
  const [search, setSearch] = useState('');

  const { data: memories, isLoading } = useQuery({
    queryKey: ['venus-long-term-memory', search],
    queryFn: async () => {
      const list = await base44.entities.VenusLongTermMemory.list('-derniere_interaction', 50);
      if (!search) return list;
      const s = search.toLowerCase();
      return list.filter(m =>
        (m.client_telephone || '').includes(s) ||
        (m.client_nom || '').toLowerCase().includes(s) ||
        (m.ville_habituelle || '').toLowerCase().includes(s)
      );
    },
    refetchInterval: 30000,
  });

  const [selected, setSelected] = useState(null);

  const selectedMemory = memories?.find(m => m.id === selected) || memories?.[0];

  let adresses = [], destinataires = [];
  try { adresses = selectedMemory?.adresses_frequentes ? JSON.parse(selectedMemory.adresses_frequentes) : []; } catch {}
  try { destinataires = selectedMemory?.destinataires_habituels ? JSON.parse(selectedMemory.destinataires_habituels) : []; } catch {}

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-1">
        <div className="bg-white rounded-xl shadow-sm p-3">
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher (téléphone, nom, ville)..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          {isLoading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Chargement...</div>
          ) : !memories || memories.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Aucune mémoire longue</div>
          ) : (
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {memories.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelected(m.id)}
                  className={`w-full text-left p-2.5 rounded-lg transition-all ${
                    selectedMemory?.id === m.id ? 'bg-purple-50 border border-purple-200' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium text-sm text-gray-900 truncate">{m.client_nom || m.client_telephone}</div>
                  <div className="text-xs text-gray-500 truncate">{m.client_telephone}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">{m.total_courses || 0} courses</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-400">{m.total_interactions || 0} interactions</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="md:col-span-2">
        {selectedMemory ? (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{selectedMemory.client_nom || 'Client inconnu'}</h3>
                  <p className="text-xs text-gray-500">{selectedMemory.client_telephone}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <InfoCard icon={MapPin} label="Ville" value={selectedMemory.ville_habituelle || '—'} />
                <InfoCard icon={MapPin} label="Quartier" value={selectedMemory.quartier_habituel || '—'} />
                <InfoCard icon={Package} label="Type préféré" value={selectedMemory.type_course_prefere || '—'} />
                <InfoCard icon={TrendingUp} label="Total courses" value={String(selectedMemory.total_courses || 0)} />
                <InfoCard icon={TrendingUp} label="Total interactions" value={String(selectedMemory.total_interactions || 0)} />
                <InfoCard icon={User} label="Langue" value={selectedMemory.langue_preferee || 'fr'} />
              </div>
            </div>

            {adresses.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Adresses fréquentes</h4>
                <div className="space-y-2">
                  {adresses.slice(0, 8).map((a, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                      <MapPin className="w-4 h-4 text-purple-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-gray-900 truncate">{a.adresse}</div>
                        <div className="text-xs text-gray-400">{a.type === 'recuperation' ? 'Récupération' : 'Livraison'} · {a.count}× utilisée</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {destinataires.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Destinataires habituels</h4>
                <div className="space-y-2">
                  {destinataires.slice(0, 8).map((d, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                      <Phone className="w-4 h-4 text-purple-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-gray-900 truncate">{d.nom || d.telephone}</div>
                        <div className="text-xs text-gray-400">{d.telephone} · {d.count}× utilisé</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
            <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Sélectionnez un client</p>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}