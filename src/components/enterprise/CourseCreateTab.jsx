import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";

export default function CourseCreateTab({ enterprise, onCreated }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    type_course: "expedier",
    client_nom: "",
    client_telephone: "",
    adresse_depart: "",
    adresse_arrivee: "",
    prix_propose_admin: "",
    notes: "",
  });

  const handleChange = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);
    try {
      const payload = {
        source: "admin",
        country_code: enterprise?.country_code || "BF",
        type_course: form.type_course,
        client_nom: form.client_nom,
        client_telephone: form.client_telephone,
        adresse_depart: form.adresse_depart,
        adresse_arrivee: form.adresse_arrivee,
        prix_propose_admin: form.prix_propose_admin ? Number(form.prix_propose_admin) : undefined,
        notes: form.notes || undefined,
      };

      await base44.functions.invoke("creerCourseAdmin", payload);
      setSuccess(true);
      setForm({
        type_course: "expedier",
        client_nom: "",
        client_telephone: "",
        adresse_depart: "",
        adresse_arrivee: "",
        prix_propose_admin: "",
        notes: "",
      });
      onCreated?.();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err?.message || "Erreur lors de la création");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nouvelle course — {enterprise?.nom || "Agence"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Type de course</Label>
            <Select value={form.type_course} onValueChange={(v) => handleChange("type_course", v)}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="expedier">Expédier un colis</SelectItem>
                <SelectItem value="recevoir">Recevoir un colis</SelectItem>
                <SelectItem value="deplacement">Déplacement</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Nom du client *</Label>
            <Input value={form.client_nom} onChange={(e) => handleChange("client_nom", e.target.value)} placeholder="Nom" className="mt-1" required />
          </div>
          <div>
            <Label className="text-xs">Téléphone du client *</Label>
            <Input value={form.client_telephone} onChange={(e) => handleChange("client_telephone", e.target.value)} placeholder="+226 XX XX XX XX" className="mt-1" required />
          </div>
          <div>
            <Label className="text-xs">Point de récupération *</Label>
            <Input value={form.adresse_depart} onChange={(e) => handleChange("adresse_depart", e.target.value)} placeholder="Adresse de départ" className="mt-1" required />
          </div>
          <div>
            <Label className="text-xs">Destination *</Label>
            <Input value={form.adresse_arrivee} onChange={(e) => handleChange("adresse_arrivee", e.target.value)} placeholder="Adresse d'arrivée" className="mt-1" required />
          </div>
          <div>
            <Label className="text-xs">Prix proposé (FCFA)</Label>
            <Input type="number" value={form.prix_propose_admin} onChange={(e) => handleChange("prix_propose_admin", e.target.value)} placeholder="Laisser vide pour auto" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={form.notes} onChange={(e) => handleChange("notes", e.target.value)} placeholder="Instructions particulières" className="mt-1" />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {success && <p className="text-sm text-emerald-600">✓ Course créée avec succès</p>}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        {loading ? "Création..." : "Créer la course"}
      </Button>
      <p className="text-[10px] text-gray-400 text-center">
        L'agence sera automatiquement rattachée. Dispatch V2 prendra le relais.
      </p>
    </form>
  );
}