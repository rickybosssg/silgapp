import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { User, Save, ArrowLeft, Phone } from "lucide-react";
import { toast } from "sonner";

// Formater le numéro de téléphone Burkina Faso
const formatPhone = (value) => {
  // Garder uniquement les chiffres
  const digits = value.replace(/\D/g, '').slice(0, 8);
  
  // Formater avec espaces
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  if (digits.length <= 6) return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6)}`;
};

// Nettoyer le numéro pour la base de données (sans espaces)
const cleanPhone = (value) => value.replace(/\D/g, '');

export default function ClientProfil({ onComplete, existingProfil }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nom: "",
    prenom: "",
    telephone: "",
  });
  const [phoneError, setPhoneError] = useState("");

  useEffect(() => {
    if (existingProfil) {
      const phoneFormatted = formatPhone(existingProfil.telephone || "");
      setFormData({
        nom: existingProfil.nom || "",
        prenom: existingProfil.prenom || "",
        telephone: phoneFormatted,
      });
    }
  }, [existingProfil]);

  const validatePhone = (phone) => {
    const digits = cleanPhone(phone);
    if (digits.length !== 8) {
      setPhoneError("Le numéro doit contenir 8 chiffres");
      return false;
    }
    if (!/^[67]/.test(digits)) {
      setPhoneError("Le numéro doit commencer par 6 ou 7");
      return false;
    }
    setPhoneError("");
    return true;
  };

  const handlePhoneChange = (e) => {
    const value = e.target.value;
    // Autoriser uniquement les chiffres et espaces
    if (value && !/[\d\s]/.test(value)) return;
    
    const formatted = formatPhone(value);
    setFormData({ ...formData, telephone: formatted });
    
    // Validation en temps réel (nettoie les espaces avant validation)
    const digits = cleanPhone(formatted);
    if (digits.length > 0 && digits.length < 8) {
      setPhoneError(""); // Pas d'erreur pendant la saisie
    } else if (digits.length === 8) {
      validatePhone(formatted);
    } else {
      setPhoneError("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.nom || !formData.prenom || !formData.telephone) {
      toast.error("Tous les champs sont obligatoires");
      return;
    }

    // Validation finale du téléphone
    if (!validatePhone(formData.telephone)) {
      toast.error("Numéro de téléphone invalide");
      return;
    }

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
        toast.success("Profil mis à jour !");
      } else {
        await base44.entities.ClientExterne.create({
          nom: formData.nom,
          prenom: formData.prenom,
          telephone: phoneClean,
          email: user.email,
          user_email: user.email,
          actif: true,
        });
        toast.success("Profil créé !");
      }
      
      // Retour au tableau de bord
      setTimeout(() => {
        navigate("/");
      }, 500);
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
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="telephone"
                  placeholder="66 66 66 66"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formData.telephone}
                  onChange={handlePhoneChange}
                  disabled={loading}
                  className={`pl-10 ${phoneError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                />
              </div>
              {phoneError && (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <span>⚠️</span> {phoneError}
                </p>
              )}
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