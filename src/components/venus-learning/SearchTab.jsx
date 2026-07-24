import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Loader2, Sparkles } from 'lucide-react';
import { STATUT_LABELS, PRIORITE_LABELS } from '@/lib/venusLearning';

export default function SearchTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const result = await base44.functions.invoke('venusIntelligentSearch', { query });
      const data = result?.data || result;
      setResults(data?.results || []);
    } catch (e) {
      console.error('Erreur recherche:', e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="font-bold text-slate-900">Recherche intelligente</h2>
        </div>
        <p className="text-sm text-slate-500 mb-4">Recherchez une connaissance à partir d'un mot, d'une phrase ou d'une question complète.</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Tapez votre recherche..."
              className="pl-9"
            />
          </div>
          <Button onClick={handleSearch} disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Rechercher
          </Button>
        </div>
      </div>

      {searched && !loading && (
        <div className="text-sm text-slate-500">{results.length} résultat(s) trouvé(s)</div>
      )}

      {loading ? (
        <div className="text-center py-10">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
          <p className="text-sm text-slate-400 mt-2">Recherche sémantique en cours...</p>
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-2">
          {results.map((r, i) => {
            const statut = STATUT_LABELS[r.statut] || STATUT_LABELS.brouillon;
            const prio = PRIORITE_LABELS[r.priorite] || PRIORITE_LABELS.normale;
            return (
              <div key={r.id || i} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-slate-900 text-sm">{r.titre}</h3>
                  {r.score != null && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {Math.round(r.score * 100)}% match
                    </span>
                  )}
                </div>
                {r.raison && <p className="text-xs text-slate-400 mb-2 italic">"{r.raison}"</p>}
                <p className="text-xs text-slate-600 mb-1"><span className="font-medium">Q:</span> {r.question}</p>
                <p className="text-xs text-slate-400 line-clamp-3"><span className="font-medium">R:</span> {r.reponse_officielle}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statut.color}`}>{statut.label}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${prio.color}`}>{prio.label}</span>
                  {r.categorie && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{r.categorie}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : searched && !loading ? (
        <div className="text-center py-10 text-slate-400">Aucun résultat. Essayez avec d'autres mots-clés.</div>
      ) : null}
    </div>
  );
}