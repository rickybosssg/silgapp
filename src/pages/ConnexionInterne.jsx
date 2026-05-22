import React, { useState, useEffect } from "react";
import { Truck, AlertTriangle, LogIn } from "lucide-react";

const BASE44_LOGIN_URL = "https://app.base44.com/login";
const APP_ID = import.meta.env.VITE_BASE44_APP_ID || "silgapp";
const RETURN_URL = "https://silgapp.base44.app";

function buildLoginUrl() {
  if (!APP_ID || APP_ID === "null" || APP_ID === "undefined") {
    return { url: null, error: `APP_ID invalide: "${APP_ID}"` };
  }
  const url = `${BASE44_LOGIN_URL}?app_id=${encodeURIComponent(APP_ID)}&next=${encodeURIComponent(RETURN_URL)}`;
  return { url, error: null };
}

// Détecte si on est dans Capacitor (APK)
function isCapacitorApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

export default function ConnexionInterne() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { url: loginUrl, error: buildError } = buildLoginUrl();

  useEffect(() => {
    if (buildError) setError(buildError);
  }, [buildError]);

  const handleLogin = async () => {
    if (!loginUrl) return;
    setLoading(true);

    try {
      if (isCapacitorApp()) {
        // Sur Android : ouvrir via Custom Chrome Tab (autorisé par Google pour OAuth)
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: loginUrl, windowName: "_self" });
        // Le retour sera capté par AuthContext via App.addListener('appUrlOpen')
      } else {
        // Sur web : redirection normale
        window.location.href = loginUrl;
      }
    } catch (e) {
      console.error("[ConnexionInterne] Erreur ouverture browser:", e);
      // Fallback : redirection directe
      window.location.href = loginUrl;
    }
  };

  if (error) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-950 p-6 gap-6">
        <div className="w-16 h-16 rounded-2xl bg-red-900/40 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <div className="text-center space-y-2 max-w-sm">
          <h1 className="text-white font-bold text-lg">Erreur de configuration</h1>
          <p className="text-red-400 text-xs font-mono break-all bg-red-950/40 p-3 rounded-xl">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-950 p-6">
      <div className="text-center space-y-8 w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-red-700 flex items-center justify-center shadow-2xl shadow-red-900/50">
            <Truck className="w-12 h-12 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-white tracking-tight">SILGAPP</h1>
            <p className="text-white/40 text-sm mt-1">Silga Livraison — Espace pro</p>
          </div>
        </div>

        {/* Bouton connexion */}
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full h-14 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-lg shadow-2xl shadow-red-900/50 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-70"
        >
          <LogIn className="w-6 h-6" />
          {loading ? "Connexion en cours…" : "Se connecter"}
        </button>

        <p className="text-white/20 text-xs">
          Connexion sécurisée via Google
        </p>
      </div>
    </div>
  );
}