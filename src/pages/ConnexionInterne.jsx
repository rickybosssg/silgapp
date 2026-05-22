import React, { useEffect, useState } from "react";
import { Truck, Loader2, AlertTriangle } from "lucide-react";

// ─── CONSTANTES HARDCODÉES — NE PAS UTILISER appParams ICI ───────────────────
// appParams peut retourner null si les variables d'env ne sont pas chargées,
// ce qui produit des URLs comme "null/login?app_id=null&next=..." → écran blanc.
const BASE44_LOGIN_URL = "https://app.base44.com/login";
const APP_ID = import.meta.env.VITE_BASE44_APP_ID;
// URL de retour après auth — URL publique de l'app (jamais localhost)
const RETURN_URL = "https://silgapp.base44.app";

// Mots interdits dans une URL de redirection
const INVALID_PATTERNS = ["localhost", "null", "undefined", "silgaapp"];

function isUrlSafe(url) {
  if (!url || typeof url !== "string") return false;
  return !INVALID_PATTERNS.some((p) => url.includes(p));
}

function buildLoginUrl() {
  const appId = APP_ID;

  if (!appId || appId === "null" || appId === "undefined" || appId.trim() === "") {
    return {
      url: null,
      error: `VITE_BASE44_APP_ID manquant ou invalide : "${appId}"`,
    };
  }

  const returnUrl = RETURN_URL;

  if (!isUrlSafe(returnUrl)) {
    return {
      url: null,
      error: `URL de retour invalide bloquée : "${returnUrl}"`,
    };
  }

  const loginUrl = `${BASE44_LOGIN_URL}?app_id=${encodeURIComponent(appId)}&next=${encodeURIComponent(returnUrl)}`;

  // Vérification finale
  if (!isUrlSafe(loginUrl)) {
    return {
      url: null,
      error: `URL de login invalide bloquée : "${loginUrl}"`,
    };
  }

  return { url: loginUrl, error: null };
}

export default function ConnexionInterne() {
  const [loginUrl, setLoginUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const { url, error: buildError } = buildLoginUrl();

    console.log("[ConnexionInterne] APP_ID =", APP_ID);
    console.log("[ConnexionInterne] RETURN_URL =", RETURN_URL);
    console.log("[ConnexionInterne] loginUrl =", url);
    console.log("[ConnexionInterne] error =", buildError);

    if (buildError || !url) {
      setError(buildError || "URL de connexion invalide.");
      return;
    }

    setLoginUrl(url);

    // Délai court pour que l'écran s'affiche avant la redirection
    const t = setTimeout(() => {
      window.location.href = url;
    }, 300);

    return () => clearTimeout(t);
  }, []);

  // ── ERREUR : afficher au lieu de rediriger ────────────────────────────────
  if (error) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-950 p-6 gap-6">
        <div className="w-16 h-16 rounded-2xl bg-red-900/40 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <div className="text-center space-y-3 max-w-sm">
          <h1 className="text-white font-bold text-lg">Erreur de configuration</h1>
          <p className="text-red-400 text-xs font-mono break-all bg-red-950/40 p-3 rounded-xl">
            {error}
          </p>
          <p className="text-white/30 text-xs">
            APP_ID: {APP_ID || "⚠️ VIDE"}
          </p>
          <p className="text-white/30 text-xs">
            RETURN: {RETURN_URL}
          </p>
        </div>
        <button
          className="px-5 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold"
          onClick={() => { setError(null); }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  // ── CHARGEMENT / REDIRECTION EN COURS ────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-950 p-6">
      <div className="text-center space-y-5">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-red-700 flex items-center justify-center shadow-2xl shadow-red-900/50 mx-auto">
          <Truck className="w-10 h-10 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">SILGAPP</h1>
          <p className="text-white/40 text-sm mt-1">Silga Livraison — Espace pro</p>
        </div>
        <div className="flex flex-col items-center gap-3 mt-4">
          <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
          <p className="text-white/30 text-xs">Connexion en cours…</p>
          {loginUrl && (
            <p className="text-white/15 text-[10px] font-mono max-w-[280px] break-all">
              {loginUrl.substring(0, 80)}…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}