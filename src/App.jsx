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
import AppMaintenanceGate from './components/admin/AppMaintenanceGate.jsx';

// LoadingScreen défini IMMÉDIATEMENT avant lazy loading
const LoadingScreen = () => <SplashScreen />;
const InscriptionLivreur = () => null;

const AppLayout = lazy(() => import('./components/layout/AppLayout'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DashboardExterne = lazy(() => import('./pages/DashboardExterne.jsx'));
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
const ClientsExternesPage = lazy(() => import('./pages/ClientsExternesPage.jsx'));
const PublicSuiviCourse = lazy(() => import('./pages/PublicSuiviCourse.jsx'));
const GestionPays = lazy(() => import('./pages/GestionPays.jsx'));
const AdminGlobal = lazy(() => import('./pages/AdminGlobal.jsx'));
const DashboardPays = lazy(() => import('./pages/DashboardPays.jsx'));
const Maintenance = lazy(() => import('./pages/Maintenance.jsx'));
const TestBoutEnBout = lazy(() => import('./pages/TestBoutEnBout.jsx'));
const TestDiagnosticsComplet = lazy(() => import('./pages/TestDiagnosticsComplet.jsx'));
const TestTerrainComplet = lazy(() => import('./pages/TestTerrainComplet.jsx'));
const TestRecapitulatifPaiement = lazy(() => import('./pages/TestRecapitulatifPaiement.jsx'));
const TestConnexion = lazy(() => import('./pages/TestConnexion.jsx'));
const TestWhatsAppAlertes = lazy(() => import('./pages/TestWhatsAppAlertes.jsx'));
const TwilioSandboxMonitor = lazy(() => import('./pages/TwilioSandboxMonitor.jsx'));
const DiagnosticFCM = lazy(() => import('./pages/DiagnosticFCM.jsx'));
const TelechargerSILGAPP = lazy(() => import('./pages/TelechargerSILGAPP.jsx'));
const StatsTelechargements = lazy(() => import('./pages/StatsTelechargements.jsx'));
const StatsTelechargementsAdmin = lazy(() => import('./pages/StatsTelechargementsAdmin.jsx'));
const GestionPublicites = lazy(() => import('./pages/GestionPublicites.jsx'));

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

  // 🌍 ROUTES PUBLIQUES - ACCESSIBLES SANS AUTHENTIFICATION (PRIORITÉ ABSOLUE)
  // Ces routes doivent être vérifiées AVANT toute logique d'authentification
  const isPublicRoute = location.pathname === '/telecharger' || 
                        location.pathname === '/suivi-public/:token' || 
                        location.pathname.startsWith('/suivi-public/');

  if (isPublicRoute) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* Route publique de téléchargement - 100% accessible */}
          <Route path="/telecharger" element={<TelechargerSILGAPP />} />
          {/* Route publique de suivi de course */}
          <Route path="/suivi-public/:token" element={<PublicSuiviCourse />} />
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
          <AppMaintenanceGate>
            <Routes>
              <Route path="/livreur/recap-course/:courseId" element={<RecapCourseLivreur />} />
              <Route path="*" element={<LivreurExterneApp livreurProfil={livreurProfil} />} />
            </Routes>
          </AppMaintenanceGate>
        </Suspense>
      );
    }
    // Livreur interne
    return (
      <Suspense fallback={<LoadingScreen />}>
        <AppMaintenanceGate>
          <LivreurApp livreurProfil={livreurProfil} />
        </AppMaintenanceGate>
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
              <Route path="/recapitulatif" element={<AnimatedRoutes><RecapitulatifAdmin reseau="interne" /></AnimatedRoutes>} />
              <Route path="/admin/externe" element={<AnimatedRoutes><DashboardAdminExterne /></AnimatedRoutes>} />
              <Route path="/admin/externe/stats-telechargements" element={<AnimatedRoutes><StatsTelechargementsAdmin /></AnimatedRoutes>} />
              <Route path="/admin/externe/dus-livreurs" element={<AnimatedRoutes><DusLivreursExternes /></AnimatedRoutes>} />
              <Route path="/admin/externe/twilio-sandbox" element={<AnimatedRoutes><TwilioSandboxMonitor /></AnimatedRoutes>} />
              <Route path="/admin/externe/clients" element={<AnimatedRoutes><ClientsExternesPage /></AnimatedRoutes>} />
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
              <Route path="/admin/externe/clients" element={<AnimatedRoutes><ClientsExternesPage /></AnimatedRoutes>} />
              <Route path="/admin/externe/stats-telechargements" element={<AnimatedRoutes><StatsTelechargementsAdmin /></AnimatedRoutes>} />
              <Route path="/admin/gestion-pays" element={<AnimatedRoutes><GestionPays /></AnimatedRoutes>} />
              <Route path="/admin/global" element={<AnimatedRoutes><AdminGlobal /></AnimatedRoutes>} />
              <Route path="/admin/pays/:code" element={<AnimatedRoutes><DashboardPays /></AnimatedRoutes>} />
              <Route path="/admin/pays/:code/carte" element={<AnimatedRoutes><CarteLivreursExterne /></AnimatedRoutes>} />
              <Route path="/admin/publicites" element={<AnimatedRoutes><GestionPublicites /></AnimatedRoutes>} />
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