import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Globe, Plus, Edit2, Trash2, Save, X, Star } from 'lucide-react';

export default function CountriesTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const { data: countries = [], isLoading } = useQuery({
    queryKey: ['venus-countries'],
    queryFn: () => base44.entities.Country.list('-ordre', 50),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        langues_officielles: JSON.stringify(data.langues_officielles || []),
        langues_secondaires: JSON.stringify(data.langues_secondaires || []),
        modes_paiement: JSON.stringify(data.modes_paiement || []),
      };
      if (data.id) return base44.entities.Country.update(data.id, payload);
      return base44.entities.Country.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venus-countries'] });
      setShowForm(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Country.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venus-countries'] }),
  });

  if (isLoading) return <div className="text-center py-8 text-gray-500">Chargement...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Gestion des Pays</h2>
          <p className="text-sm text-gray-500">Configurez chaque pays : tarifs, devise, langues, paiements, horaires</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Ajouter un pays
        </Button>
      </div>

      {showForm && (
        <CountryForm
          initial={editing}
          onSave={(data) => saveMutation.mutate(data)}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {countries.map((c) => (
          <Card key={c.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-3xl">{c.emoji_flag || '🌍'}</span>
                  <div>
                    <CardTitle className="text-base">{c.nom}</CardTitle>
                    <p className="text-xs text-gray-500">{c.code} · {c.indicatif}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setShowForm(true); }}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Supprimer ${c.nom} ?`)) deleteMutation.mutate(c.id); }}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Devise</span>
                <span className="font-medium">{c.devise_symbole || c.devise}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Prix/km</span>
                <span className="font-medium">{c.prix_par_km} {c.devise_symbole}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Minimum</span>
                <span className="font-medium">{c.prix_minimum} {c.devise_symbole}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Commission</span>
                <span className="font-medium">{c.commission_pct}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Ville principale</span>
                <span className="font-medium">{c.ville_principale}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Statut</span>
                <Badge variant={c.actif ? 'default' : 'secondary'}>{c.actif ? 'Actif' : 'Inactif'}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CountryForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    id: initial?.id,
    code: initial?.code || '',
    nom: initial?.nom || '',
    indicatif: initial?.indicatif || '+226',
    devise: initial?.devise || 'XOF',
    devise_symbole: initial?.devise_symbole || 'FCFA',
    fuseau_horaire: initial?.fuseau_horaire || 'Africa/Ouagadougou',
    langue_principale: initial?.langue_principale || 'fr',
    langues_officielles: initial?.langues_officielles ? JSON.parse(initial.langues_officielles) : ['fr'],
    langues_secondaires: initial?.langues_secondaires ? JSON.parse(initial.langues_secondaires) : [],
    prix_par_km: initial?.prix_par_km || 100,
    prix_minimum: initial?.prix_minimum || 1000,
    commission_pct: initial?.commission_pct || 30,
    ville_principale: initial?.ville_principale || '',
    latitude_centre: initial?.latitude_centre || 0,
    longitude_centre: initial?.longitude_centre || 0,
    rayon_km: initial?.rayon_km || 30,
    support_telephone: initial?.support_telephone || '+226 66 92 51 90',
    modes_paiement: initial?.modes_paiement ? JSON.parse(initial.modes_paiement) : ['orange_money', 'especes'],
    format_adresse: initial?.format_adresse || 'quartier_rue',
    emoji_flag: initial?.emoji_flag || '🇧🇫',
    actif: initial?.actif ?? true,
    ordre: initial?.ordre || 99,
  });

  const set = (k, v) => setForm({ ...form, [k]: v });

  return (
    <Card className="border-indigo-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-indigo-600" />
          {initial ? 'Modifier le pays' : 'Nouveau pays'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label>Code ISO</Label>
            <Input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="BF" maxLength={2} />
          </div>
          <div>
            <Label>Nom</Label>
            <Input value={form.nom} onChange={(e) => set('nom', e.target.value)} placeholder="Burkina Faso" />
          </div>
          <div>
            <Label>Indicatif</Label>
            <Input value={form.indicatif} onChange={(e) => set('indicatif', e.target.value)} placeholder="+226" />
          </div>
          <div>
            <Label>Devise (code)</Label>
            <Input value={form.devise} onChange={(e) => set('devise', e.target.value)} placeholder="XOF" />
          </div>
          <div>
            <Label>Symbole devise</Label>
            <Input value={form.devise_symbole} onChange={(e) => set('devise_symbole', e.target.value)} placeholder="FCFA" />
          </div>
          <div>
            <Label>Fuseau horaire</Label>
            <Input value={form.fuseau_horaire} onChange={(e) => set('fuseau_horaire', e.target.value)} placeholder="Africa/Ouagadougou" />
          </div>
          <div>
            <Label>Langue principale</Label>
            <Input value={form.langue_principale} onChange={(e) => set('langue_principale', e.target.value)} placeholder="fr" />
          </div>
          <div>
            <Label>Langues officielles (csv)</Label>
            <Input value={form.langues_officielles.join(',')} onChange={(e) => set('langues_officielles', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="fr,en" />
          </div>
          <div>
            <Label>Langues secondaires (csv)</Label>
            <Input value={form.langues_secondaires.join(',')} onChange={(e) => set('langues_secondaires', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="moore,dioula" />
          </div>
          <div>
            <Label>Prix par km</Label>
            <Input type="number" value={form.prix_par_km} onChange={(e) => set('prix_par_km', Number(e.target.value))} />
          </div>
          <div>
            <Label>Prix minimum</Label>
            <Input type="number" value={form.prix_minimum} onChange={(e) => set('prix_minimum', Number(e.target.value))} />
          </div>
          <div>
            <Label>Commission %</Label>
            <Input type="number" value={form.commission_pct} onChange={(e) => set('commission_pct', Number(e.target.value))} />
          </div>
          <div>
            <Label>Ville principale</Label>
            <Input value={form.ville_principale} onChange={(e) => set('ville_principale', e.target.value)} placeholder="Ouagadougou" />
          </div>
          <div>
            <Label>Rayon (km)</Label>
            <Input type="number" value={form.rayon_km} onChange={(e) => set('rayon_km', Number(e.target.value))} />
          </div>
          <div>
            <Label>Support téléphone</Label>
            <Input value={form.support_telephone} onChange={(e) => set('support_telephone', e.target.value)} />
          </div>
          <div>
            <Label>Modes paiement (csv)</Label>
            <Input value={form.modes_paiement.join(',')} onChange={(e) => set('modes_paiement', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="orange_money,especes" />
          </div>
          <div>
            <Label>Emoji drapeau</Label>
            <Input value={form.emoji_flag} onChange={(e) => set('emoji_flag', e.target.value)} placeholder="🇧🇫" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="actif" checked={form.actif} onChange={(e) => set('actif', e.target.checked)} className="w-4 h-4" />
          <Label htmlFor="actif">Pays actif</Label>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-2" /> Annuler</Button>
          <Button onClick={() => onSave(form)}><Save className="w-4 h-4 mr-2" /> Enregistrer</Button>
        </div>
      </CardContent>
    </Card>
  );
}