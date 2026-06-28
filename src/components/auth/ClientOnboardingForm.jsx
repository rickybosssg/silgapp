import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, User, Phone, MapPin } from "lucide-react";
import {
  extractLocalPhone,
  formatLocalPhone,
  getCountryConfig,
  normalizePhone,
  phonePlaceholder,
} from "@/lib/phoneUtils";
import CountryCodeSelect from "@/components/ui/CountryCodeSelect";

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

  const selectedCountry = getCountryConfig(form.country_code);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const localPhone = extractLocalPhone(form.telephone, form.country_code);

    if (!form.nom || !localPhone) {
      setError("Nom et téléphone sont obligatoires.");
      return;
    }

    if (localPhone.length !== selectedCountry.len) {
      setError(`Le numéro ${selectedCountry.name} doit contenir ${selectedCountry.len} chiffres.`);
      return;
    }

    setLoading(true);
    try {
      await base44.entities.ClientExterne.create({
        nom: form.nom,
        prenom: form.prenom,
        telephone: normalizePhone(localPhone, form.country_code),
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
          <User className="h-8 w-8 text-accent" />
        </div>
        <h2 className="text-xl font-black text-foreground">Créer votre profil client</h2>
        <p className="mt-1 text-sm text-muted-foreground">Remplissez vos informations</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">
            Nom <span className="text-red-500">*</span>
          </Label>
          <Input
            value={form.nom}
            onChange={(e) => setForm({ ...form, nom: e.target.value })}
            placeholder="Nom"
            className="h-12 rounded-xl"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Prénom</Label>
          <Input
            value={form.prenom}
            onChange={(e) => setForm({ ...form, prenom: e.target.value })}
            placeholder="Prénom"
            className="h-12 rounded-xl"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Pays</Label>
        <CountryCodeSelect
          value={form.country_code}
          onChange={(country_code) =>
            setForm({
              ...form,
              country_code,
              telephone: extractLocalPhone(form.telephone, country_code),
            })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-sm font-semibold">
          <Phone className="h-3.5 w-3.5" /> Téléphone WhatsApp <span className="text-red-500">*</span>
        </Label>
        <div className="flex h-12 overflow-hidden rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
          <div className="flex items-center border-r border-input bg-muted px-3 text-sm font-bold text-foreground">
            +{selectedCountry.dial}
          </div>
          <input
            type="tel"
            inputMode="numeric"
            value={formatLocalPhone(form.telephone, form.country_code)}
            onChange={(e) =>
              setForm({
                ...form,
                telephone: extractLocalPhone(e.target.value, form.country_code),
              })
            }
            placeholder={phonePlaceholder(form.country_code)}
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-foreground outline-none placeholder:text-muted-foreground"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-sm font-semibold">
          <MapPin className="h-3.5 w-3.5" /> Ville
        </Label>
        <Input
          value={form.ville}
          onChange={(e) => setForm({ ...form, ville: e.target.value })}
          placeholder="Votre ville"
          className="h-12 rounded-xl"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Quartier / Adresse</Label>
        <Input
          value={form.quartier}
          onChange={(e) => setForm({ ...form, quartier: e.target.value })}
          placeholder="Quartier ou adresse"
          className="h-12 rounded-xl"
        />
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="h-14 w-full rounded-2xl bg-gradient-to-r from-accent to-green-600 text-base font-bold text-white shadow-lg shadow-accent/20"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Créer mon compte client"}
      </Button>
    </form>
  );
}
