import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Plus, Pencil, Power, Save, X, Loader2, Coins,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const ZONE_TARIFAIRE_DEFAULTS = {
  pays_code: "BF",
  ville: "Ouagadougou",
  zone_tarifaire: "GRAND_OUAGA",
  palier_1_km_max: 15,
  palier_1_prix: 1250,
  palier_2_km_max: 25,
  palier_2_prix: 1750,
  tolerance_min_km: 14,
  tolerance_max_km: 16,
  seuil_strict_km: 15,
  devise: "FCFA",
  actif: true,
  date_debut: null,
  date_fin: null,
  description: "",
};

export default function TarificationAdmin() {
  const { toast } = useToast();
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | "new" | zone object
  const [saving, setSaving] = useState(false);

  const loadZones = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.TarifZone.list("-date_debut", 100);
      setZones(data || []);
    } catch (err) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadZones(); }, []);

  const handleSave = async (formData) => {
    setSaving(true);
    try {
      const payload = {
        ...formData,
        palier_1_km_max: Number(formData.palier_1_km_max),
        palier_1_prix: Number(formData.palier_1_prix),
        palier_2_km_max: Number(formData.palier_2_km_max),
        palier_2_prix: Number(formData.palier_2_prix),
        tolerance_min_km: Number(formData.tolerance_min_km),
        tolerance_max_km: Number(formData.tolerance_max_km),
        seuil_strict_km: Number(formData.seuil_strict_km),
        date_debut: formData.date_debut || new Date().toISOString(),
      };
      if (editing === "new") {
        await base44.entities.TarifZone.create(payload);
      } else {
        await base44.entities.TarifZone.update(editing.id, payload);
      }
      toast({ title: "Tarif enregistré", description: "La configuration tarifaire a été mise à jour." });
      setEditing(null);
      loadZones();
    } catch (err) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (zone) => {
    try {
      await base44.entities.TarifZone.update(zone.id, { actif: !zone.actif });
      toast({ title: zone.actif ? "Zone désactivée" : "Zone activée" });
      loadZones();
    } catch (err) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            Tarification
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configurez les tarifs par zone. Les changements sont appliqués immédiatement, sans rebuild APK.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="w-4 h-4" /> Nouvelle zone
        </Button>
      </div>

      {zones.length === 0 && !editing && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            Aucune zone tarifaire configurée. Cliquez sur « Nouvelle zone » pour commencer.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {zones.map((z) => (
          <Card key={z.id} className={!z.actif ? "opacity-60" : ""}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm">{z.zone_tarifaire}</span>
                  <Badge variant={z.actif ? "success" : "secondary"}>
                    {z.actif ? "Actif" : "Inactif"}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500">
                  {z.pays_code} {z.ville ? `· ${z.ville}` : "· Toutes villes"}
                  {z.description ? ` · ${z.description}` : ""}
                </p>
                <div className="flex flex-wrap gap-3 mt-2 text-xs">
                  <span className="px-2 py-1 bg-gray-100 rounded">
                    ≤ {z.palier_1_km_max} km → <strong>{z.palier_1_prix} {z.devise}</strong>
                  </span>
                  <span className="px-2 py-1 bg-gray-100 rounded">
                    {z.palier_1_km_max}–{z.palier_2_km_max} km → <strong>{z.palier_2_prix} {z.devise}</strong>
                  </span>
                  <span className="px-2 py-1 bg-gray-100 rounded">
                    Tolérance: {z.tolerance_min_km}–{z.tolerance_max_km} km
                  </span>
                  <span className="px-2 py-1 bg-gray-100 rounded">
                    Seuil strict: {z.seuil_strict_km} km
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(z)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => handleToggle(z)}>
                  <Power className={`w-4 h-4 ${z.actif ? "text-green-600" : "text-gray-400"}`} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && (
        <TarifZoneForm
          initial={editing === "new" ? ZONE_TARIFAIRE_DEFAULTS : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          saving={saving}
        />
      )}
    </div>
  );
}

function TarifZoneForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ ...initial });

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-base">
          {initial.id ? "Modifier la zone" : "Nouvelle zone tarifaire"}
        </CardTitle>
        <CardDescription>
          Les valeurs sont appliquées immédiatement après enregistrement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Pays</Label>
            <Input value={form.pays_code} onChange={(e) => update("pays_code", e.target.value.toUpperCase())} maxLength={2} />
          </div>
          <div>
            <Label className="text-xs">Ville</Label>
            <Input value={form.ville || ""} onChange={(e) => update("ville", e.target.value)} placeholder="Ouagadougou" />
          </div>
          <div>
            <Label className="text-xs">Zone tarifaire</Label>
            <Input value={form.zone_tarifaire} onChange={(e) => update("zone_tarifaire", e.target.value.toUpperCase())} placeholder="GRAND_OUAGA" />
          </div>
        </div>

        <div className="border-t pt-3">
          <p className="text-xs font-semibold text-gray-600 mb-2">Palier 1 (distance courte)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Distance max (km)</Label>
              <Input type="number" value={form.palier_1_km_max} onChange={(e) => update("palier_1_km_max", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Prix ({form.devise})</Label>
              <Input type="number" value={form.palier_1_prix} onChange={(e) => update("palier_1_prix", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="border-t pt-3">
          <p className="text-xs font-semibold text-gray-600 mb-2">Palier 2 (distance moyenne)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Distance max (km)</Label>
              <Input type="number" value={form.palier_2_km_max} onChange={(e) => update("palier_2_km_max", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Prix ({form.devise})</Label>
              <Input type="number" value={form.palier_2_prix} onChange={(e) => update("palier_2_prix", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="border-t pt-3">
          <p className="text-xs font-semibold text-gray-600 mb-2">Tolérance GPS</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Tol. min (km)</Label>
              <Input type="number" value={form.tolerance_min_km} onChange={(e) => update("tolerance_min_km", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Tol. max (km)</Label>
              <Input type="number" value={form.tolerance_max_km} onChange={(e) => update("tolerance_max_km", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Seuil strict (km)</Label>
              <Input type="number" value={form.seuil_strict_km} onChange={(e) => update("seuil_strict_km", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Devise</Label>
            <Input value={form.devise} onChange={(e) => update("devise", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Input value={form.description || ""} onChange={(e) => update("description", e.target.value)} placeholder="Optionnel" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            <X className="w-4 h-4" /> Annuler
          </Button>
          <Button onClick={() => onSave(form)} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}