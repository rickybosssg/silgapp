import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, Save, X, AlertTriangle } from "lucide-react";

const PAYS = [
  { code: "BF", nom: "Burkina Faso" }, { code: "CI", nom: "Côte d'Ivoire" },
  { code: "TG", nom: "Togo" }, { code: "BJ", nom: "Bénin" },
  { code: "SN", nom: "Sénégal" }, { code: "ML", nom: "Mali" },
  { code: "GN", nom: "Guinée" }, { code: "NE", nom: "Niger" }, { code: "GH", nom: "Ghana" },
];

export default function EtablissementForm({ type, existing, partenaireId, userEmail, onSaved, onCancel, isAdmin }) {
  const isRestaurant = type === "restaurant";
  const [form, setForm] = useState(existing || {
    nom: "", logo_url: "", description: "",
    categorie: "", specialite: "",
    pays_code: "BF", ville: "", quartier: "",
    telephone: "", telephone_depot: "",
    horaires: "", temps_preparation_min: 30,
    ouvert: true, actif: true, commission_pct: null,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set("logo_url", file_url);
    } catch (err) {}
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.nom || !form.pays_code) return;
    setSaving(true);
    try {
      const data = { ...form, partenaire_id: partenaireId, user_email: userEmail, actif: form.actif !== false };
      if (existing?.id) {
        await base44.entities[isRestaurant ? "Restaurant" : "Boutique"].update(existing.id, data);
      } else {
        await base44.entities[isRestaurant ? "Restaurant" : "Boutique"].create(data);
      }
      onSaved?.();
    } catch (err) {}
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
      <h2 className="font-bold text-gray-900 text-sm">{existing ? "Modifier" : "Créer"} {isRestaurant ? "le restaurant" : "la boutique"}</h2>
      {existing && !existing.actif && !isAdmin && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-red-700">Établissement bloqué</p>
            <p className="text-xs text-red-600">Votre établissement est actuellement bloqué. Veuillez contacter SILGAPP pour plus d'informations.</p>
          </div>
        </div>
      )}
      <div>
        <Label className="text-xs">Logo / Photo</Label>
        <div className="flex items-center gap-3 mt-1">
          {form.logo_url && <img src={form.logo_url} alt="logo" className="w-16 h-16 rounded-xl object-cover" />}
          <label className="cursor-pointer">
            <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploading} />
            <div className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 flex items-center gap-2">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {form.logo_url ? "Changer" : "Télécharger"}
            </div>
          </label>
        </div>
      </div>
      <div><Label className="text-xs">Nom *</Label><Input value={form.nom} onChange={e => set("nom", e.target.value)} placeholder="Nom" className="mt-1" /></div>
      <div><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={e => set("description", e.target.value)} placeholder="Description" className="mt-1" rows={2} /></div>
      {isRestaurant ? (
        <div><Label className="text-xs">Spécialité</Label><Input value={form.specialite || ""} onChange={e => set("specialite", e.target.value)} placeholder="Ex: Africain, Fast-food" className="mt-1" /></div>
      ) : (
        <div><Label className="text-xs">Catégorie</Label><Input value={form.categorie || ""} onChange={e => set("categorie", e.target.value)} placeholder="Ex: Alimentation, Mode" className="mt-1" /></div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">Pays *</Label>
          <select value={form.pays_code} onChange={e => set("pays_code", e.target.value)} className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm mt-1">
            {PAYS.map(p => <option key={p.code} value={p.code}>{p.nom}</option>)}
          </select>
        </div>
        <div><Label className="text-xs">Ville</Label><Input value={form.ville || ""} onChange={e => set("ville", e.target.value)} placeholder="Ville" className="mt-1" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">Quartier</Label><Input value={form.quartier || ""} onChange={e => set("quartier", e.target.value)} placeholder="Quartier" className="mt-1" /></div>
        <div><Label className="text-xs">Téléphone</Label><Input value={form.telephone || ""} onChange={e => set("telephone", e.target.value)} placeholder="Téléphone" className="mt-1" /></div>
      </div>
      <div>
        <Label className="text-xs">Numéro Orange Money (dépôt) *</Label>
        <Input value={form.telephone_depot || ""} onChange={e => set("telephone_depot", e.target.value)} placeholder="Ex: 70 12 34 56" className="mt-1" />
        <p className="text-[10px] text-gray-400 mt-1">Les clients verseront le paiement sur ce numéro</p>
      </div>
      <div><Label className="text-xs">Horaires d'ouverture</Label><Input value={form.horaires || ""} onChange={e => set("horaires", e.target.value)} placeholder="Ex: Lun-Sam: 8h-20h" className="mt-1" /></div>
      {isRestaurant && (
        <div><Label className="text-xs">Temps de préparation (minutes)</Label><Input type="number" value={form.temps_preparation_min || 30} onChange={e => set("temps_preparation_min", parseInt(e.target.value) || 30)} className="mt-1" /></div>
      )}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.ouvert} onChange={e => set("ouvert", e.target.checked)} className="w-4 h-4" /> Ouvert actuellement</label>
        {isAdmin && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.actif} onChange={e => set("actif", e.target.checked)} className="w-4 h-4" /> Actif sur la plateforme</label>}
      </div>
      {isAdmin && <div><Label className="text-xs">Commission (%) — laisser vide pour défaut</Label><Input type="number" value={form.commission_pct ?? ""} onChange={e => set("commission_pct", e.target.value ? parseInt(e.target.value) : null)} placeholder="Ex: 10" className="mt-1" /></div>}
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving || !form.nom} className="flex-1 bg-purple-600 hover:bg-purple-700">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
        </Button>
        {onCancel && <Button variant="outline" onClick={onCancel}><X className="w-4 h-4" /></Button>}
      </div>
    </div>
  );
}
