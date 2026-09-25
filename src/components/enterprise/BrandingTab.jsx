import React, { useState, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Upload, Loader2, Check } from "lucide-react";

export default function BrandingTab({ enterprise, onRefresh }) {
  const [form, setForm] = useState({
    nom_commercial: enterprise?.nom_commercial || "",
    whatsapp: enterprise?.whatsapp || "",
    logo_url: enterprise?.logo_url || "",
    couleur_primaire: enterprise?.couleur_primaire || "#007AFF",
    telephone: enterprise?.telephone || "",
    adresse: enterprise?.adresse || "",
  });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setForm({
      nom_commercial: enterprise?.nom_commercial || "",
      whatsapp: enterprise?.whatsapp || "",
      logo_url: enterprise?.logo_url || "",
      couleur_primaire: enterprise?.couleur_primaire || "#007AFF",
      telephone: enterprise?.telephone || "",
      adresse: enterprise?.adresse || "",
    });
  }, [enterprise]);

  const handleUploadLogo = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const res = await base44.integrations.Core.UploadPublicFile({ file });
      const url = res?.file_url;
      if (!url) throw new Error("URL manquante");
      setForm((f) => ({ ...f, logo_url: url }));
    } catch (err) {
      setError("Erreur upload logo: " + (err?.message || ""));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);
    try {
      await base44.functions.invoke("manageDriverInvitation", {
        action: "update_branding",
        ...form,
      });
      setSuccess(true);
      onRefresh?.();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const primaryColor = form.couleur_primaire;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Aperçu */}
      <Card>
        <CardContent className="p-4">
          <div
            className="rounded-xl p-4 text-white text-center"
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}DD)` }}
          >
            {form.logo_url ? (
              <img src={form.logo_url} alt="" className="w-14 h-14 rounded-xl object-cover bg-white/10 mx-auto mb-2" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center mx-auto mb-2">
                <Building2 className="w-7 h-7" />
              </div>
            )}
            <p className="text-sm font-bold">{form.nom_commercial || enterprise?.nom || "Nom de l'agence"}</p>
            <p className="text-[10px] opacity-80 mt-0.5">Propulsé par SILGAPP</p>
          </div>
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Logo de l'agence</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {form.logo_url ? (
            <div className="flex items-center gap-3">
              <img src={form.logo_url} alt="" className="w-16 h-16 rounded-xl object-cover border" />
              <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, logo_url: "" })}>
                Retirer
              </Button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-400 cursor-pointer transition-colors">
              {uploading ? (
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              ) : (
                <Upload className="w-6 h-6 text-gray-400" />
              )}
              <span className="text-sm text-gray-500">{uploading ? "Upload..." : "Cliquez pour téléverser un logo"}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleUploadLogo(e.target.files?.[0])}
              />
            </label>
          )}
        </CardContent>
      </Card>

      {/* Informations */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Informations de l'agence</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Nom commercial</Label>
            <Input value={form.nom_commercial} onChange={(e) => setForm({ ...form, nom_commercial: e.target.value })} placeholder="Nom affiché publiquement" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">WhatsApp</Label>
            <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="+226 XX XX XX XX" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Téléphone</Label>
            <Input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Adresse</Label>
            <Input value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Couleur principale</Label>
            <div className="flex items-center gap-2 mt-1">
              <input type="color" value={form.couleur_primaire} onChange={(e) => setForm({ ...form, couleur_primaire: e.target.value })} className="w-10 h-8 rounded" />
              <Input value={form.couleur_primaire} onChange={(e) => setForm({ ...form, couleur_primaire: e.target.value })} className="flex-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {success && <p className="text-sm text-emerald-600 flex items-center gap-1"><Check className="w-4 h-4" /> Branding mis à jour</p>}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Enregistrement..." : "Enregistrer"}
      </Button>
    </form>
  );
}