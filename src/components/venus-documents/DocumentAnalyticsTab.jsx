import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { BarChart3, TrendingUp, FileText, AlertCircle, Clock, Search, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

export default function DocumentAnalyticsTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const result = await base44.functions.invoke('indexerDocumentVenus', { action: 'stats' });
        setStats(result.stats);
      } catch (e) {
        console.error('Erreur stats:', e);
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Impossible de charger les statistiques</p>
      </div>
    );
  }

  const sourceLabels = {
    knowledge_base: 'Base de connaissances',
    document_library: 'Bibliothèque documentaire',
    scenario: 'Scénarios',
    ia_generale: 'IA générale',
  };

  const sourceColors = {
    knowledge_base: 'bg-blue-50 text-blue-700 border-blue-200',
    document_library: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    scenario: 'bg-purple-50 text-purple-700 border-purple-200',
    ia_generale: 'bg-gray-50 text-gray-700 border-gray-200',
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={FileText} label="Documents validés" value={stats.documents_valides} color="bg-green-50 text-green-600" />
        <StatCard icon={BarChart3} label="Chunks indexés" value={stats.total_chunks} color="bg-indigo-50 text-indigo-600" />
        <StatCard icon={Search} label="Recherches totales" value={stats.total_recherches} color="bg-blue-50 text-blue-600" />
        <StatCard icon={TrendingUp} label="Taux de réussite" value={`${stats.taux_reussite}%`} color={stats.taux_reussite >= 70 ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon={AlertCircle} label="Rech. sans résultat" value={stats.recherches_sans_resultat} color="bg-red-50 text-red-600" />
        <StatCard icon={Clock} label="Temps moyen" value={`${stats.temps_moyen_recherche_ms}ms`} color="bg-purple-50 text-purple-600" />
        <StatCard icon={FileText} label="Documents archivés" value={stats.documents_archives} color="bg-gray-50 text-gray-600" />
      </div>

      {/* Sources utilisées */}
      {stats.total_recherches > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 mb-3">Sources utilisées par VENUS</h3>
          <div className="space-y-2">
            {Object.entries(stats.sources_utilisees || {}).map(([source, count]) => {
              const pct = Math.round((count / stats.total_recherches) * 100);
              return (
                <div key={source} className="flex items-center gap-3">
                  <Badge variant="outline" className={sourceColors[source] || 'bg-gray-50 text-gray-700 border-gray-200'}>
                    {sourceLabels[source] || source}
                  </Badge>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-500 w-20 text-right">{count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Documents par catégorie */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900 mb-3">Documents par catégorie</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(stats.par_categorie || {})
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-600">{cat}</span>
                <span className="font-bold text-slate-900">{count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Documents les plus consultés */}
      {stats.plus_consultes && stats.plus_consultes.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 mb-3">Documents les plus consultés par VENUS</h3>
          <div className="space-y-2">
            {stats.plus_consultes.map((doc, idx) => (
              <div key={doc.id} className="flex items-center gap-3">
                <span className="text-sm text-slate-400 w-5">#{idx + 1}</span>
                <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                <span className="flex-1 text-sm text-slate-700 truncate">{doc.titre}</span>
                <Badge variant="outline" className="bg-slate-50 text-slate-500">{doc.categorie}</Badge>
                <span className="text-sm font-medium text-indigo-600">{doc.consultations}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents jamais utilisés */}
      {stats.jamais_utilises && stats.jamais_utilises.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 mb-3">Documents jamais consultés ({stats.jamais_utilises.length})</h3>
          <div className="space-y-1">
            {stats.jamais_utilises.slice(0, 10).map(doc => (
              <div key={doc.id} className="flex items-center gap-2 text-sm text-slate-500">
                <FileText className="w-3 h-3 text-slate-300" />
                {doc.titre}
                <Badge variant="outline" className="ml-auto text-xs bg-slate-50 text-slate-400">{doc.categorie}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recherches sans résultat */}
      {stats.recherches_sans_resultat_liste && stats.recherches_sans_resultat_liste.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 mb-3">Recherches sans résultat</h3>
          <div className="space-y-1">
            {stats.recherches_sans_resultat_liste.map((s, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm text-slate-500">
                <Search className="w-3 h-3 text-slate-300" />
                <span className="flex-1">"{s.requete}"</span>
                {s.date && <span className="text-xs text-slate-400">{new Date(s.date).toLocaleDateString('fr-FR')}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}