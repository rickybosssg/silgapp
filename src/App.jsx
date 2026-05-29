import { Suspense, lazy, useState, useEffect } from 'react';
import SplashScreen from './components/SplashScreen';
import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { queryClientInstance } from '@/lib/query-client';
import PageNotFound from './lib/PageNotFound';
import AuthGate from './components/auth/AuthGate.jsx';
import SelectionReseau from './pages/SelectionReseau.jsx';

// LoadingScreen défini IMMÉDIATEMENT avant lazy loading
const LoadingScreen = () => <SplashScreen />;
const InscriptionLivreur = () => null;

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
const LivreurExterneApp = lazy(() => import('./pages/LivreurExterneApp.jsx'));

const ClientExterneApp = lazy(() => import('./pages/ClientExterneApp.jsx'));
const RecapCourseLivreur = lazy(() => import('./pages/RecapCourseLivreur.jsx'));
const CourseExterneForm = lazy(() => import('./pages/CourseExterneForm.jsx'));
const CourseExterneFormSync = lazy(() => import('./pages/CourseExterneFormSync.jsx'));
const ClientSuiviCourse = lazy(() => import('./pages/ClientSuiviCourse.jsx'));
const DashboardAdminExterne = lazy(() => import('./pages/DashboardAdminExterne.jsx'));
const DusLivreursExternes = lazy(() => import('./pages/DusLivreursExternes.jsx'));
const PublicSuiviCourse = lazy(() => import('./pages/PublicSuiviCourse.jsx'));
const Maintenance = lazy(() => import('./pages/Maintenance.jsx'));
const TestBoutEnBout = lazy(() => import('./pages/TestBoutEnBout.jsx'));
const TestDiagnosticsComplet = lazy(() => import('./pages/TestDiagnosticsComplet.jsx'));
const TestTerrainComplet = lazy(() => import('./pages/TestTerrainComplet.jsx'));
const TestRecapitulatifPaiement = lazy(() => import('./pages/TestRecapitulatifPaiement.jsx'));
const TestConnexion = lazy(() => import('./pages/TestConnexion.jsx'));
const TestWhatsAppAlertes = lazy(() => import('./pages/TestWhatsAppAlertes.jsx'));

function AnimatedRoutes({ children }) {
  // Variables définies DANS la fonction pour éviter init issues
  const location = useLocation();
  const pageVariants = {
    initial: { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -24 },
  };
  const pageTransition = { duration: 0.22, ease: "easeInOut" };
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransition}
        style={{ width: "100%", minHeight: "100%" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function AppContent() {
  // Hook to apply system theme preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = (e) => {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
    applyTheme(mediaQuery);
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, []);
  
  // Hook for Android hardware back button
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const handleBackButton = (e) => {
      e.preventDefault();
      if (location.pathname !== '/') {
        navigate(-1);
      }
    };
    
    document.addEventListener('backbutton', handleBackButton, false);
    return () => document.removeEventListener('backbutton', handleBackButton);
  }, [navigate, location]);
  
  const [livreurProfil, setLivreurProfil] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const [reseau, setReseau] = useState(null);

  // ⚠️ ROUTES DE TEST TOUJOURS ACCESSIBLES - PRIORITÉ ABSOLUE
  // Ces routes doivent fonctionner même sans auth/réseau/rôle
  const isTestRoute = window.location.pathname.startsWith('/test-') || window.location.pathname === '/maintenance';
  
  if (isTestRoute) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/test-terrain" element={<TestTerrainComplet />} />
          <Route path="/test-diagnostics" element={<TestDiagnosticsComplet />} />
          <Route path="/test-bout-en-bout" element={<TestBoutEnBout />} />
          <Route path="/test-recapitulatif" element={<TestRecapitulatifPaiement />} />
          <Route path="/test-connexion" element={<TestConnexion />} />
          <Route path="/test-whatsapp" element={<TestWhatsAppAlertes />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
    );
  }

  // Si un profil livreur a été détecté, afficher directement l'app appropriée
  if (livreurProfil) {
    // Livreur externe → utiliser le lazy import défini en haut du fichier
    if (livreurProfil.type_livreur === "externe") {
      return (
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/livreur/recap-course/:courseId" element={<RecapCourseLivreur />} />
            <Route path="*" element={<LivreurExterneApp livreurProfil={livreurProfil} />} />
          </Routes>
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
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<ClientExterneApp />} />
          <Route path="/client/course/expedier" element={<CourseExterneFormSync />} />
          <Route path="/client/course/recevoir" element={<CourseExterneFormSync />} />
          <Route path="/client/suivi" element={<ClientSuiviCourse />} />
          <Route path="/suivi-public/:token" element={<PublicSuiviCourse />} />
          <Route path="/livreur/recap-course/:courseId" element={<RecapCourseLivreur />} />
          <Route path="*" element={<ClientExterneApp />} />
        </Routes>
      </Suspense>
    );
  }

  // Admin → afficher SelectionReseau ou le dashboard selon le réseau sélectionné
  if (!reseau) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
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
    );
  }

  // Réseau sélectionné → afficher le dashboard approprié + routes admin communes
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/inscription-livreur" element={<InscriptionLivreur />} />
        <Route element={<AppLayout reseau={reseau} />}>
          {reseau === "interne" ? (
            <>
              <Route path="/" element={<AnimatedRoutes><Dashboard /></AnimatedRoutes>} />
              <Route path="/nouvelle-course" element={<AnimatedRoutes><NouvelleCourse /></AnimatedRoutes>} />
              <Route path="/carte" element={<AnimatedRoutes><CarteLivreurs /></AnimatedRoutes>} />
              <Route path="/courses" element={<AnimatedRoutes><ToutesCourses /></AnimatedRoutes>} />
              <Route path="/livreurs" element={<AnimatedRoutes><Livreurs /></AnimatedRoutes>} />
              <Route path="/rapport" element={<AnimatedRoutes><RapportJour /></AnimatedRoutes>} />
              <Route path="/recapitulatif" element={<AnimatedRoutes><RecapitulatifAdmin /></AnimatedRoutes>} />
              <Route path="/admin/externe" element={<AnimatedRoutes><DashboardAdminExterne /></AnimatedRoutes>} />
              <Route path="/admin/externe/dus-livreurs" element={<AnimatedRoutes><DusLivreursExternes /></AnimatedRoutes>} />
            </>
          ) : (
            <>
              <Route path="/" element={<AnimatedRoutes><DashboardExterne /></AnimatedRoutes>} />
              <Route path="/carte" element={<AnimatedRoutes><CarteLivreursExterne /></AnimatedRoutes>} />
              <Route path="/courses" element={<AnimatedRoutes><ToutesCoursesExternes /></AnimatedRoutes>} />
              <Route path="/livreurs" element={<AnimatedRoutes><LivreursExternes /></AnimatedRoutes>} />
              <Route path="/rapport" element={<AnimatedRoutes><RapportJourExterne /></AnimatedRoutes>} />
              <Route path="/recapitulatif" element={<AnimatedRoutes><RecapitulatifAdmin reseau="externe" /></AnimatedRoutes>} />
              <Route path="/admin/externe/dus-livreurs" element={<AnimatedRoutes><DusLivreursExternes /></AnimatedRoutes>} />
            </>
          )}
          <Route path="/notifications" element={<AnimatedRoutes><Notifications /></AnimatedRoutes>} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
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