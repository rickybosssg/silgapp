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
const NouvelleCourseExterne = lazy(() => import('./pages/NouvelleCourseExterne'));
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
const InscriptionLivreur = lazy(() => import('./pages/InscriptionLivreur'));
const ClientExterneApp = lazy(() => import('./pages/ClientExterneApp.jsx'));
const CourseExterneForm = lazy(() => import('./pages/CourseExterneForm.jsx'));
const ClientSuiviCourse = lazy(() => import('./pages/ClientSuiviCourse.jsx'));
const DashboardAdminExterne = lazy(() => import('./pages/DashboardAdminExterne.jsx'));

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

function AdminRoutes() {
  const [reseau, setReseau] = useState(null);

  if (!reseau) {
    return (
      <Routes>
        <Route path="/inscription-livreur" element={<InscriptionLivreur />} />
        <Route path="/" element={<SelectionReseau onSelect={setReseau} />} />
        <Route path="*" element={<SelectionReseau onSelect={setReseau} />} />
      </Routes>
    );
  }

  // Wrapper component pour passer le reseau aux pages
  const PageWithReseau = ({ children, reseau }) => children;

  return (
    <Routes>
      <Route path="/inscription-livreur" element={<InscriptionLivreur />} />
      <Route element={<AppLayout reseau={reseau} />}>
        {reseau === "interne" ? (
          <>
            <Route path="/" element={<Dashboard />} />
            <Route path="/admin/externe" element={<DashboardAdminExterne />} />
            <Route path="/nouvelle-course" element={<NouvelleCourse />} />
            <Route path="/carte" element={<CarteLivreurs />} />
            <Route path="/courses" element={<ToutesCourses />} />
            <Route path="/livreurs" element={<Livreurs />} />
            <Route path="/rapport" element={<RapportJour />} />
            <Route path="/recapitulatif" element={<RecapitulatifAdmin />} />
          </>
        ) : (
          <>
            <Route path="/" element={<DashboardExterne />} />
            <Route path="/nouvelle-course" element={<NouvelleCourseExterne />} />
            <Route path="/carte" element={<CarteLivreursExterne />} />
            <Route path="/courses" element={<ToutesCoursesExternes />} />
            <Route path="/livreurs" element={<LivreursExternes />} />
            <Route path="/rapport" element={<RapportJourExterne />} />
            <Route path="/recapitulatif" element={<RecapitulatifAdmin reseau="externe" />} />
          </>
        )}
        <Route path="/notifications" element={<Notifications />} />
        {/* Routes Silga Externe */}
        <Route path="/client" element={<ClientExterneApp />} />
        <Route path="/client/course/expedier" element={<CourseExterneForm />} />
        <Route path="/client/course/recevoir" element={<CourseExterneForm />} />
        <Route path="/client/suivi" element={<ClientSuiviCourse />} />
        <Route path="/admin/externe" element={<DashboardAdminExterne />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

function AppRouter() {
  const [livreurProfil, setLivreurProfil] = useState(null);

  // Si un profil livreur a été détecté, afficher directement l'app appropriée
  if (livreurProfil) {
    // Livreur externe ?
    if (livreurProfil.type_livreur === "externe" || livreurProfil.component) {
      return (
        <Suspense fallback={<LoadingScreen />}>
          {livreurProfil.component ? (
            <livreurProfil.component livreurProfil={livreurProfil} />
          ) : (
            <LivreurApp livreurProfil={livreurProfil} />
          )}
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

  return (
    <Router>
      <Suspense fallback={<LoadingScreen />}>
        {/* La route inscription est publique */}
        <Routes>
          <Route path="/inscription-livreur" element={<InscriptionLivreur />} />
          <Route
            path="*"
            element={
              <AuthGate onLivreur={setLivreurProfil}>
                <AdminRoutes />
              </AuthGate>
            }
          />
        </Routes>
      </Suspense>
      <Toaster />
    </Router>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <AppRouter />
    </QueryClientProvider>
  );
}

export default App;