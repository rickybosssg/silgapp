import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Database, CheckCircle, Clock, AlertTriangle, FileText, HardDrive, Calendar } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

export default function RagStatusTab() {
  const queryClient = useQueryClient();
  const [reindexingAll, setReindexingAll] = useState(false);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['rag-knowledge-stats'],
    queryFn: async () => {
      const res = await base44.functions.invoke('indexerDocumentVenus', { action: 'stats_knowledge' });
      return res?.stats || null;
    },
    refetchInterval: 30000,
  });

  const handleReindexAll = async () => {
    if (!confirm('Réindexer TOUS les documents validés dans la base RAG ? Cela peut prendre quelques minutes.')) return;
    setReindexingAll(true);
    try {
      const res = await base44.functions.invoke('indexerDocumentVenus', { action: 'reindexer_tout' });
      toast({ title: 'Réindexation terminée', description: `${res.success_count} réussis, ${res.error_count} erreurs sur ${res.total} documents` });
      queryClient.invalidateQueries({ queryKey: ['rag-knowledge-stats'] });
      queryClient.invalidateQueries({ queryKey: ['venus-knowledge'] });
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    } finally {
      setReindexingAll(false);
    }
  };

  if (isLoading) return <div className="text-center py-10 text-slate-400">Chargement des statistiques...</div>;
  if (!stats) return <div className="text-center py-10 text-slate-400">Aucune donnée disponible</div>;

  const cards = [
    { label: 'Total documents', value: stats.total_documents, icon: FileText, color: 'text-slate-700', bg: 'bg-slate-100' },
    { label: 'Indexés dans le RAG', value: stats.documents_indexes, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
    { label: 'En attente d\'indexation', value: stats.documents_en_attente, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100' },
    { label: 'Erreurs d\'indexation', value: stats.documents_erreur, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Statut de la Base de Connaissances VENUS</h2>
          <p className="text-sm text-slate-500">Contrôle de l'indexation RAG en temps réel</p>
        </div>
        <Button onClick={handleReindexAll} disabled={reindexingAll}>
          <RefreshCw className={`w-4 h-4 mr-2 ${reindexingAll ? 'animate-spin' : ''}`} />
          {reindexingAll ? 'Réindexation...' : 'Tout réindexer'}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <Card key={i}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${c.color}`} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900">{c.value}</div>
                  <div className="text-xs text-slate-500">{c.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2"><Database className="w-4 h-4" /> Documents validés</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.documents_valides}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2"><HardDrive className="w-4 h-4" /> Taille estimée</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.taille_estimee_mo} <span className="text-sm font-normal text-slate-400">Mo</span></div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2"><Calendar className="w-4 h-4" /> Dernière indexation</CardTitle></CardHeader>
          <CardContent><div className="text-sm font-bold">{stats.derniere_indexation ? new Date(stats.derniere_indexation).toLocaleString('fr-FR') : 'Jamais'}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Répartition par statut</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-400" /> Brouillons: <strong>{stats.documents_brouillon}</strong></div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-400" /> En révision: <strong>{stats.documents_en_revision}</strong></div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500" /> Validés: <strong>{stats.documents_valides}</strong></div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-gray-400" /> Archivés: <strong>{stats.documents_archive}</strong></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}