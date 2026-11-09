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
import SmartAddressInput from "@/components/location/SmartAddressInput";

export default function ClientOnboardingForm({ user, onComplete }) {
  const [form, setForm] = useState({
    nom: user?.full_name || "",
    prenom: "",
    telephone: "",
    country_code: "",
    ville: "",
    quartier: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedCountry = getCountryConfig(form.country_code);

  const createClient = async () => {
    const localPhone = extractLocalPhone(form.telephone, form.country_code);
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
        latitude: form.latitude || null,
        longitude: form.longitude || null,
        actif: true,
      });
      onComplete?.();
    } catch (err) {
      setError(err?.message || "Erreur lors de la création du compte client.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const localPhone = extractLocalPhone(form.telephone, form.country_code);

    if (!form.nom || !localPhone) {
      setError("Nom et téléphone sont obligatoires.");
      return;
    }

    if (!form.country_code) {
      setError("Le pays est obligatoire. Sélectionnez votre pays avant de continuer (COUNTRY_REQUIRED).");
      return;
    }

    if (localPhone.length !== selectedCountry.len) {
      setError(`Le numéro ${selectedCountry.name} doit contenir ${selectedCountry.len} chiffres.`);
      return;
    }

    await createClient();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-[28px] border border-slate-200/80 bg-white p-5 sm:p-8 shadow-[0_16px_60px_-24px_rgba(15,23,42,0.25)]">
      <div className="mb-6 border-b border-slate-100 pb-6 text-left">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50">
          <User className="h-7 w-7 text-blue-700" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-950">Créer votre profil client</h2>
        <p className="mt-1 text-sm text-muted-foreground">Remplissez vos informations</p>
      </div>

      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">
            Nom <span className="text-red-500">*</span>
          </Label>
          <Input
            value={form.nom}
            onChange={(e) => setForm({ ...form, nom: e.target.value })}
            placeholder="Nom"
            className="h-12 rounded-xl border-slate-200 bg-white text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-600 focus:ring-blue-600/20"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Prénom</Label>
          <Input
            value={form.prenom}
            onChange={(e) => setForm({ ...form, prenom: e.target.value })}
            placeholder="Prénom"
            className="h-12 rounded-xl border-slate-200 bg-white text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-600 focus:ring-blue-600/20"
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
          className="h-12 rounded-xl border-slate-200 bg-white text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-600 focus:ring-blue-600/20"
        />
      </div>

      <SmartAddressInput
        countryCode={form.country_code}
        value={form.quartier}
        label="Quartier / Adresse"
        placeholder="Commencez par le nom du quartier..."
        inputClassName="h-12 rounded-xl border-slate-200 bg-white text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-600 focus:ring-blue-600/20"
        onChange={(text, location) =>
          setForm((previous) => ({
            ...previous,
            quartier: location?.quartier || location?.label || text,
            ville: location?.ville || previous.ville,
            ...(location && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))
              ? { latitude: Number(location.latitude), longitude: Number(location.longitude) }
              : {}),
          }))
        }
      />

      {error && (
        <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="min-h-14 h-auto py-4 w-full rounded-xl bg-blue-700 hover:bg-blue-800 text-base font-semibold text-white shadow-md shadow-blue-900/10 focus-visible:ring-4 focus-visible:ring-blue-200"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Créer mon compte client"}
      </Button>
    </form>
  );
}