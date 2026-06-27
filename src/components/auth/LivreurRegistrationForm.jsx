import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, User, Phone, Camera, Upload, MapPin } from "lucide-react";
import { SILGAPP_COUNTRIES } from "@/lib/phoneUtils";

export default function LivreurRegistrationForm({ user, onComplete }) {
  const [form, setForm] = useState({
    nom: user?.full_name || "",
    prenom: "",
    telephone: "",
    country_code: "BF",
    ville: "",
    quartier: "",
  });
  const [photoProfil, setPhotoProfil] = useState(null);
  const [cnibRecto, setCnibRecto] = useState(null);
  const [cnibVerso, setCnibVerso] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");

  // Compression image avant upload (max 800px, JPEG 0.7)
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxSize = 800;
        if (width > height) {
          if (width > maxSize) { height = Math.round((height * maxSize) / width); width = maxSize; }
        } else {
          if (height > maxSize) { width = Math.round((width * maxSize) / height); height = maxSize; }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error("Compression échouée")); return; }
            resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.7
        );
      };
      img.onerror = () => reject(new Error("Image illisible"));
      img.src = URL.createObjectURL(file);
    });
  };

  // Upload un fichier compressé — séquentiel pour éviter la surcharge
  const uploadFile = async (file, label) => {
    if (!file) return null;
    try {
      setUploadProgress(`Compression ${label}...`);
      const compressed = await compressImage(file);
      setUploadProgress(`Envoi ${label}...`);
      const res = await base44.integrations.Core.UploadFile({ file: compressed });
      const url = res?.file_url || null;
      if (!url) throw new Error(`Upload ${label} : URL manquante`);
      return url;
    } catch (err) {
      console.error(`[Upload ${label}]`, err);
      throw new Error(`Échec upload ${label}: ${err?.message || "erreur inconnue"}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.telephone || !form.nom || !form.prenom) {
      setError("Nom, prénom et téléphone sont obligatoires.");
      return;
    }
    if (!photoProfil) {
      setError("La photo de profil est obligatoire.");
      return;
    }
    if (!cnibRecto || !cnibVerso) {
      setError("Les photos CNIB recto et verso sont obligatoires.");
      return;
    }

    setLoading(true);
    try {
      // Upload SÉQUENTIEL (pas Promise.all) — évite la surcharge et les timeouts
      const photoUrl = await uploadFile(photoProfil, "photo profil");
      const rectoUrl = await uploadFile(cnibRecto, "CNIB recto");
      const versoUrl = await uploadFile(cnibVerso, "CNIB verso");
      setUploadProgress("");

      // Créer le profil livreur
      await base44.entities.Livreur.create({
        nom: form.nom,
        prenom: form.prenom,
        telephone: form.telephone,
        user_email: user?.email || "",
        country_code: form.country_code,
        ville: form.ville,
        quartier: form.quartier,
        photo_url: photoUrl,
        photo_cnib_recto_url: rectoUrl || "",
        photo_cnib_verso_url: versoUrl || "",
        type_livreur: "externe",
        reseau: "externe",
        validation: "en_attente",
        actif: false,
        statut: "hors_ligne",
      });

      onComplete?.();
    } catch (err) {
      setError(err?.message || "Erreur lors de l'envoi de la demande.");
    } finally {
      setLoading(false);
      setUploadProgress("");
    }
  };

  const selectedCountry = SILGAPP_COUNTRIES.find(c => c.code === form.country_code);

  const FileUploadField = ({ label, value, onChange, icon: Icon, required, accent = "purple" }) => {
    const accentMap = {
      purple: { dot: "bg-purple-500", bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-600", hover: "hover:border-purple-400" },
      blue: { dot: "bg-blue-500", bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-600", hover: "hover:border-blue-400" },
      green: { dot: "bg-green-500", bg: "bg-green-50", border: "border-green-200", text: "text-green-600", hover: "hover:border-green-400" },
    };
    const c = accentMap[accent] || accentMap.purple;
    return (
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-gray-600">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        {value ? (
          <div className={`flex items-center gap-3 p-3 rounded-2xl ${c.bg} border ${c.border}`}>
            <div className={`w-10 h-10 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${c.text}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-700 truncate">{value.name}</p>
              <p className="text-[10px] text-gray-400">{(value.size / 1024).toFixed(0)} KB · Prêt ✓</p>
            </div>
            <button type="button" onClick={() => onChange(null)} className="text-xs text-red-500 font-semibold hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50">
              Retirer
            </button>
          </div>
        ) : (
          <label className={`flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 border-dashed border-gray-200 ${c.hover} hover:bg-gray-50/50 cursor-pointer transition-all group`}>
            <div className={`w-12 h-12 rounded-2xl ${c.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
              <Icon className={`w-5 h-5 ${c.text}`} />
            </div>
            <span className="text-sm font-semibold text-gray-600">Cliquez pour sélectionner</span>
            <span className="text-[10px] text-gray-400">JPG, PNG ou WebP — compression auto</span>
            <input type="file" accept="image/*" className="hidden" onChange={e => onChange(e.target.files?.[0] || null)} />
          </label>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Header premium ── */}
      <div className="text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/30">
          <Camera className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-black text-gray-900">Demande compte livreur</h2>
        <p className="text-sm text-gray-500 mt-1">Votre demande sera vérifiée par SILGAPP</p>
      </div>

      {/* ── Section : Identité ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-red-500" />
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Identité</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-semibold text-gray-600">Nom <span className="text-red-500">*</span></Label>
            <Input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Ex: Ouédraogo" className="mt-1.5 h-12 rounded-xl text-sm" required />
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-600">Prénom <span className="text-red-500">*</span></Label>
            <Input value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} placeholder="Ex: Ibrahim" className="mt-1.5 h-12 rounded-xl text-sm" required />
          </div>
        </div>
      </section>

      {/* ── Section : Contact ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-blue-500" />
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Contact</h3>
        </div>
        <div>
          <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" /> Téléphone WhatsApp <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1.5">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-mono font-bold">
              {selectedCountry ? `+${selectedCountry.dial}` : "+226"}
            </span>
            <Input
              type="tel" value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })}
              placeholder="XX XX XX XX"
              className="h-12 rounded-xl text-sm font-mono tracking-wider pl-14" required
            />
          </div>
        </div>
        <div>
          <Label className="text-xs font-semibold text-gray-600">Pays</Label>
          <div className="relative mt-1.5">
            <select
              value={form.country_code} onChange={e => setForm({ ...form, country_code: e.target.value })}
              className="w-full h-12 rounded-xl border border-gray-200 bg-white px-3 pr-8 text-sm font-medium appearance-none cursor-pointer focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none"
            >
              {SILGAPP_COUNTRIES.map(c => (
                <option key={c.code} value={c.code}>{c.flag} {c.name} (+{c.dial})</option>
              ))}
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">▼</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Ville</Label>
            <Input value={form.ville} onChange={e => setForm({ ...form, ville: e.target.value })} placeholder="Ex: Ouagadougou" className="mt-1.5 h-12 rounded-xl text-sm" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-600">Quartier</Label>
            <Input value={form.quartier} onChange={e => setForm({ ...form, quartier: e.target.value })} placeholder="Ex: Wemtenga" className="mt-1.5 h-12 rounded-xl text-sm" />
          </div>
        </div>
      </section>

      {/* ── Section : Documents ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-green-500" />
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Documents</h3>
        </div>
        <FileUploadField label="Photo de profil" value={photoProfil} onChange={setPhotoProfil} icon={Camera} required accent="purple" />
        <FileUploadField label="CNIB — Recto" value={cnibRecto} onChange={setCnibRecto} icon={Upload} required accent="blue" />
        <FileUploadField label="CNIB — Verso" value={cnibVerso} onChange={setCnibVerso} icon={Upload} required accent="blue" />
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 font-medium flex items-start gap-2">
          <span className="text-red-500">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <Button
        type="submit" disabled={loading}
        className="w-full h-14 rounded-2xl bg-gradient-to-r from-red-500 to-orange-500 hover:opacity-90 text-white font-bold text-base shadow-lg shadow-red-500/30"
      >
        {loading ? (
          <span className="flex flex-col items-center gap-1">
            <Loader2 className="w-5 h-5 animate-spin" />
            {uploadProgress && <span className="text-xs font-normal opacity-80">{uploadProgress}</span>}
          </span>
        ) : "Envoyer ma demande"}
      </Button>
    </form>
  );
}