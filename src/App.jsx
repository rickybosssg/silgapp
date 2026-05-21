import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import NouvelleCourse from './pages/NouvelleCourse';
import CarteLivreurs from './pages/CarteLivreurs';
import ToutesCourses from './pages/ToutesCourses';
import Livreurs from './pages/Livreurs';
import RapportJour from './pages/RapportJour';
import Notifications from './pages/Notifications';
import RecapitulatifAdmin from './pages/RecapitulatifAdmin';
import LivreurApp from './pages/LivreurApp.jsx';
import InscriptionLivreur from './pages/InscriptionLivreur';
import TestNotificationsPush from './pages/TestNotificationsPush';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Truck, LogIn } from 'lucide-react';
import { redirectToLogin as safeRedirectToLogin } from '@/lib/authRedirect';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, user, isAuthenticated } = useAuth();

  const isAdmin = user?.role === "admin";

  // Vérifier si l'utilisateur connecté a une fiche livreur (uniquement si non-admin)
  const { data: livreurMatch, isLoading: isLoadingLivreur } = useQuery({
    queryKey: ["livreur-check", user?.email],
    queryFn: () => base44.entities.Livreur.filter({ user_email: user.email }),
    enabled: !!user && !isAdmin,
    select: (data) => data[0] || null,
  });

  // ── ÉCRAN CHARGEMENT ──────────────────────────────────────────────
  if (isLoadingPublicSettings || isLoadingAuth || (!isAdmin && isAuthenticated && isLoadingLivreur)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Truck className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <div>
            <p className="text-base font-bold text-foreground">SILGAPP</p>
            <p className="text-xs text-muted-foreground mt-1">Chargement en cours…</p>
          </div>
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  // ── ERREURS D'AUTH ─────────────────────────────────────────────────
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }

    // auth_required, unknown, ou toute autre erreur → écran de connexion
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-6 p-8 text-center">
        <div className="space-y-3">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Truck className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">SILGAPP</h1>
          <p className="text-muted-foreground text-sm max-w-xs">
            Connectez-vous pour accéder à votre espace admin ou livreur
          </p>
        </div>
        <Button
          onClick={() => safeRedirectToLogin(window.location.href)}
          className="h-12 px-8 text-base font-semibold gap-2"
        >
          <LogIn className="w-5 h-5" />
          Se connecter
        </Button>
        <div className="space-y-2 text-xs text-muted-foreground max-w-xs">
          <p><strong>Admin :</strong> identifiants Base44</p>
          <p><strong>Livreur :</strong> compte créé par un administrateur</p>
        </div>
        {authError.type !== 'auth_required' && (
          <p className="text-xs text-destructive max-w-xs">
            Erreur : {authError.message || authError.type}
          </p>
        )}
      </div>
    );
  }

  // Utilisateur connecté mais inconnu (ni admin, ni livreur)
  if (isAuthenticated && !isAdmin && livreurMatch === null) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-4 p-8 text-center">
        <Truck className="w-14 h-14 text-muted-foreground opacity-30" />
        <h1 className="text-xl font-bold">Accès non autorisé</h1>
        <p className="text-muted-foreground text-sm max-w-sm">
          Votre compte (<span className="font-medium">{user?.email}</span>) n'est pas associé à un profil livreur. Contactez un administrateur Silga.
        </p>
        <button
          className="text-xs text-muted-foreground underline mt-2"
          onClick={() => base44.auth.logout()}
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  return (
    <Routes>
      {/* Routes publiques (sans authentification requise) */}
      <Route path="/inscription-livreur" element={<InscriptionLivreur />} />

      {/* Routes Admin */}
      <Route element={<AppLayout />}>
        {/* Racine : admin → Dashboard, sinon → espace livreur */}
        <Route path="/" element={isAdmin ? <Dashboard /> : <Navigate to="/livreur" replace />} />
        <Route path="/nouvelle-course" element={<NouvelleCourse />} />
        <Route path="/carte" element={<CarteLivreurs />} />
        <Route path="/courses" element={<ToutesCourses />} />
        <Route path="/livreurs" element={<Livreurs />} />
        <Route path="/rapport" element={<RapportJour />} />
        <Route path="/recapitulatif" element={<RecapitulatifAdmin />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/test-notifications" element={<TestNotificationsPush />} />
      </Route>

      {/* Route Livreur */}
      <Route path="/livreur" element={<LivreurApp />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App