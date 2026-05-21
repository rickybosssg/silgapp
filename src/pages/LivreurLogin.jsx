import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Truck, Phone, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { setLivreurSession } from "@/lib/livreurAuth";

export default function LivreurLogin({ onLogin }) {
  const [telephone, setTelephone] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!telephone || !motDePasse) {
      toast.error("Remplissez tous les champs");
      return;
    }
    setLoading(true);
    try {
      // Rechercher le livreur par téléphone
      const livreurs = await base44.entities.Livreur.filter({ telephone: telephone.trim() });
      const livreur = livreurs[0];

      if (!livreur) {
        toast.error("Numéro de téléphone introuvable");
        setLoading(false);
        return;
      }

      if (livreur.actif === false) {
        toast.error("Votre compte est désactivé. Contactez l'administrateur.");
        setLoading(false);
        return;
      }

      if (livreur.validation !== "valide") {
        toast.error("Votre compte n'est pas encore validé.");
        setLoading(false);
        return;
      }

      if (livreur.mot_de_passe !== motDePasse) {
        toast.error("Mot de passe incorrect");
        setLoading(false);
        return;
      }

      // Connexion réussie
      setLivreurSession(livreur);
      // Mettre le statut disponible
      await base44.entities.Livreur.update(livreur.id, { statut: "disponible" });
      const updated = { ...livreur, statut: "disponible" };
      setLivreurSession(updated);
      onLogin(updated);
      toast.success(`Bienvenue ${livreur.prenom || livreur.nom} ! 👋`);
    } catch (err) {
      toast.error("Erreur de connexion. Réessayez.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-primary text-white py-8 px-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Truck className="w-8 h-8" />
          <span className="font-bold text-2xl">Silga Livraison</span>
        </div>
        <p className="text-sm opacity-80">Espace Livreur</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-lg">Connexion</CardTitle>
            <p className="text-sm text-muted-foreground">Entrez vos identifiants pour accéder à votre espace</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> Numéro de téléphone
                </Label>
                <Input
                  placeholder="+226 70 00 00 00"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  type="tel"
                  autoComplete="username"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> Mot de passe
                </Label>
                <div className="relative">
                  <Input
                    placeholder="Votre mot de passe"
                    value={motDePasse}
                    onChange={(e) => setMotDePasse(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 font-bold gap-2 bg-primary"
                disabled={loading}
              >
                <Truck className="w-4 h-4" />
                {loading ? "Connexion..." : "Se connecter"}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground mt-4">
              Problème de connexion ? Contactez votre administrateur Silga.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}