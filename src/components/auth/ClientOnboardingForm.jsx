import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, User, Phone, MapPin } from "lucide-react";
import { SILGAPP_COUNTRIES } from "@/lib/phoneUtils";

export default function ClientOnboardingForm({ user, onComplete }) {
  const [form, setForm] = useState({
    nom: user?.full_name || "",
    prenom: "",
    telephone: "",
    country_code: "BF",
    ville: "",
    quartier: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.telephone || !form.nom) {
      setError("Nom et téléphone sont obligatoires.");
      return;
    }
    setLoading(true);
    try {
      await base44.entities.ClientExterne.create({
        nom: form.nom,
        prenom: form.prenom,
        telephone: form.telephone,
        email: user?.email || "",
        user_email: user?.email || "",
        country_code: form.country_code,
        ville: form.ville,
        quartier: form.quartier,
        actif: true,
      });
      onComplete?.();
    } catch (err) {
      setError(err?.message || "Erreur lors de la création du compte client.");
    } finally {
      setLoading(false);
    }
  };

  const selectedCountry = SILGAPP_COUNTRIES.find(c => c.code === form.country_code);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
          <User className="w-8 h-8 text-accent" />
        </div>
        <h2 className="text-xl font-black text-foreground">Créer votre profil client</h2>
        <p className="text-sm text-muted-foreground mt-1">Remplissez vos informations</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Nom <span className="text-red-500">*</span></Label>
          <Input
            value={form.nom}
            onChange={e => setForm({ ...form, nom: e.target.value })}
            placeholder="Nom"
            className="h-12 rounded-xl"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Prénom</Label>
          <Input
            value={form.prenom}
            onChange={e => setForm({ ...form, prenom: e.target.value })}
            placeholder="Prénom"
            className="h-12 rounded-xl"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-semibold flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5" /> Téléphone WhatsApp <span className="text-red-500">*</span>
        </Label>
        <Input
          type="tel"
          value={form.telephone}
          onChange={e => setForm({ ...form, telephone: e.target.value })}
          placeholder={selectedCountry ? `+${selectedCountry.dial} XX XX XX XX` : "+226 XX XX XX XX"}
          className="h-12 rounded-xl"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Pays</Label>
        <select
          value={form.country_code}
          onChange={e => setForm({ ...form, country_code: e.target.value })}
          className="w-full h-12 rounded-xl border-2 border-input bg-background px-3 text-sm"
        >
          {SILGAPP_COUNTRIES.map(c => (
            <option key={c.code} value={c.code}>{c.flag} {c.name} (+{c.dial})</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-semibold flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" /> Ville
        </Label>
        <Input
          value={form.ville}
          onChange={e => setForm({ ...form, ville: e.target.value })}
          placeholder="Votre ville"
          className="h-12 rounded-xl"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Quartier / Adresse</Label>
        <Input
          value={form.quartier}
          onChange={e => setForm({ ...form, quartier: e.target.value })}
          placeholder="Quartier ou adresse"
          className="h-12 rounded-xl"
        />
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full h-14 rounded-2xl bg-gradient-to-r from-accent to-green-600 text-white font-bold text-base shadow-lg shadow-accent/20"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Créer mon compte client"}
      </Button>
    </form>
  );
}