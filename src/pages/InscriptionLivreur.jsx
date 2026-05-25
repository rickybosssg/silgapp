import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Truck, User, Phone, MapPin, Camera, CheckCircle2, Upload, Building } from "lucide-react";
import { toast } from "sonner";

const defaultForm = {
  prenom: "",
  nom: "",
  telephone: "",
  quartier: "",
  photo_url: "",
  vehicule: "moto",
  type_livreur: "externe",
  type_vehicule: "moto",
  numero_plaque: "",
  photo_cnib_recto_url: "",
  photo_cnib_verso_url: "",
  photo_moto_url: "",
};

export default function InscriptionLivreur() {
  const [form, setForm] = useState(defaultForm);
  const [done, setDone] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Livreur.create({ ...data, validation: "en_attente", statut: "hors_ligne", actif: true }),
    onSuccess: () => {
      toast.success("Candidature envoyée avec succès !");
      setDone(true);
    },
    onError: (error) => {
      toast.error(error.message || "Erreur lors de l'inscription. Réessayez.");
    },
  });

  const handlePhoto = async (e, fieldName) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(p => ({ ...p, [fieldName]: file_url }));
    } catch (err) {
      toast.error("Erreur lors de l'envoi du document");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validation stricte des champs obligatoires
    const errors = [];
    if (!form.prenom.trim()) errors.push("Le prénom est obligatoire");
    if (!form.nom.trim()) errors.push("Le nom est obligatoire");
    if (!form.telephone.trim()) errors.push("Le téléphone est obligatoire");
    if (!form.quartier.trim()) errors.push("Le quartier est obligatoire");
    
    if (errors.length > 0) {
      errors.forEach(err => toast.error(err));
      return;
    }
    
    // Création du livreur
    createMutation.mutate(form);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-sm w-full text-center p-8 space-y-4">
          <CheckCircle2 className="w-16 h-16 text-accent mx-auto" />
          <h2 className="text-xl font-bold">Inscription envoyée !</h2>
          <p className="text-sm text-muted-foreground">
            Votre demande est en cours de vérification par l'équipe Silga Livraison.<br /><br />
            Vous serez contacté par téléphone une fois votre compte validé.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
            ⏳ Validation sous 24h maximum
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-white py-6 px-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Truck className="w-6 h-6" />
          <span className="font-bold text-lg">Silga Livraison</span>
        </div>
        <p className="text-sm opacity-80">Rejoindre l'équipe de livreurs</p>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4 mt-2">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Identité */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-primary" /> Identité
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Prénom *</Label>
                  <Input
                    placeholder="Votre prénom"
                    value={form.prenom}
                    onChange={(e) => setForm(p => ({ ...p, prenom: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nom *</Label>
                  <Input
                    placeholder="Votre nom"
                    value={form.nom}
                    onChange={(e) => setForm(p => ({ ...p, nom: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Phone className="w-3 h-3" /> Téléphone *
                </Label>
                <Input
                  placeholder="+226 70 00 00 00"
                  value={form.telephone}
                  onChange={(e) => setForm(p => ({ ...p, telephone: e.target.value }))}
                  required
                  type="tel"
                />
              </div>
            </CardContent>
          </Card>

          {/* Localisation */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" /> Quartier de résidence
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Quartier principal *</Label>
                <Input
                  placeholder="Ex: Ouaga 2000, Pissy, Dassasgho..."
                  value={form.quartier}
                  onChange={(e) => setForm(p => ({ ...p, quartier: e.target.value }))}
                  required
                />
              </div>

            </CardContent>
          </Card>

          {/* Type de livreur */}
          {form.type_livreur === "externe" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Building className="w-4 h-4 text-primary" /> Documents requis (Externe)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Pour les livreurs externes, veuillez fournir les documents suivants :
                </p>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold">✓</div>
                    <span>Photo CNIB (recto/verso)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold">✓</div>
                    <span>Photo de la moto</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold">✓</div>
                    <span>Numéro de plaque (optionnel)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Photo profil */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary" /> Photo de profil
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                {form.photo_url ? (
                  <img src={form.photo_url} alt="Photo" className="w-16 h-16 rounded-full object-cover border-2 border-primary" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e, "photo_url")} />
                  <div className="flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors">
                    <Upload className="w-4 h-4" />
                    {uploadingPhoto ? "Envoi..." : form.photo_url ? "Changer" : "Ajouter"}
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Documents pour externes */}
          {form.type_livreur === "externe" && (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">CNIB (Recto)</CardTitle>
                </CardHeader>
                <CardContent>
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e, "photo_cnib_recto_url")} />
                    <div className="flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors">
                      <Upload className="w-4 h-4" />
                      {form.photo_cnib_recto_url ? "✓ Photo ajoutée" : "Télécharger recto CNIB"}
                    </div>
                  </label>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">CNIB (Verso)</CardTitle>
                </CardHeader>
                <CardContent>
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e, "photo_cnib_verso_url")} />
                    <div className="flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors">
                      <Upload className="w-4 h-4" />
                      {form.photo_cnib_verso_url ? "✓ Photo ajoutée" : "Télécharger verso CNIB"}
                    </div>
                  </label>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Photo de la moto</CardTitle>
                </CardHeader>
                <CardContent>
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e, "photo_moto_url")} />
                    <div className="flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors">
                      <Upload className="w-4 h-4" />
                      {form.photo_moto_url ? "✓ Photo ajoutée" : "Télécharger photo moto"}
                    </div>
                  </label>
                </CardContent>
              </Card>

              <div className="space-y-1.5">
                <Label className="text-xs">Numéro de plaque (optionnel)</Label>
                <Input
                  placeholder="Ex: AA 123 BB"
                  value={form.numero_plaque}
                  onChange={(e) => setForm(p => ({ ...p, numero_plaque: e.target.value }))}
                />
              </div>
            </>
          )}

          <Button
            type="submit"
            className="w-full h-12 text-base font-bold bg-primary gap-2"
            disabled={createMutation.isPending || uploadingPhoto}
          >
            <Truck className="w-5 h-5" />
            {createMutation.isPending ? "Envoi en cours..." : "Envoyer ma candidature"}
          </Button>

          <p className="text-center text-xs text-muted-foreground pb-4">
            En vous inscrivant, vous acceptez de respecter les règles de Silga Livraison.
          </p>
        </form>
      </div>
    </div>
  );
}