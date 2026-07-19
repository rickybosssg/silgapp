import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FileText, Search, Filter, MoreVertical, CheckCircle, Archive, Eye, EyeOff, Trash2, RotateCcw, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';

const CATEGORIES = [
  'SILGAPP', 'Administration', 'Livreurs', 'Clients', 'Pharmacies',
  'Restaurants', 'Boutiques', 'Paiements', 'Juridique', 'Marketing',
  'Technique', 'API', 'Formation',
];

const STATUTS = {
  valide: { label: 'Validé', color: 'bg-green-100 text-green-700 border-green-200' },
  brouillon: { label: 'Brouillon', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  archive: { label: 'Archivé', color: 'bg-gray-100 text-gray-500 border-gray-200' },
  desactive: { label: 'Désactivé', color: 'bg-red-100 text-red-700 border-red-200' },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DocumentListTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('all');
  const [filterStatut, setFilterStatut] = useState('all');

  const { data: documents = [], isLoading, refetch } = useQuery({
    queryKey: ['venus-documents'],
    queryFn: async () => {
      const docs = await base44.entities.VenusDocument.list('-created_date', 200);
      return docs || [];
    },
  });

  const filtered = documents.filter(doc => {
    const matchSearch = !search ||
      doc.titre?.toLowerCase().includes(search.toLowerCase()) ||
      doc.description?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategorie === 'all' || doc.categorie === filterCategorie;
    const matchStatut = filterStatut === 'all' || doc.statut === filterStatut;
    return matchSearch && matchCat && matchStatut;
  });

  const updateStatut = async (docId, newStatut) => {
    try {
      const updates = { statut: newStatut };
      if (newStatut === 'valide') {
        updates.date_validation = new Date().toISOString();
        updates.valide_par = 'admin';
      }
      await base44.entities.VenusDocument.update(docId, updates);

      // Mettre à jour les chunks associés
      const chunks = await base44.entities.VenusDocumentChunk.filter({ document_id: docId }, '-chunk_index', 500);
      for (const chunk of chunks) {
        await base44.entities.VenusDocumentChunk.update(chunk.id, { document_statut: newStatut });
      }

      toast({ title: 'Statut mis à jour', description: `Document ${STATUTS[newStatut]?.label || newStatut}` });
      refetch();
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    }
  };

  const deleteDocument = async (docId) => {
    if (!confirm('Supprimer définitivement ce document et tous ses chunks ?')) return;
    try {
      const chunks = await base44.entities.VenusDocumentChunk.filter({ document_id: docId }, '-chunk_index', 500);
      for (const chunk of chunks) {
        await base44.entities.VenusDocumentChunk.delete(chunk.id);
      }
      await base44.entities.VenusDocument.delete(docId);
      toast({ title: 'Document supprimé' });
      refetch();
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-2xl font-bold text-slate-900">{documents.length}</p>
          <p className="text-xs text-slate-500">Total documents</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-2xl font-bold text-green-600">{documents.filter(d => d.statut === 'valide').length}</p>
          <p className="text-xs text-slate-500">Validés</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-2xl font-bold text-indigo-600">{documents.reduce((sum, d) => sum + (d.nb_chunks || 0), 0)}</p>
          <p className="text-xs text-slate-500">Chunks indexés</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-2xl font-bold text-purple-600">{documents.reduce((sum, d) => sum + (d.nb_consultations || 0), 0)}</p>
          <p className="text-xs text-slate-500">Consultations VENUS</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Rechercher un document..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategorie} onValueChange={setFilterCategorie}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="w-4 h-4 mr-2 text-slate-400" />
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les catégories</SelectItem>
            {CATEGORIES.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatut} onValueChange={setFilterStatut}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="valide">Validé</SelectItem>
            <SelectItem value="brouillon">Brouillon</SelectItem>
            <SelectItem value="archive">Archivé</SelectItem>
            <SelectItem value="desactive">Désactivé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Aucun document trouvé</p>
          <p className="text-xs text-slate-400 mt-1">Importez votre premier document dans l'onglet "Importer"</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => {
            const statut = STATUTS[doc.statut] || STATUTS.brouillon;
            return (
              <div key={doc.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <File className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-900 truncate">{doc.titre}</h3>
                      <Badge variant="outline" className={statut.color}>{statut.label}</Badge>
                      {doc.version > 1 && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">v{doc.version}</Badge>
                      )}
                    </div>
                    {doc.description && (
                      <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">{doc.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {doc.categorie}
                      </span>
                      <span>{doc.nb_chunks || 0} chunks</span>
                      <span>{doc.nb_consultations || 0} consult.</span>
                      <span>v{doc.version} • {formatDate(doc.date_indexation)}</span>
                    </div>
                    {doc.resume && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-1 italic">{doc.resume}</p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {doc.statut !== 'valide' && (
                        <DropdownMenuItem onClick={() => updateStatut(doc.id, 'valide')}>
                          <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                          Valider
                        </DropdownMenuItem>
                      )}
                      {doc.statut === 'valide' && (
                        <DropdownMenuItem onClick={() => updateStatut(doc.id, 'desactive')}>
                          <EyeOff className="w-4 h-4 mr-2 text-orange-600" />
                          Désactiver
                        </DropdownMenuItem>
                      )}
                      {doc.statut !== 'archive' && (
                        <DropdownMenuItem onClick={() => updateStatut(doc.id, 'archive')}>
                          <Archive className="w-4 h-4 mr-2 text-gray-600" />
                          Archiver
                        </DropdownMenuItem>
                      )}
                      {doc.fichier_url && (
                        <DropdownMenuItem onClick={() => window.open(doc.fichier_url, '_blank')}>
                          <Eye className="w-4 h-4 mr-2 text-blue-600" />
                          Voir le fichier
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => deleteDocument(doc.id)} className="text-red-600">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}