import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Truck, Package, ArrowRight, Loader2, CheckCircle, Store } from "lucide-react";
import ClientOnboardingForm from "@/components/auth/ClientOnboardingForm";
import LivreurRegistrationForm from "@/components/auth/LivreurRegistrationForm";

export default function RoleSelection() {
  const [step, setStep] = useState("choix"); // choix | client_form | livreur_form | client_done | livreur_done
  const [user, setUser] = useState(null);

  // Charger les infos user au montage
  React.useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      // Anti-double-rôle : si silgapp_role déjà défini, AuthGate doit router → reload de sécurité
      if (u?.silgapp_role) {
        window.location.reload();
      }
    }).catch(() => {});
  }, []);

  const handleClientComplete = async () => {
    try {
      await base44.auth.updateMe({ silgapp_role: "client" });
    } catch (err) {
      console.error("Erreur enregistrement rôle client:", err);
    }
    setStep("client_done");
    setTimeout(() => window.location.reload(), 1500);
  };

  const handleLivreurComplete = async () => {
    try {
      await base44.auth.updateMe({ silgapp_role: "livreur" });
    } catch (err) {
      console.error("Erreur enregistrement rôle livreur:", err);
    }
    setStep("livreur_done");
    setTimeout(() => window.location.reload(), 2000);
  };

  const handlePartenaireChoice = async () => {
    try {
      await base44.auth.updateMe({ silgapp_role: "partenaire" });
    } catch (err) {
      console.error("Erreur enregistrement rôle partenaire:", err);
    }
    window.location.reload();
  };

  // Écran de choix
  if (step === "choix") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-3">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Truck className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-black text-foreground">Bienvenue sur SILGAPP</h1>
            <p className="text-muted-foreground">Comment souhaitez-vous utiliser l'application ?</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => setStep("client_form")}
              className="w-full p-6 rounded-3xl border-2 border-accent/20 bg-gradient-to-br from-accent/5 to-green-50 hover:border-accent hover:shadow-lg transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                  <Package className="w-7 h-7 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="font-black text-lg text-foreground">Client</p>
                  <p className="text-sm text-muted-foreground">Envoyer ou recevoir des colis</p>
                </div>
                <ArrowRight className="w-5 h-5 text-accent opacity-0 group-hover:opacity-100 transition-all" />
              </div>
            </button>

            <button
              onClick={() => setStep("livreur_form")}
              className="w-full p-6 rounded-3xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-red-50 hover:border-primary hover:shadow-lg transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Truck className="w-7 h-7 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-black text-lg text-foreground">Livreur</p>
                  <p className="text-sm text-muted-foreground">Livrer des colis et gagner de l'argent</p>
                </div>
                <ArrowRight className="w-5 h-5 text-primary opacity-0 group-hover:opacity-100 transition-all" />
              </div>
            </button>

            <button
              onClick={handlePartenaireChoice}
              className="w-full p-6 rounded-3xl border-2 border-purple-300/30 bg-gradient-to-br from-purple-50 to-violet-50 hover:border-purple-500 hover:shadow-lg transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                  <Store className="w-7 h-7 text-purple-600" />
                </div>
                <div className="flex-1">
                  <p className="font-black text-lg text-foreground">Partenaire</p>
                  <p className="text-sm text-muted-foreground">Boutique, Restaurant ou Pharmacie</p>
                </div>
                <ArrowRight className="w-5 h-5 text-purple-600 opacity-0 group-hover:opacity-100 transition-all" />
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Formulaire client
  if (step === "client_form") {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-lg mx-auto">
          <button onClick={() => setStep("choix")} className="text-sm text-muted-foreground hover:text-foreground mb-6">
            ← Retour
          </button>
          <ClientOnboardingForm user={user} onComplete={handleClientComplete} />
        </div>
      </div>
    );
  }

  // Formulaire livreur
  if (step === "livreur_form") {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-lg mx-auto">
          <button onClick={() => setStep("choix")} className="text-sm text-muted-foreground hover:text-foreground mb-6">
            ← Retour
          </button>
          <LivreurRegistrationForm user={user} onComplete={handleLivreurComplete} />
        </div>
      </div>
    );
  }

  // Confirmation client
  if (step === "client_done") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Compte client créé !</h2>
          <p className="text-sm text-muted-foreground">Redirection vers votre tableau de bord...</p>
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-accent" />
        </div>
      </div>
    );
  }

  // Confirmation livreur
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-secondary/20 flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-secondary" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Demande envoyée !</h2>
        <p className="text-sm text-muted-foreground">
          Votre demande de compte livreur a bien été reçue. Elle est en cours de vérification par l'administration SILGAPP. Vous serez informé dès validation de votre compte.
        </p>
        <p className="text-xs text-muted-foreground">📞 Support : +226 66 92 51 90</p>
        <Loader2 className="w-5 h-5 animate-spin mx-auto text-secondary" />
      </div>
    </div>
  );
}