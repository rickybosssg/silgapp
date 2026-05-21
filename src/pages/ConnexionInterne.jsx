import React, { useEffect, useState } from "react";
import { Truck, Loader2, AlertTriangle } from "lucide-react";
import { appParams } from "@/lib/app-params";

// URL publique de l'app Base44 publiée — utilisée comme returnUrl dans Capacitor
// car "localhost" n'est pas résolvable depuis Chrome Android après auth externe.
const BASE44_LOGIN_BASE = "https://app.base44.com";
const APP_PUBLIC_URL = "https://silgapp.base44.app";

function buildLoginUrl() {
  const appId = appParams.appId;
  const appBaseUrl = appParams.appBaseUrl || BASE44_LOGIN_BASE;

  if (!appId) {
    return { url: null, error: "appId manquant — impossible de construire l'URL de login." };
  }

  // Dans Capacitor : utiliser l'URL publique de l'app (résolvable depuis Chrome Android)
  // En web : utiliser l'URL courante du navigateur
  const returnUrl = appParams.isCapacitor ? APP_PUBLIC_URL : window.location.origin + "/";

  const loginUrl = `${appBaseUrl}/login?app_id=${encodeURIComponent(appId)}&next=${encodeURIComponent(returnUrl)}`;
  return { url: loginUrl, error: null };
}

/**
 * Page de connexion : redirige vers la page d'auth native Base44
 * (Sign in / Sign up / Google Sign-In).
 * Compatible Capacitor APK — returnUrl = URL publique Base44 (jamais localhost).
 */
export default function ConnexionInterne() {
  const [error, setError] = useState(null);

  useEffect(() => {
    const { url, error: buildError } = buildLoginUrl();

    if (buildError || !url) {
      setError(buildError || "URL de connexion invalide.");
      return;
    }

    // Redirection
    window.location.href = url;
  }, []);

  // ── Erreur : afficher au lieu de rediriger vers une URL invalide ──
  if (error) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-950 p-6 gap-6">
        <div className="w-16 h-16 rounded-2xl bg-red-900/40 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-white font-bold text-lg">Erreur de configuration</h1>
          <p className="text-red-400 text-sm font-mono break-all max-w-xs">{error}</p>
        </div>
        <button
          className="px-5 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold"
          onClick={() => window.location.reload()}
        >
          Réessayer
        </button>
      </div>
    );
  }

  // ── Écran de chargement pendant la redirection ──
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
          <p className="text-white/30 text-xs">Redirection vers la connexion…</p>
        </div>
      </div>
    </div>
  );
}