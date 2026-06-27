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

  const typeLabel = isPharmacie ? "Pharmacie" : isRestaurant ? "Restaurant" : "Boutique";
  const typeIcon = isPharmacie ? "💊" : isRestaurant ? "🍽️" : "🏪";
  const accentColor = isPharmacie ? "from-blue-600 to-cyan-600" : isRestaurant ? "from-orange-500 to-red-500" : "from-purple-600 to-pink-600";

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
      {/* ── Header premium ── */}
      <div className={`bg-gradient-to-r ${accentColor} px-6 py-5`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-2xl">
            {typeIcon}
          </div>
          <div>
            <h2 className="font-black text-white text-lg leading-tight">
              {existing ? "Modifier" : "Créer"} {typeLabel.toLowerCase()}
            </h2>
            <p className="text-white/80 text-xs font-medium">Renseignez les informations de votre établissement</p>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-6">
        {existing && !existing.actif && !isAdmin && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-700">Établissement bloqué</p>
              <p className="text-xs text-red-600 mt-0.5">Votre établissement est actuellement bloqué. Veuillez contacter SILGAPP pour plus d'informations.</p>
            </div>
          </div>
        )}

        {/* ── Section : Identité ── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full bg-purple-500" />
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Identité</h3>
          </div>

          {/* Logo upload — zone premium */}
          <div>
            <Label className="text-xs font-semibold text-gray-600">Logo / Photo</Label>
            <label className="mt-2 flex flex-col items-center justify-center gap-2 cursor-pointer rounded-2xl border-2 border-dashed border-gray-200 hover:border-purple-400 hover:bg-purple-50/30 transition-all p-6 group">
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploading} />
              {form.logo_url ? (
                <div className="flex items-center gap-4">
                  <img src={form.logo_url} alt="logo" className="w-20 h-20 rounded-2xl object-cover shadow-md ring-2 ring-purple-100" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-700">Logo chargé ✓</p>
                    <p className="text-xs text-gray-400 group-hover:text-purple-500">Cliquez pour changer</p>
                  </div>
                </div>
              ) : uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                  <p className="text-xs text-gray-500">Compression en cours...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                    <Upload className="w-6 h-6 text-purple-500" />
                  </div>
                  <p className="text-sm font-semibold text-gray-600">Cliquez pour ajouter un logo</p>
                  <p className="text-[10px] text-gray-400">JPG, PNG ou WebP — compression automatique</p>
                </div>
              )}
            </label>
          </div>

          <div>
            <Label className="text-xs font-semibold text-gray-600">Nom de l'établissement *</Label>
            <Input value={form.nom} onChange={e => set("nom", e.target.value)} placeholder={`Ex: ${typeLabel} ${typeIcon}`} className="mt-1.5 h-12 rounded-xl text-sm font-medium" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-600">Description</Label>
            <Textarea value={form.description} onChange={e => set("description", e.target.value)} placeholder="Décrivez votre établissement en quelques mots..." className="mt-1.5 rounded-xl text-sm" rows={3} />
          </div>
          {isRestaurant ? (
            <div>
              <Label className="text-xs font-semibold text-gray-600">Spécialité culinaire</Label>
              <Input value={form.specialite || ""} onChange={e => set("specialite", e.target.value)} placeholder="Ex: Africain, Fast-food, Grillades" className="mt-1.5 h-12 rounded-xl text-sm" />
            </div>
          ) : isPharmacie ? null : (
            <div>
              <Label className="text-xs font-semibold text-gray-600">Catégorie</Label>
              <Input value={form.categorie || ""} onChange={e => set("categorie", e.target.value)} placeholder="Ex: Alimentation, Mode, Électronique" className="mt-1.5 h-12 rounded-xl text-sm" />
            </div>
          )}
        </section>

        {/* ── Section : Localisation ── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full bg-blue-500" />
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Localisation</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-gray-600">Pays *</Label>
              <div className="relative mt-1.5">
                <select value={form.pays_code} onChange={e => set("pays_code", e.target.value)} className="w-full h-12 rounded-xl border border-gray-200 bg-white px-3 pr-8 text-sm font-medium appearance-none cursor-pointer focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none">
                  {PAYS.map(p => <option key={p.code} value={p.code}>{p.emoji} {p.nom}</option>)}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">▼</span>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600">Ville</Label>
              <Input value={form.ville || ""} onChange={e => set("ville", e.target.value)} placeholder="Ex: Ouagadougou" className="mt-1.5 h-12 rounded-xl text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-600">Quartier</Label>
            <Input value={form.quartier || ""} onChange={e => set("quartier", e.target.value)} placeholder="Ex: Wemtenga" className="mt-1.5 h-12 rounded-xl text-sm" />
          </div>

          {/* Localisation GPS fixe */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50/30 p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-blue-500" />
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">Position GPS fixe</p>
            </div>
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
        </section>

        {/* ── Section : Contact & Paiement ── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full bg-green-500" />
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Contact & Paiement</h3>
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-600">Téléphone ({paysConfig.digits} chiffres pour {paysConfig.nom})</Label>
            <div className="relative mt-1.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">{paysConfig.emoji}</span>
              <Input
                value={form.telephone || ""}
                onChange={e => set("telephone", e.target.value.replace(/\D/g, "").slice(0, paysConfig.digits))}
                placeholder={`${paysConfig.digits} chiffres`}
                inputMode="numeric"
                className={`h-12 rounded-xl text-sm font-mono tracking-wider pl-10 ${form.telephone && !telValide ? "border-red-400 ring-2 ring-red-100" : ""}`}
              />
            </div>
            {form.telephone && !telValide && <p className="text-[11px] text-red-500 mt-1 font-medium">⚠️ {telDigits.length}/{paysConfig.digits} chiffres saisis</p>}
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-600">Numéro Mobile Money (dépôt) *</Label>
            <div className="relative mt-1.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">{paysConfig.emoji}</span>
              <Input
                value={form.telephone_depot || ""}
                onChange={e => set("telephone_depot", e.target.value.replace(/\D/g, "").slice(0, paysConfig.digits))}
                placeholder={`${paysConfig.digits} chiffres`}
                inputMode="numeric"
                className={`h-12 rounded-xl text-sm font-mono tracking-wider pl-10 ${form.telephone_depot && !telDepotValide ? "border-red-400 ring-2 ring-red-100" : ""}`}
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Les clients verseront le paiement sur ce numéro</p>
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-600">Horaires d'ouverture</Label>
            <Input value={form.horaires || ""} onChange={e => set("horaires", e.target.value)} placeholder="Ex: Lun-Sam: 8h-20h" className="mt-1.5 h-12 rounded-xl text-sm" />
          </div>
          {isRestaurant && (
            <div>
              <Label className="text-xs font-semibold text-gray-600">Temps de préparation (minutes)</Label>
              <Input type="number" value={form.temps_preparation_min || 30} onChange={e => set("temps_preparation_min", parseInt(e.target.value) || 30)} className="mt-1.5 h-12 rounded-xl text-sm" />
            </div>
          )}
        </section>

        {/* ── Section : Paramètres ── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full bg-gray-400" />
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Paramètres</h3>
          </div>
          {isPharmacie && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <p className="text-xs text-blue-700 leading-relaxed">💊 <span className="font-bold">Mode Pharmacie</span> — Les clients discutent avec vous par messagerie (texte, audio, ordonnances) puis vous créez la livraison quand le paiement est confirmé.</p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div className="relative">
                <input type="checkbox" checked={form.ouvert} onChange={e => set("ouvert", e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-green-500 transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
              </div>
              <span className="text-sm font-medium text-gray-700">Ouvert actuellement</span>
            </label>
            {isAdmin && (
              <label className="flex items-center gap-2.5 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" checked={form.actif} onChange={e => set("actif", e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-purple-500 transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
                </div>
                <span className="text-sm font-medium text-gray-700">Actif sur la plateforme</span>
              </label>
            )}
          </div>
          {isAdmin && (
            <div>
              <Label className="text-xs font-semibold text-gray-600">Commission (%) — laisser vide pour défaut</Label>
              <Input type="number" value={form.commission_pct ?? ""} onChange={e => set("commission_pct", e.target.value ? parseInt(e.target.value) : null)} placeholder="Ex: 10" className="mt-1.5 h-12 rounded-xl text-sm" />
            </div>
          )}
        </section>

        {/* ── Actions ── */}
        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <Button onClick={handleSave} disabled={saving || !form.nom} className={`flex-1 h-13 py-3.5 rounded-2xl bg-gradient-to-r ${accentColor} hover:opacity-90 text-white font-bold text-sm shadow-lg`}>
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Enregistrer
          </Button>
          {onCancel && <Button variant="outline" onClick={onCancel} className="h-13 px-4 rounded-2xl border-gray-200"><X className="w-5 h-5" /></Button>}
        </div>
      </div>
    </div>
  );
}