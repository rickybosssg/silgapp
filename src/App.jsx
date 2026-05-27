import { Suspense, lazy, useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { queryClientInstance } from '@/lib/query-client';
import { Truck } from 'lucide-react';
import PageNotFound from './lib/PageNotFound';
import AuthGate from './components/auth/AuthGate.jsx';
import SelectionReseau from './pages/SelectionReseau.jsx';

const AppLayout = lazy(() => import('./components/layout/AppLayout'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DashboardExterne = lazy(() => import('./pages/DashboardExterne'));
const NouvelleCourse = lazy(() => import('./pages/NouvelleCourse'));

const CarteLivreurs = lazy(() => import('./pages/CarteLivreurs'));
const CarteLivreursExterne = lazy(() => import('./pages/CarteLivreursExterne'));
const ToutesCourses = lazy(() => import('./pages/ToutesCourses'));
const ToutesCoursesExternes = lazy(() => import('./pages/ToutesCoursesExternes'));
const Livreurs = lazy(() => import('./pages/Livreurs'));
const LivreursExternes = lazy(() => import('./pages/LivreursExternes'));
const RapportJour = lazy(() => import('./pages/RapportJour'));
const RapportJourExterne = lazy(() => import('./pages/RapportJourExterne'));
const Notifications = lazy(() => import('./pages/Notifications'));
const RecapitulatifAdmin = lazy(() => import('./pages/RecapitulatifAdmin'));
const LivreurApp = lazy(() => import('./pages/LivreurApp.jsx'));

const ClientExterneApp = lazy(() => import('./pages/ClientExterneApp.jsx'));
const CourseExterneForm = lazy(() => import('./pages/CourseExterneForm.jsx'));
const CourseExterneFormSync = lazy(() => import('./pages/CourseExterneFormSync.jsx'));
const ClientSuiviCourse = lazy(() => import('./pages/ClientSuiviCourse.jsx'));
const DashboardAdminExterne = lazy(() => import('./pages/DashboardAdminExterne.jsx'));
const DusLivreursExternes = lazy(() => import('./pages/DusLivreursExternes.jsx'));
const PublicSuiviCourse = lazy(() => import('./pages/PublicSuiviCourse.jsx'));
const TelechargerApp = lazy(() => import('./pages/TelechargerApp.jsx'));
const Maintenance = lazy(() => import('./pages/Maintenance.jsx'));
const TestBoutEnBout = lazy(() => import('./pages/TestBoutEnBout.jsx'));
const TestDiagnosticsComplet = lazy(() => import('./pages/TestDiagnosticsComplet.jsx'));
const TestTerrainComplet = lazy(() => import('./pages/TestTerrainComplet.jsx'));

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

const InscriptionLivreur = () => null;

function App() {
  const [livreurProfil, setLivreurProfil] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const [reseau, setReseau] = useState(null);

  // Si un profil livreur a été détecté, afficher directement l'app appropriée
  if (livreurProfil) {
    // Livreur externe ?
    if (livreurProfil.type_livreur === "externe") {
      const LivreurExterneApp = livreurProfil.component || LivreurApp;
      return (
        <Suspense fallback={<LoadingScreen />}>
          <LivreurExterneApp livreurProfil={livreurProfil} />
        </Suspense>
      );
    }
    // Livreur interne
    return (
      <Suspense fallback={<LoadingScreen />}>
        <LivreurApp livreurProfil={livreurProfil} />
      </Suspense>
    );
  }

  // Client → afficher directement le dashboard client
  if (isClient) {
    return (
      <Router>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<ClientExterneApp />} />
            <Route path="/client/course/expedier" element={<CourseExterneFormSync />} />
            <Route path="/client/course/recevoir" element={<CourseExterneFormSync />} />
            <Route path="/client/suivi" element={<ClientSuiviCourse />} />
            <Route path="/suivi-public/:token" element={<PublicSuiviCourse />} />
            <Route path="/telecharger-app" element={<TelechargerApp />} />
            <Route path="*" element={<ClientExterneApp />} />
          </Routes>
        </Suspense>
        <Toaster />
      </Router>
    );
  }

  // Admin → afficher SelectionReseau ou le dashboard selon le réseau sélectionné
  if (!reseau) {
    return (
      <Router>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            {/* Routes de test accessibles sans sélection de réseau */}
            <Route path="/test-terrain" element={<TestTerrainComplet />} />
            <Route path="/test-diagnostics" element={<TestDiagnosticsComplet />} />
            <Route path="/test-bout-en-bout" element={<TestBoutEnBout />} />
            <Route path="/maintenance" element={<Maintenance />} />
            
            <Route
              path="*"
              element={
                <AuthGate 
                  onLivreur={setLivreurProfil}
                  onClient={() => setIsClient(true)}
                >
                  <SelectionReseau onSelect={setReseau} />
                </AuthGate>
              }
            />
          </Routes>
        </Suspense>
        <Toaster />
      </Router>
    );
  }

  // Réseau sélectionné → afficher le dashboard approprié + routes admin communes
  return (
    <Router>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/inscription-livreur" element={<InscriptionLivreur />} />
          <Route element={<AppLayout reseau={reseau} />}>
            {reseau === "interne" ? (
              <>
                <Route path="/" element={<Dashboard />} />
                <Route path="/nouvelle-course" element={<NouvelleCourse />} />
                <Route path="/carte" element={<CarteLivreurs />} />
                <Route path="/courses" element={<ToutesCourses />} />
                <Route path="/livreurs" element={<Livreurs />} />
                <Route path="/rapport" element={<RapportJour />} />
                <Route path="/recapitulatif" element={<RecapitulatifAdmin />} />
                {/* Routes admin externe accessibles depuis interne */}
                <Route path="/admin/externe" element={<DashboardAdminExterne />} />
                <Route path="/admin/externe/dus-livreurs" element={<DusLivreursExternes />} />
              </>
            ) : (
              <>
                <Route path="/" element={<DashboardExterne />} />
                <Route path="/carte" element={<CarteLivreursExterne />} />
                <Route path="/courses" element={<ToutesCoursesExternes />} />
                <Route path="/livreurs" element={<LivreursExternes />} />
                <Route path="/rapport" element={<RapportJourExterne />} />
                <Route path="/recapitulatif" element={<RecapitulatifAdmin reseau="externe" />} />
              </>
            )}
            <Route path="/notifications" element={<Notifications />} />
          </Route>
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
      <Toaster />
    </Router>
  );
}





function AppWithProviders() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <App />
    </QueryClientProvider>
  );
}

export default AppWithProviders;