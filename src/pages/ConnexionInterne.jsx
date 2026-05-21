import React, { useState } from "react";
import { Truck, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BASE44_SERVER = "https://app.base44.com";

async function loginWithBase44(appId, email, password) {
  const res = await fetch(`${BASE44_SERVER}/api/apps/public/prod/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-App-Id": appId },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || data?.error || "Email ou mot de passe incorrect");
  }
  return data;
}

export default function ConnexionInterne() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const appId = import.meta.env.VITE_BASE44_APP_ID || localStorage.getItem("base44_app_id") || "";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Veuillez remplir tous les champs.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await loginWithBase44(appId, email.trim().toLowerCase(), password);
      // Stocker le token → app-params le lira au prochain démarrage
      localStorage.setItem("base44_access_token", data.access_token);
      // Recharger pour réinitialiser le client avec le nouveau token
      window.location.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-950 p-6">
      <div className="w-full max-w-sm space-y-8">

        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-red-700 flex items-center justify-center shadow-2xl shadow-red-900/50 mx-auto">
            <Truck className="w-10 h-10 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">SILGAPP</h1>
            <p className="text-white/40 text-sm mt-1">Silga Livraison — Espace pro</p>
          </div>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-white/70">Adresse e-mail</label>
            <Input
              type="email"
              placeholder="vous@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              className="h-12 bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-primary"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white/70">Mot de passe</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-12 bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-primary pr-12"
                disabled={loading}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 text-center">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-14 text-base font-black bg-gradient-to-b from-primary to-red-700 border-0 rounded-2xl shadow-xl shadow-red-900/40"
          >
            {loading
              ? <><Loader2 className="w-5 h-5 animate-spin mr-2" />Connexion…</>
              : "Se connecter"
            }
          </Button>
        </form>

        <p className="text-center text-xs text-white/20">
          Accès réservé aux administrateurs et livreurs Silga
        </p>
      </div>
    </div>
  );
}