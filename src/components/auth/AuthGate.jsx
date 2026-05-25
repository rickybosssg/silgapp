import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Truck } from "lucide-react";

/**
 * AuthGate — routage post-connexion Base44
 * - admin (role === 'admin') → children (dashboard admin)
 * - livreur (email trouvé dans Livreur.user_email) → onLivreur(livreurProfil)
 * - sinon → "Compte non autorisé"
 *
 * Fix APK : après login, la page recharge avec ?access_token=xxx
 * On vérifie aussi localStorage directement pour ne pas manquer le token.
 */
export default function AuthGate({ children, onLivreur }) {
  const [state, setState] = useState("loading");

  const check = useCallback(async () => {
    // Vérifier d'abord si un token est présent dans localStorage
    // (cas APK : page rechargée avec ?access_token capturé dans main.jsx)
    const storedToken = localStorage.getItem('base44_access_token');
    const hasToken = storedToken && storedToken !== 'null' && storedToken !== 'undefined' && storedToken.length > 10;

    const isAuth = await base44.auth.isAuthenticated();

    if (!isAuth && !hasToken) {
      setState("unauthenticated");
      return;
    }

    // Si pas auth selon SDK mais token présent → recharger la page
    // pour que base44Client soit réinitialisé avec le nouveau token
    if (!isAuth && hasToken) {
      window.location.reload();
      return;
    }

    const user = await base44.auth.me();
    if (!user) {
      setState("unauthenticated");
      return;
    }

    if (user.role === "admin") {
      setState("admin");
      return;
    }

    // Livreur check
    const livreurs = await base44.entities.Livreur.filter({
      user_email: user.email,
      actif: true,
      validation: "valide"
    });

    if (livreurs && livreurs.length > 0) {
      onLivreur?.(livreurs[0]);
      setState("livreur");
      return;
    }

    setState("unauthorized");
  }, [onLivreur]);

  useEffect(() => {
    check();
  }, [check]);

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