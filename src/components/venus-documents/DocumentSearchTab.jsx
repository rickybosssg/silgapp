import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, Loader2, FileText, ChevronDown, ChevronRight, Clock, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

const CATEGORIES = [
  'Toutes', 'SILGAPP', 'Administration', 'Livreurs', 'Clients', 'Pharmacies',
  'Restaurants', 'Boutiques', 'Paiements', 'Juridique', 'Marketing',
  'Technique', 'API', 'Formation',
];

const EXAMPLE_QUERIES = [
  'Comment fonctionne le QR code ?',
  'Quel est le tarif de livraison ?',
  'Comment devenir livreur ?',
  'Procédure d\'annulation',
  'Conditions générales',
  'Comment payer une course ?',
];

export default function DocumentSearchTab() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [categorie, setCategorie] = useState('Toutes');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults(null);
    setExpandedDoc(null);
    try {
      const result = await base44.functions.invoke('indexerDocumentVenus', {
        action: 'search',
        query: query.trim(),
        categorie: categorie === 'Toutes' ? undefined : categorie,
        limit: 10,
      });
      setResults(result);
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const handleExample = (q) => {
    setQuery(q);
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Barre de recherche */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Posez une question comme un client..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="pl-9"
            />
          </div>
          <Select value={categorie} onValueChange={setCategorie}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={handleSearch} disabled={searching || !query.trim()} className="bg-indigo-600 hover:bg-indigo-700">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Rechercher
          </Button>
        </div>

        {/* Exemples */}
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map(q => (
            <button
              key={q}
              onClick={() => handleExample(q)}
              className="text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Résultats */}
      {searching && (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Recherche dans la bibliothèque documentaire...</p>
        </div>
      )}

      {!searching && results && (
        <div className="space-y-3">
          {/* Résumé */}
          <div className="flex items-center gap-3 text-sm">
            <Badge variant="outline" className={results.a_reussi ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}>
              {results.a_reussi ? `${results.resultats.length} résultat(s)` : 'Aucun résultat'}
            </Badge>
            <span className="text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {results.temps_ms}ms
            </span>
            <span className="text-slate-400 flex items-center gap-1">
              <Hash className="w-3 h-3" />
              Mots-clés: {results.query_keywords?.join(', ')}
            </span>
          </div>

          {/* Liste des résultats */}
          {results.resultats && results.resultats.length > 0 ? (
            results.resultats.map((r, idx) => (
              <div key={idx} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setExpandedDoc(expandedDoc === idx ? null : idx)}
                  className="w-full p-4 flex items-start gap-3 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-900 text-sm">{r.document_titre}</h3>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">v{r.document_version}</Badge>
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">{r.document_categorie}</Badge>
                      <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">Score: {r.score}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{r.contenu?.substring(0, 200)}...</p>
                  </div>
                  {expandedDoc === idx ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                </button>
                {expandedDoc === idx && (
                  <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                    <div className="text-xs text-slate-400 mb-2 flex items-center gap-3">
                      <span>Chunk #{r.chunk_index}</span>
                      {r.page_numero && <span>Page {r.page_numero}</span>}
                      <span>Langue: {r.langue || 'fr'}</span>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.contenu}</p>
                    {r.mots_cles && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {JSON.parse(r.mots_cles || '[]').map((mc, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500">{mc}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <p className="text-slate-500">Aucun document ne correspond à cette recherche.</p>
              <p className="text-xs text-slate-400 mt-1">VENUS utilisera l'IA générale pour répondre si aucun document n'est trouvé.</p>
            </div>
          )}
        </div>
      )}

      {!searching && !results && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Testez la recherche documentaire</p>
          <p className="text-xs text-slate-400 mt-1">Simulez une question client pour voir quels documents VENUS utiliserait</p>
        </div>
      )}
    </div>
  );
}