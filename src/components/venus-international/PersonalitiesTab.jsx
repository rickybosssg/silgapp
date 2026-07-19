import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Smile, Plus, Edit2, Trash2, Save, X } from 'lucide-react';

export default function PersonalitiesTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const { data: personalities = [], isLoading } = useQuery({
    queryKey: ['venus-personalities'],
    queryFn: () => base44.entities.VenusPersonality.list('-created_date', 50),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        pays_codes: JSON.stringify(data.pays_codes || []),
        vocabulaire_prefere: JSON.stringify(data.vocabulaire_prefere || {}),
        vocabulaire_evite: JSON.stringify(data.vocabulaire_evite || []),
      };
      if (data.id) return base44.entities.VenusPersonality.update(data.id, payload);
      return base44.entities.VenusPersonality.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venus-personalities'] });
      setShowForm(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.VenusPersonality.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venus-personalities'] }),
  });

  if (isLoading) return <div className="text-center py-8 text-gray-500">Chargement...</div>;

  const tonColors = {
    professionnel: 'bg-blue-100 text-blue-700',
    chaleureux: 'bg-pink-100 text-pink-700',
    dynamique: 'bg-orange-100 text-orange-700',
    institutionnel: 'bg-indigo-100 text-indigo-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Personnalités VENUS</h2>
          <p className="text-sm text-gray-500">Configurez le ton, la formalité et la voix — tout en gardant l'identité SILGAPP</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Ajouter
        </Button>
      </div>

      {showForm && (
        <PersonalityForm
          initial={editing}
          onSave={(data) => saveMutation.mutate(data)}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {personalities.map((p) => (
          <Card key={p.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Smile className="w-5 h-5 text-pink-600" />
                  <div>
                    <CardTitle className="text-base">{p.nom}</CardTitle>
                    <Badge className={`mt-1 ${tonColors[p.ton] || 'bg-gray-100'}`}>{p.ton}</Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setShowForm(true); }}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(p.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {p.description && <p className="text-gray-600">{p.description}</p>}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="capitalize">{p.niveau_formalite}</Badge>
                <Badge variant="outline" className="capitalize">{p.longueur_reponse}</Badge>
                <Badge variant="outline">{p.emojis_autorises ? 'Emojis ✓' : 'Emojis ✗'}</Badge>
                <Badge variant="outline" className="capitalize">{p.genre_voix}</Badge>
              </div>
              {p.instructions_systeme && (
                <p className="text-xs text-gray-500 italic line-clamp-2 mt-2">{p.instructions_systeme}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PersonalityForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    id: initial?.id,
    code: initial?.code || '',
    nom: initial?.nom || '',
    description: initial?.description || '',
    ton: initial?.ton || 'chaleureux',
    instructions_systeme: initial?.instructions_systeme || '',
    niveau_formalite: initial?.niveau_formalite || 'tutoiement',
    longueur_reponse: initial?.longueur_reponse || 'normal',
    emojis_autorises: initial?.emojis_autorises ?? false,
    genre_voix: initial?.genre_voix || 'feminin',
    voix_defaut: initial?.voix_defaut || 'river',
    actif: initial?.actif ?? true,
    pays_codes: initial?.pays_codes ? JSON.parse(initial.pays_codes) : [],
  });

  const set = (k, v) => setForm({ ...form, [k]: v });

  return (
    <Card className="border-pink-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smile className="w-5 h-5 text-pink-600" />
          {initial ? 'Modifier la personnalité' : 'Nouvelle personnalité'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label>Code</Label>
            <Input value={form.code} onChange={(e) => set('code', e.target.value.toLowerCase())} placeholder="professionnel" />
          </div>
          <div>
            <Label>Nom</Label>
            <Input value={form.nom} onChange={(e) => set('nom', e.target.value)} placeholder="Ton Professionnel" />
          </div>
          <div>
            <Label>Ton</Label>
            <select value={form.ton} onChange={(e) => set('ton', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white h-9">
              <option value="professionnel">Professionnel</option>
              <option value="chaleureux">Chaleureux</option>
              <option value="dynamique">Dynamique</option>
              <option value="institutionnel">Institutionnel</option>
            </select>
          </div>
          <div>
            <Label>Formalité</Label>
            <select value={form.niveau_formalite} onChange={(e) => set('niveau_formalite', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white h-9">
              <option value="tutoiement">Tutoiement</option>
              <option value="vouvoiement">Vouvoiement</option>
              <option value="mixte">Mixte</option>
            </select>
          </div>
          <div>
            <Label>Longueur</Label>
            <select value={form.longueur_reponse} onChange={(e) => set('longueur_reponse', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white h-9">
              <option value="concis">Concis</option>
              <option value="normal">Normal</option>
              <option value="detaille">Détaillé</option>
            </select>
          </div>
          <div>
            <Label>Genre voix</Label>
            <select value={form.genre_voix} onChange={(e) => set('genre_voix', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white h-9">
              <option value="feminin">Féminin</option>
              <option value="masculin">Masculin</option>
              <option value="neutre">Neutre</option>
            </select>
          </div>
          <div>
            <Label>Voix TTS</Label>
            <select value={form.voix_defaut} onChange={(e) => set('voix_defaut', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white h-9">
              <option value="river">River (calme)</option>
              <option value="honey">Honey (chaleureuse)</option>
              <option value="sunny">Sunny (lumineuse)</option>
              <option value="storm">Storm (formelle)</option>
              <option value="spark">Spark (énergique)</option>
            </select>
          </div>
          <div>
            <Label>Pays recommandés (csv)</Label>
            <Input value={form.pays_codes.join(',')} onChange={(e) => set('pays_codes', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="BF,CI" />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Ton professionnel et structuré" />
        </div>
        <div>
          <Label>Instructions système additionnelles</Label>
          <Textarea value={form.instructions_systeme} onChange={(e) => set('instructions_systeme', e.target.value)} placeholder="Instructions injectées dans le system prompt..." rows={3} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="emojis" checked={form.emojis_autorises} onChange={(e) => set('emojis_autorises', e.target.checked)} className="w-4 h-4" />
          <Label htmlFor="emojis">Emojis autorisés</Label>
          <input type="checkbox" id="actif-pers" checked={form.actif} onChange={(e) => set('actif', e.target.checked)} className="w-4 h-4 ml-4" />
          <Label htmlFor="actif-pers">Active</Label>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-2" /> Annuler</Button>
          <Button onClick={() => onSave(form)}><Save className="w-4 h-4 mr-2" /> Enregistrer</Button>
        </div>
      </CardContent>
    </Card>
  );
}