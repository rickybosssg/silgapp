import React, { useState, useEffect } from "react";
import { base44, detectedToken } from "@/api/base44Client";
import { APP_PUBLIC_URL, BASE44_APP_ID } from "@/lib/app-params";
import { Loader2, Lock, Mail, Truck } from "lucide-react";
import AppMaintenanceGate from "@/components/admin/AppMaintenanceGate";
import { registerPushToken } from "@/lib/notifications";
import RoleSelection from "@/pages/RoleSelection";

const AUTH_TOKEN_KEYS = ["base44_access_token", "access_token", "base44_token", "token"];

const getBase44AppId = () => {
  try {
    const stored = localStorage.getItem("base44_app_id");
    if (stored && stored !== "null" && stored.length > 5) return stored;
  } catch (_) {}
  return import.meta.env.VITE_BASE44_APP_ID || BASE44_APP_ID;
};

const saveAuthToken = (token) => {
  if (!token || token.length < 10) return false;
  AUTH_TOKEN_KEYS.forEach((key) => {
    try {
      localStorage.setItem(key, token);
    } catch (_) {}
  });
  base44.setToken?.(token);
  return true;
};

async function loginWithEmailPassword(email, password) {
  const appId = getBase44AppId();
  const response = await fetch(`${APP_PUBLIC_URL}/api/apps/${appId}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Id": appId,
    },
    body: JSON.stringify({ email, password }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {}

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      "Identifiants incorrects ou connexion indisponible.";
    throw new Error(message);
  }

  const token = payload?.access_token;
  if (!saveAuthToken(token)) {
    throw new Error("Connexion acceptee, mais le token de session est absent.");
  }

  return payload;
}

async function registerWithEmailPassword(email, password) {
  const appId = getBase44AppId();
  const response = await fetch(`${APP_PUBLIC_URL}/api/apps/${appId}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Id": appId,
    },
    body: JSON.stringify({ email, password }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {}

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      "Creation du compte impossible pour le moment.";
    throw new Error(message);
  }

  return payload;
}

