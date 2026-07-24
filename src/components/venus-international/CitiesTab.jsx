import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MapPin, Plus, Edit2, Trash2, Save, X } from 'lucide-react';

export default function CitiesTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filterCountry, setFilterCountry] = useState('');

  const { data: cities = [], isLoading } = useQuery({
    queryKey: ['venus-cities', filterCountry],
    queryFn: () => base44.entities.VenusCity.filter(
      filterCountry ? { country_code: filterCountry } : {},
      '-created_date',
      200
    ),
  });

  const { data: countries = [] } = useQuery({
    queryKey: ['venus-countries-mini'],
    queryFn: () => base44.entities.Country.list('-ordre', 50),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, alias: JSON.stringify(data.alias || []) };
      if (data.id) return base44.entities.VenusCity.update(data.id, payload);
      return base44.entities.VenusCity.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venus-cities'] });
      setShowForm(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.VenusCity.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venus-cities'] }),
  });

  if (isLoading) return <div className="text-center py-8 text-gray-500">Chargement...</div>;

  const typeColors = {
    ville: 'bg-blue-100 text-blue-700',
    quartier: 'bg-green-100 text-green-700',
    zone: 'bg-purple-100 text-purple-700',
    secteur: 'bg-orange-100 text-orange-700',
    sous_quartier: 'bg-pink-100 text-pink-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Villes, Quartiers & Zones</h2>
          <p className="text-sm text-gray-500">Géolocalisez les zones d'opération par pays</p>
        </div>
        <div className="flex gap-2">
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">Tous les pays</option>
            {countries.map((c) => (
              <option key={c.id} value={c.code}>{c.emoji_flag} {c.nom}</option>
            ))}
          </select>
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Ajouter
          </Button>
        </div>
      </div>

      {showForm && (
        <CityForm
          initial={editing}
          countries={countries}
          onSave={(data) => saveMutation.mutate(data)}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {cities.map((c) => (
          <Card key={c.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900">{c.nom}</p>
                    {c.nom_alternatif && <p className="text-xs text-gray-500">aka {c.nom_alternatif}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setShowForm(true); }}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(c.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={typeColors[c.type_zone] || 'bg-gray-100 text-gray-700'}>{c.type_zone}</Badge>
                <Badge variant="outline">{c.country_code}</Badge>
                {c.parent_nom && <span className="text-xs text-gray-500">↳ {c.parent_nom}</span>}
                {!c.actif && <Badge variant="secondary">Inactif</Badge>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CityForm({ initial, countries, onSave, onCancel }) {
  const [form, setForm] = useState({
    id: initial?.id,
    country_code: initial?.country_code || 'BF',
    nom: initial?.nom || '',
    nom_alternatif: initial?.nom_alternatif || '',
    type_zone: initial?.type_zone || 'ville',
    parent_id: initial?.parent_id || '',
    parent_nom: initial?.parent_nom || '',
    latitude: initial?.latitude || 0,
    longitude: initial?.longitude || 0,
    rayon_km: initial?.rayon_km || 5,
    actif: initial?.actif ?? true,
    alias: initial?.alias ? JSON.parse(initial.alias) : [],
  });

  const set = (k, v) => setForm({ ...form, [k]: v });

  return (
    <Card className="border-green-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-green-600" />
          {initial ? 'Modifier la zone' : 'Nouvelle zone'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label>Pays</Label>
            <select value={form.country_code} onChange={(e) => set('country_code', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white h-9">
              {countries.map((c) => <option key={c.id} value={c.code}>{c.emoji_flag} {c.nom}</option>)}
            </select>
          </div>
          <div>
            <Label>Nom</Label>
            <Input value={form.nom} onChange={(e) => set('nom', e.target.value)} placeholder="Ouagadougou" />
          </div>
          <div>
            <Label>Nom alternatif</Label>
            <Input value={form.nom_alternatif} onChange={(e) => set('nom_alternatif', e.target.value)} placeholder="Ouaga" />
          </div>
          <div>
            <Label>Type</Label>
            <select value={form.type_zone} onChange={(e) => set('type_zone', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white h-9">
              <option value="ville">Ville</option>
              <option value="quartier">Quartier</option>
              <option value="zone">Zone</option>
              <option value="secteur">Secteur</option>
              <option value="sous_quartier">Sous-quartier</option>
            </select>
          </div>
          <div>
            <Label>Parent (nom)</Label>
            <Input value={form.parent_nom} onChange={(e) => set('parent_nom', e.target.value)} placeholder="Ouagadougou" />
          </div>
          <div>
            <Label>Rayon (km)</Label>
            <Input type="number" value={form.rayon_km} onChange={(e) => set('rayon_km', Number(e.target.value))} />
          </div>
          <div>
            <Label>Latitude</Label>
            <Input type="number" step="any" value={form.latitude} onChange={(e) => set('latitude', Number(e.target.value))} />
          </div>
          <div>
            <Label>Longitude</Label>
            <Input type="number" step="any" value={form.longitude} onChange={(e) => set('longitude', Number(e.target.value))} />
          </div>
          <div>
            <Label>Alias (csv)</Label>
            <Input value={form.alias.join(',')} onChange={(e) => set('alias', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="Ouaga2000,Ouaga 2000" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="actif-city" checked={form.actif} onChange={(e) => set('actif', e.target.checked)} className="w-4 h-4" />
          <Label htmlFor="actif-city">Zone active</Label>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-2" /> Annuler</Button>
          <Button onClick={() => onSave(form)}><Save className="w-4 h-4 mr-2" /> Enregistrer</Button>
        </div>
      </CardContent>
    </Card>
  );
}