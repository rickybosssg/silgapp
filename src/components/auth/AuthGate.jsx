import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Truck } from "lucide-react";

/**
 * AuthGate — routage post-connexion Base44
 * - admin (role === 'admin') → children (dashboard admin)
 * - livreur (email trouvé dans Livreur.user_email) → onLivreur(livreurProfil)
 * - sinon → "Compte non autorisé"
 */
export default function AuthGate({ children, onLivreur }) {
  const [state, setState] = useState("loading"); // loading | admin | livreur | unauthorized | unauthenticated
  const [livreurProfil, setLivreurProfil] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function check() {
      const isAuth = await base44.auth.isAuthenticated();
      if (!isAuth) {
        if (mounted) setState("unauthenticated");
        return;
      }
      const user = await base44.auth.me();
      if (!user) {
        if (mounted) setState("unauthenticated");
        return;
      }

      // Admin check
      if (user.role === "admin") {
        if (mounted) setState("admin");
        return;
      }

      // Livreur check — cherche l'email dans les profils livreurs
      const livreurs = await base44.entities.Livreur.filter({ user_email: user.email, actif: true, validation: "valide" });
      if (livreurs && livreurs.length > 0) {
        if (mounted) {
          setLivreurProfil(livreurs[0]);
          setState("livreur");
          onLivreur?.(livreurs[0]);
        }
        return;
      }

      if (mounted) setState("unauthorized");
    }
    check();
    return () => { mounted = false; };
  }, []);

  if (state === "loading") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Truck className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <p className="text-sm text-muted-foreground">Vérification du compte...</p>
        </div>
      </div>
    );
  }

  if (state === "unauthenticated") {
    base44.auth.redirectToLogin();
    return null;
  }

  if (state === "unauthorized") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto text-3xl">
            🚫
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">Compte non autorisé</p>
            <p className="text-sm text-muted-foreground mt-2">
              Votre compte n'est pas associé à un profil livreur valide ni à un accès admin.
              Contactez l'administrateur Silga Livraison.
            </p>
          </div>
          <button
            onClick={() => base44.auth.logout()}
            className="px-6 py-2 rounded-xl bg-primary text-white text-sm font-semibold"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  if (state === "admin") {
    return <>{children}</>;
  }

  // livreur → rendu géré par App.jsx via onLivreur callback
  return null;
}