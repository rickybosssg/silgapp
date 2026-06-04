import React, { useState, useEffect } from "react";
import { base44, detectedToken, reinitClientWithStoredToken } from "@/api/base44Client";
import { APP_PUBLIC_URL } from "@/lib/app-params";
import { Truck } from "lucide-react";
import AppMaintenanceGate from "@/components/admin/AppMaintenanceGate";

// Ouvre le login — sur Capacitor, utilise le navigateur système pour éviter
// que la WebView principale reçoive le redirect et casse le localStorage local
const openLogin = async () => {
  const isCapacitor = !!(window.Capacitor?.isNativePlatform?.());
  if (isCapacitor) {
    try {
      const { Browser } = await import('@capacitor/browser');
      // Construire l'URL de login avec la redirect_uri correcte
      const loginUrl = `https://app.base44.com/login?app_id=${import.meta.env.VITE_BASE44_APP_ID || '6a0ec08f3af5e1d1284254c1'}&redirect_uri=${encodeURIComponent(APP_PUBLIC_URL)}`;
      console.log('[AuthGate] Ouverture login Capacitor Browser:', loginUrl);
      await Browser.open({ url: loginUrl, windowName: '_blank' });
      return;
    } catch (e) {
      console.warn('[AuthGate] Capacitor Browser indisponible, fallback:', e);
    }
  }
  // Web standard
  base44.auth.redirectToLogin();
};

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
      // Si le SDK n'a pas de token mais localStorage en a un →
      // réinitialiser le client SANS reload (évite la boucle APK Android)
      if (!detectedToken) {
        const freshToken = reinitClientWithStoredToken();
        if (!freshToken) {
          // Vraiment pas de token nulle part → login
          setState("unauthenticated");
          return;
        }
        console.log('[AuthGate] Token récupéré depuis localStorage sans reload');
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

      // 2. Livreur interne ou externe (chercher par email SANS filtrer sur validation/actif)
      // D'abord par user_email, sinon par email (cas livreurs internes sans user_email renseigné)
      let livreurs = await base44.entities.Livreur.filter({ user_email: user.email });
      if (!mounted) return;

      // Fallback : chercher aussi par champ email si user_email vide
      if (!livreurs || livreurs.length === 0) {
        try {
          const byEmail = await base44.entities.Livreur.filter({ email: user.email });
          if (byEmail && byEmail.length > 0) livreurs = byEmail;
        } catch (_) {}
      }
      if (!mounted) return;

      if (livreurs && livreurs.length > 0) {
        const livreur = livreurs[0];

        // Corriger silencieusement le user_email manquant pour les futures connexions
        if (!livreur.user_email) {
          base44.entities.Livreur.update(livreur.id, { user_email: user.email }).catch(() => {});
        }

        // Compte désactivé par l'admin
        if (livreur.actif === false) {
          setState("livreur_bloque");
          return;
        }

        // Compte en attente de validation
        if (livreur.validation === "en_attente") {
          setState("livreur_en_attente");
          return;
        }

        // Compte refusé
        if (livreur.validation === "refuse") {
          setState("livreur_refuse");
          return;
        }

        // Compte valide → router vers l'app livreur
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

      // ⚠️ Sécurité finale : si un profil Livreur existe sans user_email,
      // il aurait dû être capturé plus haut. Log de diagnostic.
      console.warn(`[AuthGate] Utilisateur ${user.email} routé en CLIENT. Si c'est un livreur, vérifier que son user_email est bien renseigné dans l'entité Livreur.`);
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
    openLogin();
    return null;
  }

  if (state === "livreur_en_attente") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-secondary/20 flex items-center justify-center mx-auto">
            <Truck className="w-8 h-8 text-secondary" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Compte en attente</h2>
          <p className="text-sm text-muted-foreground">
            Votre compte livreur est en cours de vérification par l'équipe SILGAPP.
            Vous serez notifié dès que votre compte sera validé.
          </p>
          <p className="text-xs text-muted-foreground">📞 Support : +226 66 92 51 90</p>
          <button
            onClick={() => base44.auth.logout()}
            className="text-xs text-primary underline"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  if (state === "livreur_refuse") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
            <Truck className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Compte refusé</h2>
          <p className="text-sm text-muted-foreground">
            Votre demande d'inscription a été refusée. Contactez le support SILGAPP pour plus d'informations.
          </p>
          <p className="text-xs text-muted-foreground">📞 Support : +226 66 92 51 90</p>
          <button
            onClick={() => base44.auth.logout()}
            className="text-xs text-primary underline"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  if (state === "livreur_bloque") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
            <Truck className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Compte désactivé</h2>
          <p className="text-sm text-muted-foreground">
            Votre compte livreur a été désactivé. Contactez le support SILGAPP.
          </p>
          <p className="text-xs text-muted-foreground">📞 Support : +226 66 92 51 90</p>
          <button
            onClick={() => base44.auth.logout()}
            className="text-xs text-primary underline"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  // Admin → toujours accessible, pas de gate maintenance
  if (state === "admin") {
    return <>{children}</>;
  }

  // Client → bloqué si app OFF
  if (state === "client") {
    return <AppMaintenanceGate>{children}</AppMaintenanceGate>;
  }

  // Livreur → rendu géré par App.jsx via onLivreur (le gate est dans LivreurApp/LivreurExterneApp)
  return null;
}