import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Truck, Package, ArrowRight, Loader2, CheckCircle, Store } from "lucide-react";
import ClientOnboarding from "@/components/client/ClientOnboarding";
import LivreurRegistrationForm from "@/components/auth/LivreurRegistrationForm";

export default function RoleSelection({ onPartenaire }) {
  const [step, setStep] = useState("choix");
  const [user, setUser] = useState(null);

  React.useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      if (u?.silgapp_role) {
        window.location.reload();
      }
    }).catch(() => {});
  }, []);

  const handleClientComplete = async () => {
    try {
      await base44.auth.updateMe({ silgapp_role: "client" });
    } catch (err) {
      console.error("Erreur enregistrement role client:", err);
    }
    setStep("client_done");
    setTimeout(() => window.location.reload(), 1500);
  };

  const handleLivreurComplete = async () => {
    try {
      await base44.auth.updateMe({ silgapp_role: "livreur" });
    } catch (err) {
      console.error("Erreur enregistrement role livreur:", err);
    }
    setStep("livreur_done");
    setTimeout(() => window.location.reload(), 2000);
  };

  const handlePartenaire = async () => {
    try {
      await base44.auth.updateMe({ silgapp_role: "partenaire" });
    } catch (err) {
      console.error("Erreur enregistrement role partenaire:", err);
    }
    onPartenaire?.();
    window.location.reload();
  };

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
            <RoleButton
              onClick={() => setStep("client_form")}
              icon={Package}
              title="Client"
              subtitle="Envoyer ou recevoir des colis"
              color="accent"
            />

            <RoleButton
              onClick={() => setStep("livreur_form")}
              icon={Truck}
              title="Livreur"
              subtitle="Livrer des colis et gagner de l'argent"
              color="primary"
            />

            <button
              onClick={handlePartenaire}
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

  if (step === "client_form") {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-lg mx-auto">
          <button onClick={() => setStep("choix")} className="text-sm text-muted-foreground hover:text-foreground mb-6">
            Retour
          </button>
          <ClientOnboarding clientProfil={null} onComplete={handleClientComplete} />
        </div>
      </div>
    );
  }

  if (step === "livreur_form") {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-lg mx-auto">
          <button onClick={() => setStep("choix")} className="text-sm text-muted-foreground hover:text-foreground mb-6">
            Retour
          </button>
          <LivreurRegistrationForm user={user} onComplete={handleLivreurComplete} />
        </div>
      </div>
    );
  }

  if (step === "client_done") {
    return (
      <DoneScreen
        tone="accent"
        title="Compte client cree !"
        message="Redirection vers votre tableau de bord..."
      />
    );
  }

  return (
    <DoneScreen
      tone="secondary"
      title="Demande envoyee !"
      message="Votre demande de compte livreur a bien ete recue. Elle est en cours de verification par l'administration SILGAPP. Vous serez informe des validation de votre compte."
      support="Support : +226 66 92 51 90"
    />
  );
}

function RoleButton({ onClick, icon: Icon, title, subtitle, color }) {
  const isAccent = color === "accent";
  return (
    <button
      onClick={onClick}
      className={`w-full p-6 rounded-3xl border-2 ${
        isAccent
          ? "border-accent/20 bg-gradient-to-br from-accent/5 to-green-50 hover:border-accent"
          : "border-primary/20 bg-gradient-to-br from-primary/5 to-red-50 hover:border-primary"
      } hover:shadow-lg transition-all text-left group`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-14 h-14 rounded-2xl ${isAccent ? "bg-accent/10 group-hover:bg-accent/20" : "bg-primary/10 group-hover:bg-primary/20"} flex items-center justify-center transition-colors`}>
          <Icon className={`w-7 h-7 ${isAccent ? "text-accent" : "text-primary"}`} />
        </div>
        <div className="flex-1">
          <p className="font-black text-lg text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <ArrowRight className={`w-5 h-5 ${isAccent ? "text-accent" : "text-primary"} opacity-0 group-hover:opacity-100 transition-all`} />
      </div>
    </button>
  );
}

function DoneScreen({ tone, title, message, support }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className={`w-16 h-16 rounded-2xl ${tone === "accent" ? "bg-accent/10" : "bg-secondary/20"} flex items-center justify-center mx-auto`}>
          <CheckCircle className={`w-8 h-8 ${tone === "accent" ? "text-accent" : "text-secondary"}`} />
        </div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
        {support && <p className="text-xs text-muted-foreground">{support}</p>}
        <Loader2 className={`w-5 h-5 animate-spin mx-auto ${tone === "accent" ? "text-accent" : "text-secondary"}`} />
      </div>
    </div>
  );
}
