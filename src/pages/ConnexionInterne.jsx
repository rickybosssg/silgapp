import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
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
  if (appParams.isCapacitor) return "com.silgapp.app://auth?domain=dispatch";

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

export default function ConnexionInterne() {
  const [error, setError] = useState(null);
  const loginUrl = useMemo(() => getLoginUrl(getReturnUrl()), []);

  useEffect(() => {
    let cancelled = false;

    if (!isValidUrl(appParams.appBaseUrl)) {
      setError(`URL Base44 invalide : "${appParams.appBaseUrl}"`);
      return;
    }

    const openLogin = async () => {
      try {
        if (appParams.isCapacitor && window.Capacitor?.isNativePlatform?.()) {
          const { Browser } = await import("@capacitor/browser");
          if (!cancelled) await Browser.open({ url: loginUrl, windowName: "_self" });
          return;
        }

        window.location.replace(loginUrl);
      } catch (e) {
        console.error("[ConnexionInterne] Base44 login open failed:", e);
        window.location.replace(loginUrl);
      }
    };

    openLogin();

    return () => {
      cancelled = true;
    };
  }, [loginUrl]);

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
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-950 p-6">
      <Loader2 className="w-9 h-9 text-red-500 animate-spin" />
      <p className="mt-4 text-white/50 text-sm">Connexion Base44...</p>
    </div>
  );
}
