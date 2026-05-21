import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { ShieldX } from "lucide-react";

/**
 * Protège les routes admin.
 * - Si l'utilisateur n'est pas connecté → redirige vers login
 * - Si l'utilisateur n'est pas admin → affiche "Accès refusé"
 */
export default function AdminGuard({ children }) {
  const { user, isLoadingAuth, isAuthenticated, navigateToLogin } = useAuth();

  if (isLoadingAuth) return null;

  if (!isAuthenticated) {
    navigateToLogin();
    return null;
  }

  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center p-8">
        <ShieldX className="w-16 h-16 text-destructive opacity-60" />
        <h1 className="text-2xl font-bold">Accès refusé</h1>
        <p className="text-muted-foreground max-w-sm">
          Vous n'avez pas les droits nécessaires pour accéder à cette page.
          <br />
          Seuls les administrateurs Silga peuvent y accéder.
        </p>
      </div>
    );
  }

  return children;
}