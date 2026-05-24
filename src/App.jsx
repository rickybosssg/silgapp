import { Suspense, lazy } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { BrowserRouter as Router } from 'react-router-dom';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Silgapp2Login from './pages/Silgapp2Login';
import { queryClientInstance } from '@/lib/query-client';
import { base44 } from '@/api/base44Client';
import { Truck } from 'lucide-react';
import { SilgappAuthProvider, useSilgappAuth } from '@/lib/silgappAuth';
import { GlobalErrorDisplay } from '@/lib/GlobalErrorDisplay';

const AuthenticatedRoutes = lazy(() => import('./AuthenticatedRoutes.jsx'));

const LoadingScreen = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background" data-dynamic-content="silgapp2-loading">
    <div className="text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
        <Truck className="w-8 h-8 text-primary animate-pulse" />
      </div>
      <div>
        <p className="text-base font-bold text-foreground">SILGAPP 2</p>
        <p className="text-xs text-muted-foreground mt-1">Chargement en cours...</p>
      </div>
      <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
    </div>
  </div>
);

const UnauthorizedLivreur = ({ user, logout }) => (
  <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-4 p-8 text-center">
    <Truck className="w-14 h-14 text-muted-foreground opacity-30" />
    <h1 className="text-xl font-bold">Acces non autorise</h1>
    <p className="text-muted-foreground text-sm max-w-sm">
      Votre compte (<span className="font-medium">{user?.email}</span>) n&apos;est pas associe a un profil livreur. Contactez un administrateur Silga.
    </p>
    <button
      className="text-xs text-muted-foreground underline mt-2"
      onClick={logout}
    >
      Se deconnecter
    </button>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, authChecked, user, isAuthenticated, logout } = useSilgappAuth();
  const isAdmin = user?.role === 'admin';

  const { data: livreurMatch, isLoading: isLoadingLivreur } = useQuery({
    queryKey: ['livreur-check', user?.email],
    queryFn: () => base44.entities.Livreur.filter({ user_email: user.email }),
    enabled: !!user && !isAdmin && !user?.livreur,
    select: (data) => data[0] || null,
  });
  const resolvedLivreurMatch = user?.livreur || livreurMatch;

  if (isLoadingAuth) {
    return <LoadingScreen />;
  }

  if (!authChecked) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Silgapp2Login />;
  }

  if (isAuthenticated && !isAdmin && !isLoadingLivreur && resolvedLivreurMatch === null) {
    return <UnauthorizedLivreur user={user} logout={logout} />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <AuthenticatedRoutes isAdmin={isAdmin} />
    </Suspense>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <SilgappAuthProvider>
        <Router>
          <GlobalErrorDisplay />
          <AuthenticatedApp />
          <Toaster />
        </Router>
      </SilgappAuthProvider>
    </QueryClientProvider>
  );
}

export default App;