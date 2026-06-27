import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, Save, X, AlertTriangle, MapPin } from "lucide-react";
import { toast } from "sonner";
import PartenaireLocalisation from "@/components/partenaire/PartenaireLocalisation";

const PAYS = [
  { code: "BF", nom: "Burkina Faso", emoji: "🇧🇫", digits: 8 }, { code: "CI", nom: "Côte d'Ivoire", emoji: "🇨🇮", digits: 10 },
  { code: "TG", nom: "Togo", emoji: "🇹🇬", digits: 8 }, { code: "BJ", nom: "Bénin", emoji: "🇧🇯", digits: 8 },
  { code: "SN", nom: "Sénégal", emoji: "🇸🇳", digits: 9 }, { code: "ML", nom: "Mali", emoji: "🇲🇱", digits: 8 },
  { code: "GN", nom: "Guinée", emoji: "🇬🇳", digits: 9 }, { code: "NE", nom: "Niger", emoji: "🇳🇪", digits: 8 },
  { code: "GH", nom: "Ghana", emoji: "🇬🇭", digits: 9 },
];

// Compression image avant upload (max 800px, JPEG 0.7) — Correction 1
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const maxSize = 800;
      if (width > height) { if (width > maxSize) { height = Math.round((height * maxSize) / width); width = maxSize; } }
      else { if (height > maxSize) { width = Math.round((width * maxSize) / height); height = maxSize; } }
      canvas.width = width; canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("Compression échouée")); return; }
        resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
      }, "image/jpeg", 0.7);
    };
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = URL.createObjectURL(file);
  });
}

export default function EtablissementForm({ type, existing, partenaireId, userEmail, onSaved, onCancel, isAdmin }) {
  const isRestaurant = type === "restaurant";
  const isPharmacie = type === "pharmacie";
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
    if (!file.type.startsWith("image/")) { toast?.error?.("Format non supporté"); return; }
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const { file_url } = await base44.integrations.Core.UploadFile({ file: compressed });
      set("logo_url", file_url);
    } catch (err) {
      console.error("Upload logo:", err);
    }
    setUploading(false);
  };

  // Validation téléphone selon le pays — Correction 5
  const paysConfig = PAYS.find(p => p.code === form.pays_code) || PAYS[0];
  const telDigits = (form.telephone || "").replace(/\D/g, "");
  const telValide = !form.telephone || telDigits.length === paysConfig.digits;
  const telDepotValide = !form.telephone_depot || (form.telephone_depot.replace(/\D/g, "").length === paysConfig.digits);

  const handleSave = async () => {
    if (!form.nom || !form.pays_code) return;
    // Blocage si téléphone invalide — Correction 5
    if (form.telephone && !telValide) {
      toast?.error?.(`Téléphone invalide : ${paysConfig.nom} requiert ${paysConfig.digits} chiffres`);
      return;
    }
    if (form.telephone_depot && !telDepotValide) {
      toast?.error?.(`Numéro Mobile Money invalide : ${paysConfig.digits} chiffres requis pour ${paysConfig.nom}`);
      return;
    }
    setSaving(true);
    try {
      const data = { ...form, partenaire_id: partenaireId, user_email: userEmail, actif: form.actif !== false };
      const entityName = isPharmacie ? "Pharmacie" : isRestaurant ? "Restaurant" : "Boutique";
      if (existing?.id) {
        await base44.entities[entityName].update(existing.id, data);
      } else {
        await base44.entities[entityName].create(data);
      }
      onSaved?.();
    } catch (err) {}
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
      <h2 className="font-bold text-gray-900 text-sm">{existing ? "Modifier" : "Créer"} {isPharmacie ? "la pharmacie" : isRestaurant ? "le restaurant" : "la boutique"}</h2>
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
      ) : isPharmacie ? null : (
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
        <div>
          <Label className="text-xs">Téléphone ({paysConfig.digits} chiffres)</Label>
          <Input
            value={form.telephone || ""}
            onChange={e => set("telephone", e.target.value.replace(/\D/g, "").slice(0, paysConfig.digits))}
            placeholder={`${paysConfig.emoji} ${paysConfig.digits} chiffres`}
            inputMode="numeric"
            className={`mt-1 ${form.telephone && !telValide ? "border-red-400" : ""}`}
          />
          {form.telephone && !telValide && <p className="text-[10px] text-red-500 mt-0.5">{telDigits.length}/{paysConfig.digits} chiffres</p>}
        </div>
      </div>

      {/* ── Localisation GPS fixe ── */}
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
        <Label className="text-xs">Numéro Mobile Money (dépôt) *</Label>
        <Input
          value={form.telephone_depot || ""}
          onChange={e => set("telephone_depot", e.target.value.replace(/\D/g, "").slice(0, paysConfig.digits))}
          placeholder={`${paysConfig.emoji} ${paysConfig.digits} chiffres`}
          inputMode="numeric"
          className={`mt-1 ${form.telephone_depot && !telDepotValide ? "border-red-400" : ""}`}
        />
        <p className="text-[10px] text-gray-400 mt-1">Les clients verseront le paiement sur ce numéro</p>
      </div>
      <div><Label className="text-xs">Horaires d'ouverture</Label><Input value={form.horaires || ""} onChange={e => set("horaires", e.target.value)} placeholder="Ex: Lun-Sam: 8h-20h" className="mt-1" /></div>
      {isRestaurant && (
        <div><Label className="text-xs">Temps de préparation (minutes)</Label><Input type="number" value={form.temps_preparation_min || 30} onChange={e => set("temps_preparation_min", parseInt(e.target.value) || 30)} className="mt-1" /></div>
      )}
      {isPharmacie && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
          <p className="text-xs text-gray-500">💊 <span className="font-semibold">Pharmacie</span> — Les clients discutent avec vous par messagerie (texte, audio, ordonnances) puis vous créez la livraison quand le paiement est confirmé.</p>
        </div>
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