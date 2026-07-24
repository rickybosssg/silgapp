import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { FileText, Plus, Edit2, Trash2, Save, X, Search } from 'lucide-react';

export default function TranslationsTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterLang, setFilterLang] = useState('');

  const { data: translations = [], isLoading } = useQuery({
    queryKey: ['venus-translations', filterLang],
    queryFn: () => base44.entities.VenusTranslation.filter(
      filterLang ? { langue: filterLang } : {},
      '-created_date',
      200
    ),
  });

  const { data: languages = [] } = useQuery({
    queryKey: ['venus-languages-mini'],
    queryFn: () => base44.entities.VenusLanguage.list('-ordre', 50),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (data.id) return base44.entities.VenusTranslation.update(data.id, data);
      return base44.entities.VenusTranslation.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venus-translations'] });
      setShowForm(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.VenusTranslation.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venus-translations'] }),
  });

  if (isLoading) return <div className="text-center py-8 text-gray-500">Chargement...</div>;

  const filtered = translations.filter(t =>
    !search ||
    t.cle?.toLowerCase().includes(search.toLowerCase()) ||
    t.valeur?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Traductions</h2>
          <p className="text-sm text-gray-500">Clés de traduction multilingues — surcharge possible par pays</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Ajouter
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par clé ou valeur..." className="pl-9" />
        </div>
        <select value={filterLang} onChange={(e) => setFilterLang(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white">
          <option value="">Toutes langues</option>
          {languages.map((l) => <option key={l.id} value={l.code}>{l.code} — {l.nom}</option>)}
        </select>
      </div>

      {showForm && (
        <TranslationForm
          initial={editing}
          languages={languages}
          onSave={(data) => saveMutation.mutate(data)}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="space-y-2">
        {filtered.map((t) => (
          <Card key={t.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="font-mono text-xs">{t.langue}</Badge>
                  <Badge variant={t.pays === 'ALL' ? 'secondary' : 'default'} className="text-xs">{t.pays || 'ALL'}</Badge>
                  <code className="text-xs text-gray-500">{t.cle}</code>
                </div>
                <p className="text-sm text-gray-900 line-clamp-2">{t.valeur}</p>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setShowForm(true); }}>
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(t.id)}>
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>Aucune traduction trouvée</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TranslationForm({ initial, languages, onSave, onCancel }) {
  const [form, setForm] = useState({
    id: initial?.id,
    cle: initial?.cle || '',
    langue: initial?.langue || 'fr',
    pays: initial?.pays || 'ALL',
    valeur: initial?.valeur || '',
    contexte: initial?.contexte || 'whatsapp',
    statut: initial?.statut || 'valide',
  });

  const set = (k, v) => setForm({ ...form, [k]: v });

  return (
    <Card className="border-orange-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-orange-600" />
          {initial ? 'Modifier la traduction' : 'Nouvelle traduction'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label>Clé</Label>
            <Input value={form.cle} onChange={(e) => set('cle', e.target.value)} placeholder="venus.greeting" />
          </div>
          <div>
            <Label>Langue</Label>
            <select value={form.langue} onChange={(e) => set('langue', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white h-9">
              {languages.length > 0 ? languages.map((l) => <option key={l.id} value={l.code}>{l.code} — {l.nom}</option>) : <option value="fr">fr — Français</option>}
            </select>
          </div>
          <div>
            <Label>Pays</Label>
            <Input value={form.pays} onChange={(e) => set('pays', e.target.value)} placeholder="ALL ou BF" />
          </div>
        </div>
        <div>
          <Label>Valeur (variables: {`{nom}`}, {`{devise}`}, {`{montant}`})</Label>
          <Textarea value={form.valeur} onChange={(e) => set('valeur', e.target.value)} placeholder="Bonjour {nom} !" rows={3} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Contexte</Label>
            <select value={form.contexte} onChange={(e) => set('contexte', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white h-9">
              <option value="whatsapp">WhatsApp</option>
              <option value="app">Application</option>
              <option value="notification">Notification</option>
              <option value="email">Email</option>
            </select>
          </div>
          <div>
            <Label>Statut</Label>
            <select value={form.statut} onChange={(e) => set('statut', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white h-9">
              <option value="valide">Validé</option>
              <option value="brouillon">Brouillon</option>
              <option value="archive">Archivé</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-2" /> Annuler</Button>
          <Button onClick={() => onSave(form)}><Save className="w-4 h-4 mr-2" /> Enregistrer</Button>
        </div>
      </CardContent>
    </Card>
  );
}