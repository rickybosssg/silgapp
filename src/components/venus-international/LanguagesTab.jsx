import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Languages, Plus, Edit2, Trash2, Save, X, Volume2 } from 'lucide-react';

export default function LanguagesTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const { data: languages = [], isLoading } = useQuery({
    queryKey: ['venus-languages'],
    queryFn: () => base44.entities.VenusLanguage.list('-ordre', 50),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        pays_codes: JSON.stringify(data.pays_codes || []),
        voix_disponibles: JSON.stringify(data.voix_disponibles || []),
        vocabulaire_specifique: JSON.stringify(data.vocabulaire_specifique || {}),
        salutations: JSON.stringify(data.salutations || {}),
      };
      if (data.id) return base44.entities.VenusLanguage.update(data.id, payload);
      return base44.entities.VenusLanguage.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venus-languages'] });
      setShowForm(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.VenusLanguage.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venus-languages'] }),
  });

  if (isLoading) return <div className="text-center py-8 text-gray-500">Chargement...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Langues</h2>
          <p className="text-sm text-gray-500">Activez de nouvelles langues sans modifier le code — VENUS détecte automatiquement</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Ajouter une langue
        </Button>
      </div>

      {showForm && (
        <LanguageForm
          initial={editing}
          onSave={(data) => saveMutation.mutate(data)}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {languages.map((l) => (
          <Card key={l.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Languages className="w-5 h-5 text-purple-600" />
                  <div>
                    <CardTitle className="text-base">{l.nom}</CardTitle>
                    <p className="text-xs text-gray-500">{l.code} · {l.nom_local || '—'}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(l); setShowForm(true); }}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(l.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Famille</span>
                <span className="font-medium capitalize">{l.famille?.replace(/_/g, ' ') || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Direction</span>
                <Badge variant="outline" className="uppercase">{l.direction || 'ltr'}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Statut</span>
                <Badge variant={l.actif ? 'default' : 'secondary'}>{l.actif ? 'Active' : 'Inactive'}</Badge>
              </div>
              {l.voix_disponibles && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Volume2 className="w-3 h-3" /> Voix TTS configurées
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function LanguageForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    id: initial?.id,
    code: initial?.code || '',
    nom: initial?.nom || '',
    nom_local: initial?.nom_local || '',
    famille: initial?.famille || 'indo_europeenne',
    direction: initial?.direction || 'ltr',
    actif: initial?.actif ?? true,
    pays_codes: initial?.pays_codes ? JSON.parse(initial.pays_codes) : [],
    voix_defaut: initial?.voix_defaut || 'river',
    ordre: initial?.ordre || 99,
  });

  const set = (k, v) => setForm({ ...form, [k]: v });

  return (
    <Card className="border-purple-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="w-5 h-5 text-purple-600" />
          {initial ? 'Modifier la langue' : 'Nouvelle langue'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label>Code</Label>
            <Input value={form.code} onChange={(e) => set('code', e.target.value.toLowerCase())} placeholder="fr, en, ar, moore" />
          </div>
          <div>
            <Label>Nom (fr)</Label>
            <Input value={form.nom} onChange={(e) => set('nom', e.target.value)} placeholder="Français" />
          </div>
          <div>
            <Label>Nom local</Label>
            <Input value={form.nom_local} onChange={(e) => set('nom_local', e.target.value)} placeholder="English" />
          </div>
          <div>
            <Label>Famille</Label>
            <select value={form.famille} onChange={(e) => set('famille', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white h-9">
              <option value="indo_europeenne">Indo-européenne</option>
              <option value="niger_congo">Niger-Congo</option>
              <option value="afro_asiatique">Afro-asiatique</option>
              <option value="autres">Autres</option>
            </select>
          </div>
          <div>
            <Label>Direction</Label>
            <select value={form.direction} onChange={(e) => set('direction', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white h-9">
              <option value="ltr">Gauche → Droite (LTR)</option>
              <option value="rtl">Droite → Gauche (RTL)</option>
            </select>
          </div>
          <div>
            <Label>Pays (csv)</Label>
            <Input value={form.pays_codes.join(',')} onChange={(e) => set('pays_codes', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="BF,CI" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="actif-lang" checked={form.actif} onChange={(e) => set('actif', e.target.checked)} className="w-4 h-4" />
          <Label htmlFor="actif-lang">Langue active</Label>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-2" /> Annuler</Button>
          <Button onClick={() => onSave(form)}><Save className="w-4 h-4 mr-2" /> Enregistrer</Button>
        </div>
      </CardContent>
    </Card>
  );
}