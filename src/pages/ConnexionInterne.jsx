import React, { useState } from "react";
import { Truck, AlertTriangle, LogIn } from "lucide-react";
import { appParams, APP_PUBLIC_URL } from "@/lib/app-params";

const INVALID_PATTERNS = ["null", "undefined"];

const isValidUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  if (INVALID_PATTERNS.some((pattern) => url.includes(pattern))) return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

const getReturnUrl = () => {
  if (appParams.isCapacitor) return APP_PUBLIC_URL;

  const currentUrl = typeof window !== "undefined" ? window.location.href : APP_PUBLIC_URL;
  if (!isValidUrl(currentUrl)) return APP_PUBLIC_URL;

  const url = new URL(currentUrl);
  url.searchParams.delete("clear_access_token");
  return url.toString();
};

const getLoginUrl = (returnUrl) => {
  const loginBaseUrl = appParams.appBaseUrl || APP_PUBLIC_URL;
  return `${loginBaseUrl.replace(/\/$/, "")}/login?from_url=${encodeURIComponent(returnUrl)}`;
};

function isCapacitorApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

export default function ConnexionInterne() {
  const [loading, setLoading] = useState(false);
  const returnUrl = getReturnUrl();
  const loginUrl = getLoginUrl(returnUrl);
  const [error, setError] = useState(isValidUrl(appParams.appBaseUrl) ? null : `URL Base44 invalide : "${appParams.appBaseUrl}"`);

  const handleLogin = async () => {
    if (!loginUrl) return;
    setLoading(true);

    try {
      if (isCapacitorApp()) {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: loginUrl, windowName: "_self" });
      } else {
        window.location.href = loginUrl;
      }
    } catch (e) {
      console.error("[ConnexionInterne] Erreur ouverture browser:", e);
      window.location.href = loginUrl;
    } finally {
      setLoading(false);
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
          <p className="text-red-400 text-xs font-mono break-all bg-red-950/40 p-3 rounded-xl">
            {error}
          </p>
          <p className="text-white/30 text-xs break-all">
            App Base URL: {appParams.appBaseUrl || "vide"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-950 p-6">
      <div className="text-center space-y-8 w-full max-w-sm">
        <div className="flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-red-700 flex items-center justify-center shadow-2xl shadow-red-900/50">
            <Truck className="w-12 h-12 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-white tracking-tight">SILGAPP</h1>
            <p className="text-white/40 text-sm mt-1">Silga Livraison - Espace pro</p>
          </div>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full h-14 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-lg shadow-2xl shadow-red-900/50 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-70"
        >
          <LogIn className="w-6 h-6" />
          {loading ? "Connexion en cours..." : "Se connecter"}
        </button>

        <a href={loginUrl} className="block text-white/30 text-xs break-all">
          Ouvrir la connexion Base44
        </a>

        <p className="text-white/20 text-xs">
          Connexion securisee via Google
        </p>
      </div>
    </div>
  );
}
