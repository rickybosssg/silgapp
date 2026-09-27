import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus, Mail, Phone, MapPin, Bike, Hash } from "lucide-react";
import LivreurPhotoUploader from "./LivreurPhotoUploader.jsx";

const VEHICULES = [
  { value: "moto", label: "Moto" },
  { value: "velo", label: "Vélo" },
  { value: "voiture", label: "Voiture" },
  { value: "a_pied", label: "À pied" },
];

export default function CreateLivreurEnterpriseModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    photo_url: "",
    nom: "",
    prenom: "",
    telephone: "",
    email: "",
    adresse: "",
    ville: "",
    quartier: "",
    vehicule: "moto",
    numero_plaque: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError("");
    setSuccess("");

    // Validation
    if (!form.nom?.trim()) return setError("Le nom est obligatoire");
    if (!form.telephone?.trim()) return setError("Le téléphone est obligatoire");
    if (!form.email?.trim()) return setError("L'email est obligatoire");
    if (!form.email.includes("@")) return setError("Email invalide");

    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("manageDriverInvitation", {
        action: "create_driver_fiche",
        nom: form.nom.trim(),
        prenom: form.prenom.trim(),
        telephone: form.telephone.trim(),
        email: form.email.trim(),
        adresse: form.adresse.trim(),
        ville: form.ville.trim(),
        quartier: form.quartier.trim(),
        vehicule: form.vehicule,
        numero_plaque: form.numero_plaque.trim(),
        photo_url: form.photo_url,
      });

      if (res?.idempotent) {
        setSuccess("Ce livreur est déjà enregistré pour cette agence.");
      } else {
        setSuccess("Fiche créée ! Une invitation email a été envoyée au livreur.");
        setForm({
          photo_url: "",
          nom: "",
          prenom: "",
          telephone: "",
          email: "",
          adresse: "",
          ville: "",
          quartier: "",
          vehicule: "moto",
          numero_plaque: "",
        });
      }
      onCreated?.();
    } catch (err) {
      setError(err?.message || "Erreur lors de la création");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setError("");
      setSuccess("");
      onClose?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-600" />
            Nouveau livreur
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="space-y-3 py-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <UserPlus className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="text-sm text-gray-900 font-medium">{success}</p>
            </div>
            <Button onClick={handleClose} className="w-full" size="sm">
              Fermer
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Photo */}
            <div>
              <Label className="text-xs text-gray-600">Photo du livreur</Label>
              <div className="mt-1">
                <LivreurPhotoUploader
                  value={form.photo_url}
                  onChange={(url) => update("photo_url", url)}
                />
              </div>
            </div>

            {/* Nom + Prénom */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-gray-600">Nom *</Label>
                <Input
                  value={form.nom}
                  onChange={(e) => update("nom", e.target.value)}
                  placeholder="Doe"
                  className="mt-1 h-9 text-sm"
                  required
                />
              </div>
              <div>
                <Label className="text-xs text-gray-600">Prénom</Label>
                <Input
                  value={form.prenom}
                  onChange={(e) => update("prenom", e.target.value)}
                  placeholder="Jean"
                  className="mt-1 h-9 text-sm"
                />
              </div>
            </div>

            {/* Téléphone */}
            <div>
              <Label className="text-xs text-gray-600">Téléphone *</Label>
              <div className="relative mt-1">
                <Phone className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={form.telephone}
                  onChange={(e) => update("telephone", e.target.value)}
                  placeholder="+226 XX XX XX XX"
                  className="h-9 text-sm pl-8"
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <Label className="text-xs text-gray-600">Email *</Label>
              <div className="relative mt-1">
                <Mail className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="jean.doe@email.com"
                  className="h-9 text-sm pl-8"
                  required
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">
                L'email servira d'identité pour l'activation du compte. Normalisé automatiquement.
              </p>
            </div>

            {/* Adresse + Ville */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-gray-600">Quartier</Label>
                <div className="relative mt-1">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <Input
                    value={form.quartier}
                    onChange={(e) => update("quartier", e.target.value)}
                    placeholder="Quartier"
                    className="h-9 text-sm pl-8"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-600">Ville</Label>
                <Input
                  value={form.ville}
                  onChange={(e) => update("ville", e.target.value)}
                  placeholder="Ouagadougou"
                  className="mt-1 h-9 text-sm"
                />
              </div>
            </div>

            {/* Véhicule + Plaque */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-gray-600">Véhicule</Label>
                <div className="relative mt-1">
                  <Bike className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <select
                    value={form.vehicule}
                    onChange={(e) => update("vehicule", e.target.value)}
                    className="w-full h-9 text-sm pl-8 pr-2 rounded-md border border-input bg-transparent"
                  >
                    {VEHICULES.map((v) => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-600">Immatriculation</Label>
                <div className="relative mt-1">
                  <Hash className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <Input
                    value={form.numero_plaque}
                    onChange={(e) => update("numero_plaque", e.target.value)}
                    placeholder="Optionnel"
                    className="h-9 text-sm pl-8"
                  />
                </div>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2">{error}</p>
            )}

            <div className="pt-2 border-t">
              <Button type="submit" disabled={submitting} className="w-full" size="sm">
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Création...</>
                ) : (
                  <><UserPlus className="w-4 h-4" /> Créer la fiche</>
                )}
              </Button>
            </div>

            <p className="text-[10px] text-gray-400 text-center">
              Aucun mot de passe. Le livreur recevra une invitation email et créera son compte lui-même.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}