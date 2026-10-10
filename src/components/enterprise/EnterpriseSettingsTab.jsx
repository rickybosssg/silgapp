import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, MapPin, Calendar, Percent, Mail, Lock, Save, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * EnterpriseSettingsTab — Paramètres Enterprise visibles par l'Admin Entreprise.
 *
 * READ-ONLY (Super Admin SILGAPP uniquement) :
 *   - nom, slug, country_code, statut, date_creation
 *   - commission_silgapp_pct
 *
 * ÉDITABLE (Admin Entreprise) :
 *   - email, telephone, whatsapp, adresse
 *   (sauvegardé via manageDriverInvitation action=update_branding)
 *
 * NOTE : Logo, couleur_primaire, nom_commercial sont gérés dans l'onglet Branding.
 */
export default function EnterpriseSettingsTab({ enterprise, onRefresh }) {
  const [form, setForm] = useState({
    email: enterprise?.email || "",
    telephone: enterprise?.telephone || "",
    whatsapp: enterprise?.whatsapp || "",
    adresse: enterprise?.adresse || "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await base44.functions.invoke("manageDriverInvitation", {
        action: "update_branding",
        ...form,
      });
      setSuccess(true);
      onRefresh?.();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      toast.error(err?.message || "Erreur lors de la sauvegarde");
    } finally {
      setLoading(false);
    }
  };

  const readOnlyFields = [
    { icon: Building2, label: "Nom légal", value: enterprise?.nom || "—" },
    { icon: MapPin, label: "Pays", value: enterprise?.country_code || "—" },
    { icon: Building2, label: "Slug", value: enterprise?.slug || "—" },
    { icon: Calendar, label: "Date de création", value: enterprise?.date_creation ? new Date(enterprise.date_creation).toLocaleDateString("fr-FR") : "—" },
    { icon: Building2, label: "Statut", value: enterprise?.statut === "actif" ? "Actif" : "Suspendu" },
  ];

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {/* ── Identité entreprise (read-only) ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-bold text-gray-900">Identité de l'entreprise</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {readOnlyFields.map((field) => (
            <div key={field.label} className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 font-semibold uppercase">{field.label}</p>
              <p className="text-sm font-bold text-gray-900 truncate">{field.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Commission SILGAPP (read-only, Super Admin) ── */}
      <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Percent className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-bold text-amber-900">Commission SILGAPP</h3>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
            <Lock className="w-2.5 h-2.5" /> Super Admin
          </span>
        </div>
        <p className="text-2xl font-black text-amber-700">
          {enterprise?.commission_silgapp_pct ?? 0}<span className="text-sm font-normal">%</span>
        </p>
        <p className="text-[10px] text-amber-600 mt-1">
          Taux verrouillé par le Super Admin SILGAPP. Non modifiable par l'Admin Entreprise.
        </p>
      </div>

      {/* ── Coordonnées éditables ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-bold text-gray-900">Coordonnées</h3>
        </div>
        <div>
          <Label className="text-[10px] text-gray-500 font-semibold uppercase">Email</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="contact@entreprise.com"
            className="mt-1 rounded-xl h-11 bg-blue-50 border-blue-200/60 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] text-gray-500 font-semibold uppercase">Téléphone</Label>
            <Input
              value={form.telephone}
              onChange={(e) => setForm({ ...form, telephone: e.target.value })}
              placeholder="+226 XX XX XX XX"
              className="mt-1 rounded-xl h-11 bg-blue-50 border-blue-200/60 text-sm"
            />
          </div>
          <div>
            <Label className="text-[10px] text-gray-500 font-semibold uppercase">WhatsApp</Label>
            <Input
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              placeholder="+226 XX XX XX XX"
              className="mt-1 rounded-xl h-11 bg-blue-50 border-blue-200/60 text-sm"
            />
          </div>
        </div>
        <div>
          <Label className="text-[10px] text-gray-500 font-semibold uppercase">Adresse</Label>
          <Input
            value={form.adresse}
            onChange={(e) => setForm({ ...form, adresse: e.target.value })}
            placeholder="Adresse physique"
            className="mt-1 rounded-xl h-11 bg-blue-50 border-blue-200/60 text-sm"
          />
        </div>
      </div>

      {/* ── Note Branding ── */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-3">
        <p className="text-xs text-blue-700">
          Le logo, la couleur principale et le nom commercial sont gérés dans l'onglet « Branding ».
        </p>
      </div>

      {success && (
        <p className="text-sm text-emerald-600 flex items-center gap-1 justify-center">
          <Check className="w-4 h-4" /> Paramètres mis à jour
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl text-sm font-bold">
        {loading ? "Enregistrement..." : <><Save className="w-4 h-4 mr-2" /> Enregistrer les coordonnées</>}
      </Button>
    </form>
  );
}