import React, { useEffect } from "react";
import { Truck, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { appParams } from "@/lib/app-params";

/**
 * Page de connexion : redirige vers la page d'auth native Base44
 * (qui inclut Sign up, Sign in, Google, Forgot password).
 * Compatible Capacitor APK — le WebView charge l'URL Base44 en interne.
 */
export default function ConnexionInterne() {
  useEffect(() => {
    // Construire l'URL de retour après connexion
    const returnUrl = appParams.isCapacitor
      ? "https://silgaapp/"
      : window.location.origin + "/";

    // Redirection vers la page d'auth native Base44
    base44.auth.redirectToLogin(returnUrl);
  }, []);

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