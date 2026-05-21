import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
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
import LivreurLogin from './pages/LivreurLogin';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
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

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/nouvelle-course" element={<NouvelleCourse />} />
        <Route path="/carte" element={<CarteLivreurs />} />
        <Route path="/courses" element={<ToutesCourses />} />
        <Route path="/livreurs" element={<Livreurs />} />
        <Route path="/rapport" element={<RapportJour />} />
        <Route path="/notifications" element={<Notifications />} />
      </Route>
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