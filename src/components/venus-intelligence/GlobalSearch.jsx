import React, { useState, useEffect, useRef } from 'react';
import { Search, X, CornerDownRight } from 'lucide-react';

const TAB_LABELS = {
  dashboard: 'Tableau de bord',
  training: 'Entraînement',
  knowledge: 'Base de connaissances',
  scenarios: 'Scénarios',
  workflows: 'Workflows',
  conversations: 'Conversations',
  intelligence: 'Intelligence',
  analysis: 'Analyse',
  configuration: 'Configuration',
  supervision: 'Supervision',
};

export default function GlobalSearch({ index, onNavigate }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const q = query.toLowerCase();
    const filtered = index.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.keywords.some(k => k.toLowerCase().includes(q) || q.includes(k.toLowerCase()))
    ).slice(0, 10);
    setResults(filtered);
  }, [query]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (r) => {
    onNavigate(r.tab, r.subTab);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="relative flex-1 max-w-xl" ref={containerRef}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Recherche globale — QR Code, pharmacie, workflow, scénario…"
        className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
      />
      {query && (
        <button
          onClick={() => { setQuery(''); setResults([]); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1.5 left-0 right-0 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 max-h-96 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => handleSelect(r)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/5 text-left border-b border-gray-50 last:border-0 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <CornerDownRight className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{r.label}</p>
                <p className="text-xs text-gray-400">{TAB_LABELS[r.tab]}{r.subTab ? ` · ${r.subTab}` : ''}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query.trim() && results.length === 0 && (
        <div className="absolute top-full mt-1.5 left-0 right-0 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 p-6 text-center">
          <Search className="w-6 h-6 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Aucun résultat pour « {query} »</p>
        </div>
      )}
    </div>
  );
}