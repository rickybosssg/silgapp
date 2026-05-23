import { useSilgappAuth } from "@/lib/silgappAuth";

/**
 * Protège les routes admin.
 * Si non connecté → redirige vers login Base44.
 * (La redirection rôle livreur est gérée dans App.jsx)
 */
export default function AdminGuard({ children }) {
  const { isLoadingAuth, isAuthenticated, logout } = useSilgappAuth();

  if (isLoadingAuth) return null;

  if (!isAuthenticated) {
    logout();
    return null;
  }

  return children;
}