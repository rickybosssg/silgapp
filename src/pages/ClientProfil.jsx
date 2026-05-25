import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { User, Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function ClientProfil({ onComplete, existingProfil }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nom: "",
    prenom: "",
    telephone: "",
  });

  useEffect(() => {
    if (existingProfil) {
      setFormData({
        nom: existingProfil.nom || "",
        prenom: existingProfil.prenom || "",
        telephone: existingProfil.telephone || "",
      });
    }
  }, [existingProfil]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.nom || !formData.prenom || !formData.telephone) {
      toast.error("Tous les champs sont obligatoires");
      return;
    }

    setLoading(true);

    try {
      const user = await base44.auth.me();
      
      // Mettre à jour ou créer le profil client
      if (existingProfil) {
        await base44.entities.ClientExterne.update(existingProfil.id, {
          nom: formData.nom,
          prenom: formData.prenom,
          telephone: formData.telephone,
        });
        toast.success("Profil mis à jour !");
      } else {
        await base44.entities.ClientExterne.create({
          nom: formData.nom,
          prenom: formData.prenom,
          telephone: formData.telephone,
          email: user.email,
          user_email: user.email,
          actif: true,
        });
        toast.success("Profil créé !");
      }
      
      onComplete?.();
    } catch (err) {
      console.error("Erreur sauvegarde profil:", err);
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Mon Profil</h1>
            <p className="text-xs text-muted-foreground">Informations personnelles</p>
          </div>
        </div>

        {/* Formulaire */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Vos informations</p>
              <p className="text-xs text-muted-foreground">
                {existingProfil ? "Modifiez votre profil" : "Complétez votre profil"}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
              <Label htmlFor="telephone">Numéro de téléphone</Label>
              <Input
                id="telephone"
                placeholder="Ex: +226 70 00 00 00"
                type="tel"
                value={formData.telephone}
                onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              <Save className="w-4 h-4 mr-2" />
              {loading ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </form>
        </Card>

        {!existingProfil && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-xs text-amber-700 font-semibold">
              ℹ️ Ces informations seront sauvegardées et pré-remplies pour vos prochaines courses.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}