async function verifyEmailOtp(email, otpCode) {
  const appId = getBase44AppId();
  const response = await fetch(`${APP_PUBLIC_URL}/api/apps/${appId}/auth/verify-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Id": appId,
    },
    body: JSON.stringify({ email, otp_code: otpCode }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {}

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      "Code de verification invalide ou expire.";
    throw new Error(message);
  }

  return payload;
}

async function resendEmailOtp(email) {
  const appId = getBase44AppId();
  const response = await fetch(`${APP_PUBLIC_URL}/api/apps/${appId}/auth/resend-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Id": appId,
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {}

    throw new Error(payload?.message || payload?.error || "Impossible de renvoyer le code.");
  }
}

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
  const [authRetry, setAuthRetry] = useState(0);
  const [authMode, setAuthMode] = useState("login");
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    otpCode: "",
  });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginInfo, setLoginInfo] = useState("");

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
        registerPushToken(null, {
          email: user.email,
          role: "admin",
          user_type: "admin",
        }).catch(() => null);
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
        // L'obligation GPS est gérée par LivreurExterneOnboarding (écran GPS obligatoire)
        registerPushToken(livreur.id, {
          email: user.email,
          user_email: user.email,
          user_type: "livreur",
          livreur_id: livreur.id,
        }).catch(() => null);
        onLivreur?.(livreur);
        if (!mounted) return;
        setState("livreur");
        return;
      }

      // 3. Vérifier si un profil client existe déjà
      const clients = await base44.entities.ClientExterne.filter({
        user_email: user.email
      });
      
      if (!mounted) return;

      // Si un profil client existe → router vers dashboard client
      if (clients && clients.length > 0) {
        const clientProfil = clients[0];
        registerPushToken(null, {
          email: user.email,
          user_email: user.email,
          user_type: "client",
          client_id: clientProfil?.id || "",
        }).catch(() => null);
        setState("client");
        onClient?.();
        return;
      }

      // 4. Aucun profil → choix du rôle (Client ou Livreur)
      setState("choix_role");
    }

    check().catch((error) => {
      console.error("[AuthGate] Echec verification auth:", error);
      if (mounted) setState("unauthenticated");
    });
    return () => { mounted = false; };
  }, [authRetry]);

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    setLoginError("");
    setLoginInfo("");
    setLoginLoading(true);

    try {
      const email = loginForm.email.trim();

      if (authMode === "register") {
        if (loginForm.password.length < 6) {
          throw new Error("Le mot de passe doit contenir au moins 6 caracteres.");
        }
        if (loginForm.password !== loginForm.confirmPassword) {
          throw new Error("Les mots de passe ne correspondent pas.");
        }

        await registerWithEmailPassword(email, loginForm.password);
        try {
          await loginWithEmailPassword(email, loginForm.password);
        } catch (_) {
          setAuthMode("verify");
          setLoginInfo("Compte cree. Entrez le code recu par email pour confirmer votre compte.");
          return;
        }
      } else if (authMode === "verify") {
        await verifyEmailOtp(email, loginForm.otpCode.trim());
        await loginWithEmailPassword(email, loginForm.password);
      } else {
        await loginWithEmailPassword(email, loginForm.password);
      }

      setState("loading");
      setAuthRetry((value) => value + 1);
    } catch (error) {
      console.error("[AuthGate] Echec login email:", error);
      setLoginError(error?.message || "Connexion impossible. Reessayez.");
    } finally {
      setLoginLoading(false);
    }
  };

  const switchAuthMode = (mode) => {
    setAuthMode(mode);
    setLoginError("");
    setLoginInfo("");
  };

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
    return (
      <div className="silgapp-auth-screen min-h-screen bg-background px-5 py-8 flex items-center justify-center">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Truck className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {authMode === "register" ? "Creer un compte" : authMode === "verify" ? "Verifier le compte" : "Connexion SILGAPP"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {authMode === "register"
                  ? "Inscrivez-vous pour acceder a SILGAPP."
                  : authMode === "verify"
                    ? "Confirmez le code envoye par email."
                    : "Connectez-vous pour acceder a votre espace."}
              </p>
            </div>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <label className="block">
              <span className="sr-only">Email</span>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={loginForm.email}
                  onChange={(event) => setLoginForm((form) => ({ ...form, email: event.target.value }))}
                  className="w-full h-12 rounded-lg border border-zinc-700 bg-[#0f0f0f] pl-10 pr-3 text-sm text-white caret-white placeholder:text-zinc-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/40"
                  placeholder="Email"
                />
              </div>
            </label>

            <label className="block">
              <span className="sr-only">Mot de passe</span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((form) => ({ ...form, password: event.target.value }))}
                  className="w-full h-12 rounded-lg border border-zinc-700 bg-[#0f0f0f] pl-10 pr-3 text-sm text-white caret-white placeholder:text-zinc-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/40"
                  placeholder="Mot de passe"
                />
              </div>
            </label>

            {authMode === "register" ? (
              <label className="block">
                <span className="sr-only">Confirmer le mot de passe</span>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    value={loginForm.confirmPassword}
                    onChange={(event) => setLoginForm((form) => ({ ...form, confirmPassword: event.target.value }))}
                    className="w-full h-12 rounded-lg border border-zinc-700 bg-[#0f0f0f] pl-10 pr-3 text-sm text-white caret-white placeholder:text-zinc-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/40"
                    placeholder="Confirmer le mot de passe"
                  />
                </div>
              </label>
            ) : null}

            {authMode === "verify" ? (
              <label className="block">
                <span className="sr-only">Code de verification</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={loginForm.otpCode}
                  onChange={(event) => setLoginForm((form) => ({ ...form, otpCode: event.target.value }))}
                  className="w-full h-12 rounded-lg border border-zinc-700 bg-[#0f0f0f] px-3 text-sm text-center text-white caret-white placeholder:text-zinc-400 tracking-widest outline-none focus:border-primary focus:ring-2 focus:ring-primary/40"
                  placeholder="Code email"
                />
              </label>
            ) : null}

            {loginInfo ? (
              <p className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
                {loginInfo}
              </p>
            ) : null}

            {loginError ? (
              <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {loginError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full h-12 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {authMode === "register" ? "Creer mon compte" : authMode === "verify" ? "Verifier et continuer" : "Se connecter"}
            </button>

            {authMode === "verify" ? (
              <button
                type="button"
                onClick={() => {
                  setLoginError("");
                  setLoginInfo("");
                  resendEmailOtp(loginForm.email.trim())
                    .then(() => setLoginInfo("Nouveau code envoye. Verifiez votre email."))
                    .catch((error) => setLoginError(error?.message || "Impossible de renvoyer le code."));
                }}
                className="w-full text-sm text-primary underline"
              >
                Renvoyer le code
              </button>
            ) : null}
          </form>

          <button
            type="button"
            onClick={() => switchAuthMode(authMode === "login" ? "register" : "login")}
            className="w-full text-sm text-primary underline"
          >
            {authMode === "login" ? "Creer un nouveau compte" : "J'ai deja un compte"}
          </button>

        </div>
      </div>
    );
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

  // Choix du rôle (nouvel utilisateur sans profil)
  if (state === "choix_role") {
    return <RoleSelection />;
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
  // Retourner un écran de chargement au lieu de null pour éviter React error #185
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Truck className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <p className="text-sm text-muted-foreground">Chargement...</p>
      </div>
    </div>
  );
}