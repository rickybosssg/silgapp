import React from "react";
import { useAuth } from "@/lib/AuthContext";

/**
 * Protège les routes admin.
 * Si non connecté → redirige vers login Base44.
 * (La redirection rôle livreur est gérée dans App.jsx)
 */
export default function AdminGuard({ children }) {
  const { isLoadingAuth, isAuthenticated, navigateToLogin } = useAuth();

  if (isLoadingAuth) return null;

  if (!isAuthenticated) {
    navigateToLogin();
    return null;
  }

  return children;
}