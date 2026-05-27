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
    user_email: "",
    quartier: "",
    photo_url: "",
    vehicule: "moto",
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
      queryClient.invalidateQueries({ queryKey: ["livreurs-externes"] });
      toast.success("Livreur créé avec succès ✅");
      setOpen(false);
      setForm({
        prenom: "",
        nom: "",
        telephone: "",
        user_email: "",
        quartier: "",
        photo_url: "",
        vehicule: "moto",
        type_livreur: reseau,
        reseau: reseau,
      });
    },
    onError: (err) => toast.error("Erreur : " + err.message),
  });

  const handlePhoto = async (e, fieldName) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Vérifier la taille du fichier (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La photo ne doit pas dépasser 5MB");
      e.target.value = "";
      return;
    }
    
    setUploading(true);
    try {
      // Lire le fichier comme ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Utiliser l'intégration Core.UploadFile avec le fichier brut
      const result = await base44.integrations.Core.UploadFile({ 
        file: arrayBuffer
      });
      
      if (result && result.file_url) {
        setForm(p => ({ ...p, [fieldName]: result.file_url }));
        toast.success("Photo ajoutée ✅");
      } else {
        throw new Error("Résultat d'upload invalide");
      }
    } catch (err) {
      console.error("Erreur upload photo:", err);
      toast.error("Erreur upload: " + (err.message || "échec"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validation stricte
    const errors = [];
    if (!form.nom?.trim()) errors.push("Le nom est obligatoire");
    if (!form.telephone?.trim()) errors.push("Le téléphone est obligatoire");
    if (!form.user_email?.trim()) errors.push("L'email du compte livreur est obligatoire");
    
    if (errors.length > 0) {
      errors.forEach(err => toast.error(err));
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

          <div className="space-y-1.5">
            <Label className="text-xs">Email du compte livreur *</Label>
            <Input
              type="email"
              value={form.user_email}
              onChange={(e) => setForm(p => ({ ...p, user_email: e.target.value.trim().toLowerCase() }))}
              placeholder="livreur@gmail.com"
            />
            <p className="text-[10px] text-muted-foreground">Cet email sera utilisé pour la connexion</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Téléphone *</Label>
              <Input
                value={form.telephone}
                onChange={(e) => setForm(p => ({ ...p, telephone: e.target.value }))}
                placeholder="+226 70 00 00 00"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quartier</Label>
              <Input
                value={form.quartier}
                onChange={(e) => setForm(p => ({ ...p, quartier: e.target.value }))}
                placeholder="Ex: Ouaga 2000"
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



          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" className="bg-primary" disabled={createMutation.isPending || uploading}>
              {createMutation.isPending ? "Création en cours..." : `Créer le livreur ${reseau === "externe" ? "externe" : ""}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}