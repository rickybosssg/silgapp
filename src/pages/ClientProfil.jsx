import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { User, Save, ArrowLeft, Phone } from "lucide-react";
import { toast } from "sonner";

// Même logique que les livreurs - formatage automatique tous les 2 chiffres
const handlePhoneFormatting = (raw) => {
  let formatted = raw;
  if (raw.startsWith("+226")) {
    const local = raw.slice(4).replace(/(\d{2})(?=\d)/g, "$1 ").trim();
    formatted = "+226 " + local;
  } else if (raw.startsWith("+")) {
    formatted = raw;
  } else {
    formatted = raw.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  return formatted;
};

// Nettoyer le numéro pour la base de données (sans espaces, seulement chiffres)
const cleanPhone = (value) => value.replace(/\D/g, '');

export default function ClientProfil({ onComplete, existingProfil }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nom: "",
    prenom: "",
    telephone: "",
  });
  const [phoneError, setPhoneError] = useState("");

  useEffect(() => {
    if (existingProfil) {
      setFormData({
        nom: existingProfil.nom || "",
        prenom: existingProfil.prenom || "",
        telephone: existingProfil.telephone || "",
      });
    }
  }, [existingProfil]);

  const validatePhone = (phone) => {
    const digits = cleanPhone(phone);
    // Accepter 8 chiffres (avec ou sans indicatif)
    if (digits.length < 8) {
      setPhoneError("Le numéro doit contenir au moins 8 chiffres");
      return false;
    }
    setPhoneError("");
    return true;
  };

  const handlePhoneChange = (e) => {
    const value = e.target.value;
    // Garder uniquement + et chiffres, puis formater
    const raw = value.replace(/[^\d+]/g, "");
    const formatted = handlePhoneFormatting(raw);
    setFormData({ ...formData, telephone: formatted });
    setPhoneError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.nom || !formData.prenom || !formData.telephone) {
      toast.error("Tous les champs sont obligatoires");
      return;
    }

    // Validation téléphone simplifiée
    validatePhone(formData.telephone);

    setLoading(true);

    try {
      const user = await base44.auth.me();
      const phoneClean = cleanPhone(formData.telephone);
      
      // Mettre à jour ou créer le profil client
      if (existingProfil) {
        await base44.entities.ClientExterne.update(existingProfil.id, {
          nom: formData.nom,
          prenom: formData.prenom,
          telephone: phoneClean,
        });
      } else {
        await base44.entities.ClientExterne.create({
          nom: formData.nom,
          prenom: formData.prenom,
          telephone: phoneClean,
          email: user.email,
          user_email: user.email,
          actif: true,
        });
      }
      
      toast.success("Profil enregistré avec succès");
      
      // Appeler onComplete pour revenir au dashboard
      if (onComplete) {
        onComplete();
      }
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
        {/* Header avec bouton retour */}
        <div className="flex items-center gap-3 mb-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onComplete}
            type="button"
          >
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
                placeholder="+226 70 00 00 00"
                value={formData.telephone}
                onChange={handlePhoneChange}
                disabled={loading}
                type="tel"
                required
              />
              {phoneError && (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <span>⚠️</span> {phoneError}
                </p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading || !formData.nom || !formData.prenom || !formData.telephone}
            >
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