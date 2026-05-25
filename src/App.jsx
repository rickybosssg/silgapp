import { Suspense, lazy } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { queryClientInstance } from '@/lib/query-client';
import { Truck } from 'lucide-react';
import PageNotFound from './lib/PageNotFound';

const AppLayout = lazy(() => import('./components/layout/AppLayout'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const NouvelleCourse = lazy(() => import('./pages/NouvelleCourse'));
const CarteLivreurs = lazy(() => import('./pages/CarteLivreurs'));
const ToutesCourses = lazy(() => import('./pages/ToutesCourses'));
const Livreurs = lazy(() => import('./pages/Livreurs'));
const RapportJour = lazy(() => import('./pages/RapportJour'));
const Notifications = lazy(() => import('./pages/Notifications'));
const RecapitulatifAdmin = lazy(() => import('./pages/RecapitulatifAdmin'));
const LivreurApp = lazy(() => import('./pages/LivreurApp.jsx'));
const InscriptionLivreur = lazy(() => import('./pages/InscriptionLivreur'));

const LoadingScreen = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
        <Truck className="w-8 h-8 text-primary animate-pulse" />
      </div>
      <div>
        <p className="text-base font-bold text-foreground">SILGAPP 2</p>
        <p className="text-xs text-muted-foreground mt-1">Chargement en cours...</p>
      </div>
    </div>
  </div>
);

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/inscription-livreur" element={<InscriptionLivreur />} />
            <Route path="/livreur" element={<LivreurApp />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/nouvelle-course" element={<NouvelleCourse />} />
              <Route path="/carte" element={<CarteLivreurs />} />
              <Route path="/courses" element={<ToutesCourses />} />
              <Route path="/livreurs" element={<Livreurs />} />
              <Route path="/rapport" element={<RapportJour />} />
              <Route path="/recapitulatif" element={<RecapitulatifAdmin />} />
              <Route path="/notifications" element={<Notifications />} />
            </Route>
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Suspense>
        <Toaster />
      </Router>
    </QueryClientProvider>
  );
}

export default App;