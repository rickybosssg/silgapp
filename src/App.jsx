import React, { Suspense, lazy, useState, useEffect } from 'react';
import SplashScreen from './components/SplashScreen';
import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { queryClientInstance } from '@/lib/query-client';
import PageNotFound from './lib/PageNotFound';
import AuthGate from './components/auth/AuthGate.jsx';
import AppMaintenanceGate from './components/admin/AppMaintenanceGate.jsx';

// LoadingScreen défini IMMÉDIATEMENT avant lazy loading
const LoadingScreen = () => <SplashScreen />;
import AppLayout from './components/layout/AppLayout';
const DashboardExterne = lazy(() => import('./pages/DashboardExterne.jsx'));

const CarteLivreursExterne = lazy(() => import('./pages/CarteLivreursExterne'));
const ToutesCoursesExternes = lazy(() => import('./pages/ToutesCoursesExternes'));
const LivreursExternes = lazy(() => import('./pages/LivreursExternes'));
const RapportJourExterne = lazy(() => import('./pages/RapportJourExterne'));
const Notifications = lazy(() => import('./pages/Notifications'));
const RecapitulatifAdmin = lazy(() => import('./pages/RecapitulatifAdmin'));
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
const TwilioSandboxMonitor = lazy(() => import('./pages/TwilioSandboxMonitor.jsx'));
const TelechargerSILGAPP = lazy(() => import('./pages/TelechargerSILGAPP.jsx'));
const StatsTelechargements = lazy(() => import('./pages/StatsTelechargements.jsx'));
const StatsTelechargementsAdmin = lazy(() => import('./pages/StatsTelechargementsAdmin.jsx'));
const GestionPublicites = lazy(() => import('./pages/GestionPublicites.jsx'));
const FraisAnnulationAdmin = lazy(() => import('./pages/FraisAnnulationAdmin.jsx'));
const VenusRapportsPage = lazy(() => import('./pages/VenusRapportsPage.jsx'));
const PolitiqueConfidentialite = lazy(() => import('./pages/PolitiqueConfidentialite.jsx'));
const TestNotifications = lazy(() => import('./pages/TestNotifications.jsx'));
const DiagnosticPushComplet = lazy(() => import('./pages/DiagnosticPushComplet.jsx'));
const TestDispatchLivreur = lazy(() => import('./pages/TestDispatchLivreur.jsx'));
const CentreNotificationsPush = lazy(() => import('./pages/CentreNotificationsPush.jsx'));

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

  // 🌍 ROUTES PUBLIQUES - ACCESSIBLES SANS AUTHENTIFICATION (PRIORITÉ ABSOLUE)
  const isPublicRoute = location.pathname === '/telecharger' || 
                        location.pathname === '/privacy-policy' ||
                        location.pathname === '/suivi-public/:token' || 
                        location.pathname.startsWith('/suivi-public/');

  if (isPublicRoute) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/telecharger" element={<TelechargerSILGAPP />} />
          <Route path="/suivi-public/:token" element={<PublicSuiviCourse />} />
          <Route path="/privacy-policy" element={<PolitiqueConfidentialite />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
    );
  }

  // Si un profil livreur externe a été détecté
  if (livreurProfil) {
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

  // Admin → dashboard externe
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AuthGate
        onLivreur={setLivreurProfil}
        onClient={() => setIsClient(true)}
      >
        <Routes>
        <Route element={<AppLayout reseau="externe" />}>
          <Route path="/" element={<AnimatedRoutes><DashboardExterne /></AnimatedRoutes>} />
          <Route path="/carte" element={<AnimatedRoutes><CarteLivreursExterne /></AnimatedRoutes>} />
          <Route path="/courses" element={<AnimatedRoutes><ToutesCoursesExternes /></AnimatedRoutes>} />
          <Route path="/livreurs" element={<AnimatedRoutes><LivreursExternes /></AnimatedRoutes>} />
          <Route path="/rapport" element={<AnimatedRoutes><RapportJourExterne /></AnimatedRoutes>} />
          <Route path="/recapitulatif" element={<AnimatedRoutes><RecapitulatifAdmin reseau="externe" /></AnimatedRoutes>} />
          <Route path="/admin/externe" element={<AnimatedRoutes><DashboardAdminExterne /></AnimatedRoutes>} />
          <Route path="/admin/externe/dus-livreurs" element={<AnimatedRoutes><DusLivreursExternes /></AnimatedRoutes>} />
          <Route path="/admin/externe/clients" element={<AnimatedRoutes><ClientsExternesPage /></AnimatedRoutes>} />
          <Route path="/admin/externe/stats-telechargements" element={<AnimatedRoutes><StatsTelechargementsAdmin /></AnimatedRoutes>} />
          <Route path="/admin/gestion-pays" element={<AnimatedRoutes><GestionPays /></AnimatedRoutes>} />
          <Route path="/admin/global" element={<AnimatedRoutes><AdminGlobal /></AnimatedRoutes>} />
          <Route path="/admin/pays/:code" element={<AnimatedRoutes><DashboardPays /></AnimatedRoutes>} />
          <Route path="/admin/pays/:code/carte" element={<AnimatedRoutes><CarteLivreursExterne /></AnimatedRoutes>} />
          <Route path="/admin/publicites" element={<AnimatedRoutes><GestionPublicites /></AnimatedRoutes>} />
          <Route path="/admin/frais-annulation" element={<AnimatedRoutes><FraisAnnulationAdmin /></AnimatedRoutes>} />
          <Route path="/admin/venus-rapports" element={<AnimatedRoutes><VenusRapportsPage /></AnimatedRoutes>} />
          <Route path="/admin/twilio-sandbox" element={<AnimatedRoutes><TwilioSandboxMonitor /></AnimatedRoutes>} />
          <Route path="/maintenance" element={<AnimatedRoutes><Maintenance /></AnimatedRoutes>} />
          <Route path="/admin/test-notifications" element={<AnimatedRoutes><TestNotifications /></AnimatedRoutes>} />
          <Route path="/admin/test-dispatch-livreur" element={<AnimatedRoutes><TestDispatchLivreur /></AnimatedRoutes>} />
          <Route path="/admin/centre-notifications" element={<AnimatedRoutes><CentreNotificationsPush /></AnimatedRoutes>} />
          <Route path="/notifications" element={<AnimatedRoutes><Notifications /></AnimatedRoutes>} />
          <Route path="/diagnostic-push-complet" element={<AnimatedRoutes><DiagnosticPushComplet /></AnimatedRoutes>} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
      </AuthGate>
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