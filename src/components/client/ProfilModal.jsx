import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Phone, Save, X } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

export default function ProfilModal({ open, onClose, existingProfil, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nom: existingProfil?.nom || "",
    prenom: existingProfil?.prenom || "",
    telephone: existingProfil?.telephone || "",
  });

  const handleSubmit = async () => {
    // Validation simple
    if (!formData.nom.trim() || !formData.prenom.trim() || !formData.telephone.trim()) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    const phoneDigits = formData.telephone.replace(/\D/g, "");
    if (phoneDigits.length < 8) {
      toast.error("Numéro de téléphone invalide");
      return;
    }

    setLoading(true);

    try {
      const phoneNormalized = phoneDigits.startsWith("226") 
        ? "+" + phoneDigits 
        : "+226" + phoneDigits;

      const data = {
        nom: formData.nom.trim(),
        prenom: formData.prenom.trim(),
        telephone: phoneNormalized,
      };

      if (existingProfil && existingProfil.id) {
        // Mise à jour
        await base44.entities.ClientExterne.update(existingProfil.id, data);
        toast.success("Profil mis à jour");
      } else {
        // Création
        await base44.entities.ClientExterne.create(data);
        toast.success("Profil enregistré");
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Erreur sauvegarde profil:", err);
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    // Remplir avec des valeurs par défaut pour débloquer
    setFormData({
      nom: "Client",
      prenom: "Silga",
      telephone: "+22600000000",
    });
    toast.success("Profil temporaire créé - vous pourrez le modifier plus tard");
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Vos informations
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="nom">Nom</Label>
            <Input
              id="nom"
              placeholder="Votre nom"
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prenom">Prénom</Label>
            <Input
              id="prenom"
              placeholder="Votre prénom"
              value={formData.prenom}
              onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="telephone">Téléphone</Label>
            <Input
              id="telephone"
              placeholder="Ex: 00000000"
              value={formData.telephone}
              onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
              disabled={loading}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={handleSkip}
              className="flex-1"
              disabled={loading}
            >
              <X className="w-4 h-4 mr-2" />
              Plus tard
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1 bg-primary hover:bg-primary/90"
              disabled={loading}
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}