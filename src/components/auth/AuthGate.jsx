import React, { useState, useEffect } from "react";
import { base44, detectedToken } from "@/api/base44Client";
import { Truck } from "lucide-react";

/**
 * AuthGate — routage post-connexion Base44
 * - admin → children (dashboard admin)
 * - livreur valide → onLivreur(profil)
 * - sinon → "Compte non autorisé"
 *
 * Fix APK Android :
 * - Le token est capturé dans index.html (script synchrone) avant tout module ES
 * - base44Client lit localStorage au moment de createClient()
 * - detectedToken permet de savoir si un token a été trouvé
 */
export default function AuthGate({ children, onLivreur }) {
  const [state, setState] = useState("loading");

  useEffect(() => {
    let mounted = true;

    async function check() {
      // Si le SDK n'a pas de token mais localStorage en a un → reload propre
      // (cas rare : module chargé avant le script inline d'index.html)
      if (!detectedToken) {
        const storedToken = localStorage.getItem('base44_access_token') || localStorage.getItem('access_token');
        if (storedToken && storedToken.length > 10) {
          // Recharger pour que base44Client soit recréé avec le token
          window.location.reload();
          return;
        }
      }

      const isAuth = await base44.auth.isAuthenticated();
      if (!mounted) return;

      if (!isAuth) {
        setState("unauthenticated");
        return;
      }

      const user = await base44.auth.me();
      if (!mounted) return;

      if (!user) {
        setState("unauthenticated");
        return;
      }

      if (user.role === "admin") {
        setState("admin");
        return;
      }

      const livreurs = await base44.entities.Livreur.filter({
        user_email: user.email,
        actif: true,
        validation: "valide"
      });
      if (!mounted) return;

      if (livreurs && livreurs.length > 0) {
        onLivreur?.(livreurs[0]);
        setState("livreur");
        return;
      }

      setState("unauthorized");
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

  return null;
}