import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Loader2, Pill, Save, Upload, X } from "lucide-react";
import PartenaireLocalisation from "@/components/partenaire/PartenaireLocalisation";

const PAYS = [
  { code: "BF", nom: "Burkina Faso" },
  { code: "CI", nom: "Cote d'Ivoire" },
  { code: "TG", nom: "Togo" },
  { code: "BJ", nom: "Benin" },
  { code: "SN", nom: "Senegal" },
  { code: "ML", nom: "Mali" },
  { code: "GN", nom: "Guinee" },
  { code: "NE", nom: "Niger" },
  { code: "GH", nom: "Ghana" },
];

export default function EtablissementForm({ type, existing, partenaireId, userEmail, onSaved, onCancel, isAdmin }) {
  const isRestaurant = type === "restaurant";
  const isPharmacie = type === "pharmacie";
  const [form, setForm] = useState(existing || {
    nom: "",
    logo_url: "",
    description: "",
    categorie: "",
    specialite: "",
    pays_code: "BF",
    ville: "",
    quartier: "",
    telephone: "",
    telephone_depot: "",
    horaires: "",
    temps_preparation_min: 30,
    ouvert: true,
    actif: true,
    commission_pct: null,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set("logo_url", file_url);
    } catch (error) {
      console.error("Upload logo partenaire echoue", error);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.nom || !form.pays_code) return;
    setSaving(true);
    try {
      const data = {
        ...form,
        partenaire_id: partenaireId,
        user_email: userEmail,
        actif: form.actif !== false,
      };
      const entityName = isPharmacie ? "Pharmacie" : isRestaurant ? "Restaurant" : "Boutique";
      if (existing?.id) {
        await base44.entities[entityName].update(existing.id, data);
      } else {
        await base44.entities[entityName].create(data);
      }
      onSaved?.();
    } catch (error) {
      console.error("Sauvegarde etablissement echouee", error);
    } finally {
      setSaving(false);
    }
  };

  const title = isPharmacie ? "la pharmacie" : isRestaurant ? "le restaurant" : "la boutique";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
      <h2 className="font-bold text-gray-900 text-sm">{existing ? "Modifier" : "Creer"} {title}</h2>

      {existing && !existing.actif && !isAdmin && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-red-700">Etablissement bloque</p>
            <p className="text-xs text-red-600">
              Votre etablissement est actuellement bloque. Veuillez contacter SILGAPP pour plus d'informations.
            </p>
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
              {form.logo_url ? "Changer" : "Telecharger"}
            </div>
          </label>
        </div>
      </div>

      <div>
        <Label className="text-xs">Nom *</Label>
        <Input value={form.nom} onChange={(event) => set("nom", event.target.value)} placeholder="Nom" className="mt-1" />
      </div>

      <div>
        <Label className="text-xs">Description</Label>
        <Textarea value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Description" className="mt-1" rows={2} />
      </div>

      {isRestaurant ? (
        <div>
          <Label className="text-xs">Specialite</Label>
          <Input value={form.specialite || ""} onChange={(event) => set("specialite", event.target.value)} placeholder="Ex: Africain, Fast-food" className="mt-1" />
        </div>
      ) : isPharmacie ? null : (
        <div>
          <Label className="text-xs">Categorie</Label>
          <Input value={form.categorie || ""} onChange={(event) => set("categorie", event.target.value)} placeholder="Ex: Alimentation, Mode" className="mt-1" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Pays *</Label>
          <select value={form.pays_code} onChange={(event) => set("pays_code", event.target.value)} className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm mt-1">
            {PAYS.map((pays) => <option key={pays.code} value={pays.code}>{pays.nom}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Ville</Label>
          <Input value={form.ville || ""} onChange={(event) => set("ville", event.target.value)} placeholder="Ville" className="mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Quartier</Label>
          <Input value={form.quartier || ""} onChange={(event) => set("quartier", event.target.value)} placeholder="Quartier" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Telephone</Label>
          <Input value={form.telephone || ""} onChange={(event) => set("telephone", event.target.value)} placeholder="Telephone" className="mt-1" />
        </div>
      </div>

      <div className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50/50">
        <PartenaireLocalisation
          type={type}
          existingLat={form.latitude}
          existingLng={form.longitude}
          existingAdresse={form.adresse}
          onConfirm={(loc) => {
            set("latitude", loc.latitude);
            set("longitude", loc.longitude);
            if (loc.ville) set("ville", loc.ville);
            if (loc.quartier) set("quartier", loc.quartier);
            if (loc.adresse) set("adresse", loc.adresse);
          }}
        />
      </div>

      <div>
        <Label className="text-xs">Numero Orange Money ou Mobile Money *</Label>
        <Input value={form.telephone_depot || ""} onChange={(event) => set("telephone_depot", event.target.value)} placeholder="Ex: 70 12 34 56" className="mt-1" />
        <p className="text-[10px] text-gray-400 mt-1">Les clients verseront le paiement sur ce numero.</p>
      </div>

      <div>
        <Label className="text-xs">Horaires d'ouverture</Label>
        <Input value={form.horaires || ""} onChange={(event) => set("horaires", event.target.value)} placeholder="Ex: Lun-Sam: 8h-20h" className="mt-1" />
      </div>

      {isRestaurant && (
        <div>
          <Label className="text-xs">Temps de preparation (minutes)</Label>
          <Input type="number" value={form.temps_preparation_min || 30} onChange={(event) => set("temps_preparation_min", parseInt(event.target.value, 10) || 30)} className="mt-1" />
        </div>
      )}

      {isPharmacie && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2">
          <Pill className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800">
            Les clients discutent avec vous par messagerie, envoient leurs ordonnances, puis vous creez la livraison quand le paiement est confirme.
          </p>
        </div>
      )}

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={form.ouvert} onChange={(event) => set("ouvert", event.target.checked)} className="w-4 h-4" />
          Ouvert actuellement
        </label>
        {isAdmin && (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.actif} onChange={(event) => set("actif", event.target.checked)} className="w-4 h-4" />
            Actif sur la plateforme
          </label>
        )}
      </div>

      {isAdmin && (
        <div>
          <Label className="text-xs">Commission (%) - laisser vide pour defaut</Label>
          <Input type="number" value={form.commission_pct ?? ""} onChange={(event) => set("commission_pct", event.target.value ? parseInt(event.target.value, 10) : null)} placeholder="Ex: 10" className="mt-1" />
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving || !form.nom} className="flex-1 bg-purple-600 hover:bg-purple-700">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </Button>
        {onCancel && <Button variant="outline" onClick={onCancel}><X className="w-4 h-4" /></Button>}
      </div>
    </div>
  );
}
