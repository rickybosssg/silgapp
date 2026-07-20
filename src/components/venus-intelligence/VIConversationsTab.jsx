import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Search, Bot, MessageCircle, Zap } from 'lucide-react';

const PAYS_FLAGS = { BF: '🇧🇫', CI: '🇨🇮', TG: '🇹🇬', BJ: '🇧🇯', SN: '🇸🇳', ML: '🇲🇱', GN: '🇬🇳', NE: '🇳🇪' };

export default function VIConversationsTab() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const { data: convs = [] } = useQuery({
    queryKey: ['vi-convs-list'],
    queryFn: () => base44.entities.Conversation.filter({ source: 'whatsapp' }, '-last_message_date', 200),
    refetchInterval: 15000,
  });

  const { data: interactions = [] } = useQuery({
    queryKey: ['vi-interactions-list'],
    queryFn: () => base44.entities.VenusInteraction.list('-created_date', 100),
    refetchInterval: 30000,
  });

  const filteredConvs = useMemo(() => {
    let result = convs;
    if (filter === 'venus') result = result.filter(c => c.venus_active !== false);
    if (filter === 'admin') result = result.filter(c => c.venus_active === false);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        (c.client_phone || '').toLowerCase().includes(q) ||
        (c.client_name || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [convs, filter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par téléphone ou nom…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100">
          {[
            { id: 'all', label: 'Toutes' },
            { id: 'venus', label: 'Venus auto' },
            { id: 'admin', label: 'Admin manuel' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f.id ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle className="w-4 h-4 text-primary" />
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Conversations ({filteredConvs.length})</p>
          </div>
          {filteredConvs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">Aucune conversation</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredConvs.slice(0, 50).map((c, i) => (
                <div key={c.id || i} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.client_name || c.client_phone || '—'}</p>
                    <p className="text-xs text-gray-400">{c.client_phone || '—'}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {c.country_code && <span className="text-xs">{PAYS_FLAGS[c.country_code] || ''} {c.country_code}</span>}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.venus_active !== false ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {c.venus_active !== false ? 'Venus' : 'Admin'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-primary" />
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Interactions récentes ({interactions.length})</p>
          </div>
          {interactions.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Zap className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">Aucune interaction</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {interactions.slice(0, 50).map((i, idx) => (
                <div key={i.id || idx} className="flex items-start gap-2 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3 h-3 text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-700 line-clamp-2">{i.question || '—'}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {i.country_code && <span className="text-[9px] text-gray-400">{PAYS_FLAGS[i.country_code] || ''} {i.country_code}</span>}
                      {i.statut === 'resolu' && <span className="text-[9px] text-green-600 font-semibold">✓ résolu</span>}
                      {i.statut === 'non_resolu' && <span className="text-[9px] text-orange-600 font-semibold">⚠ non résolu</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}