import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Upload, User, Camera, Building } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function CreateLivreurDialog({ reseau = "interne" }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    prenom: "",
    nom: "",
    telephone: "",
    quartier: "",
    photo_url: "",
    vehicule: "moto",
    type_vehicule: "moto",
    numero_plaque: "",
    photo_cnib_recto_url: "",
    photo_cnib_verso_url: "",
    photo_moto_url: "",
    type_livreur: reseau,
    reseau: reseau,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const code = `LIV-${Date.now()}`;
      await base44.functions.invoke("createLivreur", {
        ...form,
        code_identification: code,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["livreurs"] });
      toast.success("Livreur créé avec succès");
      setOpen(false);
      setForm({
        prenom: "",
        nom: "",
        telephone: "",
        quartier: "",
        photo_url: "",
        vehicule: "moto",
        type_vehicule: "moto",
        numero_plaque: "",
        photo_cnib_recto_url: "",
        photo_cnib_verso_url: "",
        photo_moto_url: "",
        type_livreur: reseau,
        reseau: reseau,
      });
    },
    onError: (err) => toast.error("Erreur : " + err.message),
  });

  const handlePhoto = async (e, fieldName) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(p => ({ ...p, [fieldName]: file_url }));
    } catch (err) {
      toast.error("Erreur upload");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nom || !form.telephone) {
      toast.error("Nom et téléphone requis");
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5">
          <Plus className="w-4 h-4" />
          Créer un livreur
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Créer un nouveau livreur {reseau === "externe" ? "externe" : "interne"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Type de livreur */}
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <Label className="text-xs">Type de livreur</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`p-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                      form.type_livreur === "interne"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                    onClick={() => setForm(p => ({ ...p, type_livreur: "interne", reseau: "interne" }))}
                  >
                    🏢 Interne
                  </button>
                  <button
                    type="button"
                    className={`p-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                      form.type_livreur === "externe"
                        ? "border-accent bg-accent/5 text-accent"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                    onClick={() => setForm(p => ({ ...p, type_livreur: "externe", reseau: "externe" }))}
                  >
                    🤝 Externe
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Infos de base */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Prénom *</Label>
              <Input
                value={form.prenom}
                onChange={(e) => setForm(p => ({ ...p, prenom: e.target.value }))}
                placeholder="Prénom"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nom *</Label>
              <Input
                value={form.nom}
                onChange={(e) => setForm(p => ({ ...p, nom: e.target.value }))}
                placeholder="Nom"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Téléphone *</Label>
              <Input
                value={form.telephone}
                onChange={(e) => setForm(p => ({ ...p, telephone: e.target.value }))}
                placeholder="01 23 45 67 89"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quartier</Label>
              <Input
                value={form.quartier}
                onChange={(e) => setForm(p => ({ ...p, quartier: e.target.value }))}
                placeholder="Quartier"
              />
            </div>
          </div>

          {/* Photo profil */}
          <Card>
            <CardContent className="pt-4">
              <Label className="text-xs mb-2 block">Photo de profil</Label>
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
                    {uploading ? "Envoi..." : form.photo_url ? "Changer" : "Ajouter"}
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Documents pour externes */}
          {form.type_livreur === "externe" && (
            <>
              <Card>
                <CardContent className="pt-4">
                  <Label className="text-xs mb-2 block">CNIB (Recto)</Label>
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e, "photo_cnib_recto_url")} />
                    <div className="flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors">
                      <Upload className="w-4 h-4" />
                      {form.photo_cnib_recto_url ? "✓ Ajoutée" : "Télécharger"}
                    </div>
                  </label>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <Label className="text-xs mb-2 block">CNIB (Verso)</Label>
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e, "photo_cnib_verso_url")} />
                    <div className="flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors">
                      <Upload className="w-4 h-4" />
                      {form.photo_cnib_verso_url ? "✓ Ajoutée" : "Télécharger"}
                    </div>
                  </label>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <Label className="text-xs mb-2 block">Photo de la moto</Label>
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e, "photo_moto_url")} />
                    <div className="flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors">
                      <Upload className="w-4 h-4" />
                      {form.photo_moto_url ? "✓ Ajoutée" : "Télécharger"}
                    </div>
                  </label>
                </CardContent>
              </Card>

              <div className="space-y-1.5">
                <Label className="text-xs">Numéro de plaque (optionnel)</Label>
                <Input
                  placeholder="AA 123 BB"
                  value={form.numero_plaque}
                  onChange={(e) => setForm(p => ({ ...p, numero_plaque: e.target.value }))}
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={createMutation.isPending || uploading}>
              {createMutation.isPending ? "Création..." : "Créer le livreur"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}