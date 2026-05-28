import React, { useState, useEffect } from "react";
import { base44, detectedToken } from "@/api/base44Client";
import { Truck } from "lucide-react";

/**
 * AuthGate — routage post-connexion Base44
 * - admin → children (dashboard admin avec choix Interne/Externe)
 * - livreur interne → onLivreur(profil)
 * - livreur externe → onLivreur(profil + component Externe)
 * - inconnu → client (onClient() + dashboard client)
 *
 * Fix APK Android :
 * - Le token est capturé dans index.html (script synchrone) avant tout module ES
 * - base44Client lit localStorage au moment de createClient()
 * - detectedToken permet de savoir si un token a été trouvé
 */
export default function AuthGate({ children, onLivreur, onClient }) {
  const [state, setState] = useState("loading");
  const [userType, setUserType] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function check() {
      // Si le SDK n'a pas de token mais localStorage en a un → reload propre
      if (!detectedToken) {
        const storedToken = localStorage.getItem('base44_access_token') || localStorage.getItem('access_token');
        if (storedToken && storedToken.length > 10) {
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

      // 1. Admin → dashboard admin
      if (user.role === "admin") {
        setState("admin");
        return;
      }

      // 2. Livreur interne ou externe
      const livreurs = await base44.entities.Livreur.filter({
        user_email: user.email,
        actif: true,
        validation: "valide"
      });
      if (!mounted) return;

      if (livreurs && livreurs.length > 0) {
        const livreur = livreurs[0];
        // Passer le profil tel quel — App.jsx gère le bon composant via lazy import
        onLivreur?.(livreur);
        if (!mounted) return;
        setState("livreur");
        return;
      }

      // 3. Inconnu → Client automatique
      // Vérifier si profil client existe, sinon le créer
      const clients = await base44.entities.ClientExterne.filter({
        user_email: user.email
      });
      
      if (!mounted) return;

      if (!clients || clients.length === 0) {
        // Créer profil client automatiquement
        try {
          await base44.entities.ClientExterne.create({
            nom: user.full_name || user.email.split('@')[0],
            telephone: "",
            email: user.email,
            user_email: user.email,
            actif: true
          });
        } catch (err) {
          console.error("Erreur création profil client:", err);
        }
      }

      // Router vers dashboard client
      setState("client");
      onClient?.();
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

  // Admin → afficher children (SelectionReseau)
  if (state === "admin") {
    return <>{children}</>;
  }

  // Client → afficher children avec isClient=true
  if (state === "client") {
    return <>{children}</>;
  }

  // Livreur → rendu géré par App.jsx via onLivreur
  return null;
}