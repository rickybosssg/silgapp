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
import LivreurApp from './pages/LivreurApp';
import InscriptionLivreur from './pages/InscriptionLivreur';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Truck } from 'lucide-react';

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

  if (isLoadingPublicSettings || isLoadingAuth || (!isAdmin && isAuthenticated && isLoadingLivreur)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-muted-foreground">Chargement de Silga Livraison...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
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
      {/* Routes Admin */}
      <Route element={<AppLayout />}>
        {/* Racine : admin → Dashboard, sinon → espace livreur */}
        <Route path="/" element={isAdmin ? <Dashboard /> : <Navigate to="/livreur" replace />} />
        <Route path="/nouvelle-course" element={<NouvelleCourse />} />
        <Route path="/carte" element={<CarteLivreurs />} />
        <Route path="/courses" element={<ToutesCourses />} />
        <Route path="/livreurs" element={<Livreurs />} />
        <Route path="/rapport" element={<RapportJour />} />
        <Route path="/notifications" element={<Notifications />} />
      </Route>

      {/* Route Livreur */}
      <Route path="/livreur" element={<LivreurApp />} />
      <Route path="/inscription-livreur" element={<InscriptionLivreur />} />
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