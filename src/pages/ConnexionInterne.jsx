import React, { useState } from "react";
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

export default function ConnexionInterne() {
  const [loading, setLoading] = useState(false);
  const { url: loginUrl, error } = buildLoginUrl();

  const handleLogin = () => {
    if (!loginUrl) return;
    setLoading(true);
    // Sur Capacitor Android, window.location.href navigue dans le WebView
    // et le retour sur RETURN_URL rechargera l'app avec le token dans l'URL
    window.location.href = loginUrl;
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
          {loading ? "Connexion…" : "Se connecter"}
        </button>

        <p className="text-white/20 text-xs">
          Vous serez redirigé vers la page de connexion sécurisée Base44
        </p>
      </div>
    </div>
  );
}