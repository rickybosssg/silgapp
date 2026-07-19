import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Building2, Plus, Edit2, Trash2, Save, X } from 'lucide-react';

export default function BrandsTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const { data: brands = [], isLoading } = useQuery({
    queryKey: ['venus-brands'],
    queryFn: () => base44.entities.VenusBrand.list('-created_date', 50),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        pays_codes: JSON.stringify(data.pays_codes || []),
        services: JSON.stringify(data.services || []),
        messages_perso: JSON.stringify(data.messages_perso || {}),
      };
      if (data.id) return base44.entities.VenusBrand.update(data.id, payload);
      return base44.entities.VenusBrand.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venus-brands'] });
      setShowForm(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.VenusBrand.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venus-brands'] }),
  });

  if (isLoading) return <div className="text-center py-8 text-gray-500">Chargement...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Marques (Groupe SILGA)</h2>
          <p className="text-sm text-gray-500">Réutilisez le moteur VENUS pour d'autres applications du groupe — sans modifier le code</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Ajouter une marque
        </Button>
      </div>

      {showForm && (
        <BrandForm
          initial={editing}
          onSave={(data) => saveMutation.mutate(data)}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {brands.map((b) => (
          <Card key={b.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {b.logo_url ? (
                    <img src={b.logo_url} alt={b.nom} className="w-12 h-12 rounded-lg object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg" style={{ background: b.couleur_primaire || '#E63946' }}>
                      {b.nom?.charAt(0) || 'S'}
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-base">{b.nom}</CardTitle>
                    <p className="text-xs text-gray-500 italic">"{b.slogan}"</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(b); setShowForm(true); }}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(b.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Couleurs:</span>
                <div className="flex gap-1">
                  <div className="w-5 h-5 rounded border" style={{ background: b.couleur_primaire }} />
                  <div className="w-5 h-5 rounded border" style={{ background: b.couleur_secondaire }} />
                  <div className="w-5 h-5 rounded border" style={{ background: b.couleur_accent }} />
                </div>
              </div>
              {b.support_telephone && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Support</span>
                  <span className="font-medium">{b.support_telephone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Statut</span>
                <Badge variant={b.actif ? 'default' : 'secondary'}>{b.actif ? 'Active' : 'Inactive'}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function BrandForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    id: initial?.id,
    code: initial?.code || '',
    nom: initial?.nom || '',
    slogan: initial?.slogan || '',
    logo_url: initial?.logo_url || '',
    couleur_primaire: initial?.couleur_primaire || '#E63946',
    couleur_secondaire: initial?.couleur_secondaire || '#F4A261',
    couleur_accent: initial?.couleur_accent || '#2A9D8F',
    support_telephone: initial?.support_telephone || '',
    support_email: initial?.support_email || '',
    site_web: initial?.site_web || '',
    actif: initial?.actif ?? true,
    pays_codes: initial?.pays_codes ? JSON.parse(initial.pays_codes) : [],
  });

  const set = (k, v) => setForm({ ...form, [k]: v });

  return (
    <Card className="border-indigo-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-600" />
          {initial ? 'Modifier la marque' : 'Nouvelle marque'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label>Code</Label>
            <Input value={form.code} onChange={(e) => set('code', e.target.value.toLowerCase())} placeholder="silgapp" />
          </div>
          <div>
            <Label>Nom</Label>
            <Input value={form.nom} onChange={(e) => set('nom', e.target.value)} placeholder="SILGAPP" />
          </div>
          <div>
            <Label>Slogan</Label>
            <Input value={form.slogan} onChange={(e) => set('slogan', e.target.value)} placeholder="PLUS QU'UN SERVICE, UNE PROMESSE" />
          </div>
          <div>
            <Label>Logo URL</Label>
            <Input value={form.logo_url} onChange={(e) => set('logo_url', e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label>Support téléphone</Label>
            <Input value={form.support_telephone} onChange={(e) => set('support_telephone', e.target.value)} placeholder="+226 66 92 51 90" />
          </div>
          <div>
            <Label>Support email</Label>
            <Input value={form.support_email} onChange={(e) => set('support_email', e.target.value)} placeholder="contact@silgapp.com" />
          </div>
          <div>
            <Label>Site web</Label>
            <Input value={form.site_web} onChange={(e) => set('site_web', e.target.value)} placeholder="https://silgapp.com" />
          </div>
          <div>
            <Label>Pays (csv)</Label>
            <Input value={form.pays_codes.join(',')} onChange={(e) => set('pays_codes', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="BF,CI" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Couleur primaire</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={form.couleur_primaire} onChange={(e) => set('couleur_primaire', e.target.value)} className="w-10 h-9 rounded border cursor-pointer" />
              <Input value={form.couleur_primaire} onChange={(e) => set('couleur_primaire', e.target.value)} className="flex-1" />
            </div>
          </div>
          <div>
            <Label>Couleur secondaire</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={form.couleur_secondaire} onChange={(e) => set('couleur_secondaire', e.target.value)} className="w-10 h-9 rounded border cursor-pointer" />
              <Input value={form.couleur_secondaire} onChange={(e) => set('couleur_secondaire', e.target.value)} className="flex-1" />
            </div>
          </div>
          <div>
            <Label>Couleur accent</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={form.couleur_accent} onChange={(e) => set('couleur_accent', e.target.value)} className="w-10 h-9 rounded border cursor-pointer" />
              <Input value={form.couleur_accent} onChange={(e) => set('couleur_accent', e.target.value)} className="flex-1" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="actif-brand" checked={form.actif} onChange={(e) => set('actif', e.target.checked)} className="w-4 h-4" />
          <Label htmlFor="actif-brand">Marque active</Label>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-2" /> Annuler</Button>
          <Button onClick={() => onSave(form)}><Save className="w-4 h-4 mr-2" /> Enregistrer</Button>
        </div>
      </CardContent>
    </Card>
  );
}