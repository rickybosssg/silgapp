import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Phone, Camera, Upload, MapPin } from "lucide-react";
import { SILGAPP_COUNTRIES } from "@/lib/phoneUtils";
import CountryCodeSelect from "@/components/ui/CountryCodeSelect";

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

  const uploadFile = async (file) => {
    if (!file) return null;
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      return res?.file_url || null;
    } catch { return null; }
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
      // Upload des fichiers
      const [photoUrl, rectoUrl, versoUrl] = await Promise.all([
        uploadFile(photoProfil),
        uploadFile(cnibRecto),
        uploadFile(cnibVerso),
      ]);

      if (!photoUrl) throw new Error("Échec upload photo profil");

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
    }
  };

  const selectedCountry = SILGAPP_COUNTRIES.find(c => c.code === form.country_code);

  const FileUploadField = ({ label, value, onChange, icon: Icon, required }) => (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {value ? (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-accent/5 border border-accent/20">
          <Icon className="w-5 h-5 text-accent" />
          <span className="text-sm text-accent font-medium truncate flex-1">{value.name}</span>
          <button type="button" onClick={() => onChange(null)} className="text-xs text-destructive font-semibold">
            Retirer
          </button>
        </div>
      ) : (
        <label className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-input hover:border-primary/40 cursor-pointer transition-colors">
          <Upload className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Cliquez pour sélectionner un fichier</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => onChange(e.target.files?.[0] || null)}
          />
        </label>
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Camera className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-black text-foreground">Demande compte livreur</h2>
        <p className="text-sm text-muted-foreground mt-1">Votre demande sera vérifiée par SILGAPP</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Nom <span className="text-red-500">*</span></Label>
          <Input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Nom" className="h-12 rounded-xl" required />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Prénom <span className="text-red-500">*</span></Label>
          <Input value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} placeholder="Prénom" className="h-12 rounded-xl" required />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-semibold flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5" /> Téléphone WhatsApp <span className="text-red-500">*</span>
        </Label>
        <Input
          type="tel" value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })}
          placeholder={selectedCountry ? `+${selectedCountry.dial} XX XX XX XX` : "+226 XX XX XX XX"}
          className="h-12 rounded-xl" required
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Pays</Label>
        <CountryCodeSelect
          value={form.country_code}
          onChange={(country_code) => setForm({ ...form, country_code })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-semibold flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Ville</Label>
        <Input value={form.ville} onChange={e => setForm({ ...form, ville: e.target.value })} placeholder="Votre ville" className="h-12 rounded-xl" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Quartier de résidence</Label>
        <Input value={form.quartier} onChange={e => setForm({ ...form, quartier: e.target.value })} placeholder="Quartier" className="h-12 rounded-xl" />
      </div>

      <FileUploadField label="Photo de profil" value={photoProfil} onChange={setPhotoProfil} icon={Camera} required />
      <FileUploadField label="Photo CNIB — Recto" value={cnibRecto} onChange={setCnibRecto} icon={Upload} required />
      <FileUploadField label="Photo CNIB — Verso" value={cnibVerso} onChange={setCnibVerso} icon={Upload} required />

      {error && (
        <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      <Button
        type="submit" disabled={loading}
        className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary to-red-600 text-white font-bold text-base shadow-lg shadow-primary/20"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Envoyer ma demande"}
      </Button>
    </form>
  );
}
