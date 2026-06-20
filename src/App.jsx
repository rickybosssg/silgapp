import React, { Suspense, lazy, useState, useEffect } from 'react';
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
const TwilioSandboxMonitor = lazy(() => import('./pages/TwilioSandboxMonitor.jsx'));
const TelechargerSILGAPP = lazy(() => import('./pages/TelechargerSILGAPP.jsx'));
const StatsTelechargements = lazy(() => import('./pages/StatsTelechargements.jsx'));
const StatsTelechargementsAdmin = lazy(() => import('./pages/StatsTelechargementsAdmin.jsx'));
const GestionPublicites = lazy(() => import('./pages/GestionPublicites.jsx'));
const FraisAnnulationAdmin = lazy(() => import('./pages/FraisAnnulationAdmin.jsx'));
const VenusRapportsPage = lazy(() => import('./pages/VenusRapportsPage.jsx'));
const ZonesChaudesAdmin = lazy(() => import('./pages/ZonesChaudesAdmin.jsx'));
const AdminCourseForm = lazy(() => import('./pages/AdminCourseForm.jsx'));
const DemandesLivreursAdmin = lazy(() => import('./components/admin/DemandesLivreursPanel.jsx'));
const LivreursBloquesEncours = lazy(() => import('./components/admin/LivreursBloquesEncours.jsx'));
const Comptabilite = lazy(() => import('./pages/Comptabilite.jsx'));
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
  const [reseau, setReseau] = useState(null);

  // 🌍 ROUTES PUBLIQUES - ACCESSIBLES SANS AUTHENTIFICATION (PRIORITÉ ABSOLUE)
  // Ces routes doivent être vérifiées AVANT toute logique d'authentification
  const isPublicRoute = location.pathname === '/telecharger' || 
                        location.pathname === '/privacy-policy' ||
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
          {/* Politique de confidentialité — requise Google Play */}
          <Route path="/privacy-policy" element={<PolitiqueConfidentialite />} />
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
          <Route path="/client/course/deplacement" element={<CourseExterneFormSync />} />
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
            path="/diagnostic-push-complet"
            element={
              <AuthGate
                onLivreur={setLivreurProfil}
                onClient={() => setIsClient(true)}
              >
                <DiagnosticPushComplet />
              </AuthGate>
            }
          />
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
              <Route path="/admin/publicites" element={<AnimatedRoutes><GestionPublicites /></AnimatedRoutes>} />
              <Route path="/admin/frais-annulation" element={<AnimatedRoutes><FraisAnnulationAdmin /></AnimatedRoutes>} />
              <Route path="/maintenance" element={<AnimatedRoutes><Maintenance /></AnimatedRoutes>} />
              <Route path="/diagnostic-push-complet" element={<AnimatedRoutes><DiagnosticPushComplet /></AnimatedRoutes>} />
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
              <Route path="/admin/frais-annulation" element={<AnimatedRoutes><FraisAnnulationAdmin /></AnimatedRoutes>} />
              <Route path="/admin/venus-rapports" element={<AnimatedRoutes><VenusRapportsPage /></AnimatedRoutes>} />
              <Route path="/admin/zones-chaudes" element={<AnimatedRoutes><ZonesChaudesAdmin /></AnimatedRoutes>} />
              <Route path="/admin/nouvelle-course" element={<AnimatedRoutes><AdminCourseForm /></AnimatedRoutes>} />
              <Route path="/admin/externe" element={<AnimatedRoutes><DashboardAdminExterne /></AnimatedRoutes>} />
              <Route path="/maintenance" element={<AnimatedRoutes><Maintenance /></AnimatedRoutes>} />
              <Route path="/diagnostic-push-complet" element={<AnimatedRoutes><DiagnosticPushComplet /></AnimatedRoutes>} />
            </>
          )}
          <Route path="/notifications" element={<AnimatedRoutes><Notifications /></AnimatedRoutes>} />
          <Route path="/admin/test-notifications" element={<AnimatedRoutes><TestNotifications /></AnimatedRoutes>} />
          <Route path="/diagnostic-push-complet" element={<AnimatedRoutes><DiagnosticPushComplet /></AnimatedRoutes>} />
          <Route path="/admin/test-dispatch-livreur" element={<AnimatedRoutes><TestDispatchLivreur /></AnimatedRoutes>} />
          <Route path="/admin/centre-notifications" element={<AnimatedRoutes><CentreNotificationsPush /></AnimatedRoutes>} />
          <Route path="/admin/demandes-livreurs" element={<AnimatedRoutes><DemandesLivreursAdmin /></AnimatedRoutes>} />
          <Route path="/admin/livreurs-bloques" element={<AnimatedRoutes><LivreursBloquesEncours /></AnimatedRoutes>} />
          <Route path="/admin/comptabilite" element={<AnimatedRoutes><Comptabilite /></AnimatedRoutes>} />
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