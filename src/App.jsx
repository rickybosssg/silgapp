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
import { restoreTokenFromCookie, syncTokenFromPreferences, clearPersistedToken } from '@/lib/authPersistence';
import { trackAppInstall } from '@/lib/trackInstall';
import IOSAppStoreBanner from './components/IOSAppStoreBanner.jsx';

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
const CommandesPartenaires = lazy(() => import('./pages/CommandesPartenaires.jsx'));
const AntiFraudePanel = lazy(() => import('./components/admin/AntiFraudePanel.jsx'));
const SupportAdmin = lazy(() => import('./components/admin/SupportAdmin.jsx'));
const SupportClient = lazy(() => import('./pages/SupportClient.jsx'));
const PolitiqueConfidentialite = lazy(() => import('./pages/PolitiqueConfidentialite.jsx'));
const TestNotifications = lazy(() => import('./pages/TestNotifications.jsx'));
const DiagnosticPushComplet = lazy(() => import('./pages/DiagnosticPushComplet.jsx'));
const TestDispatchLivreur = lazy(() => import('./pages/TestDispatchLivreur.jsx'));
const CentreNotificationsPush = lazy(() => import('./pages/CentreNotificationsPush.jsx'));
const DemoDashboard = lazy(() => import('./pages/DemoDashboard.jsx'));
const Statistiques = lazy(() => import('./pages/Statistiques.jsx'));
// ── Module Boutiques / Restaurants / Partenaires ──
const BoutiquesList = lazy(() => import('./pages/BoutiquesList.jsx'));
const BoutiqueDetail = lazy(() => import('./pages/BoutiqueDetail.jsx'));
const RestaurantsList = lazy(() => import('./pages/RestaurantsList.jsx'));
const RestaurantDetail = lazy(() => import('./pages/RestaurantDetail.jsx'));
const PartenaireDashboard = lazy(() => import('./pages/PartenaireDashboard.jsx'));
const GestionBoutiques = lazy(() => import('./pages/GestionBoutiques.jsx'));
const GestionRestaurants = lazy(() => import('./pages/GestionRestaurants.jsx'));
const GestionPharmacies = lazy(() => import('./pages/GestionPharmacies.jsx'));
const MesCommandesBoutique = lazy(() => import('./pages/MesCommandesBoutique.jsx'));
const PharmaciesList = lazy(() => import('./pages/PharmaciesList.jsx'));
const PharmacieDetail = lazy(() => import('./pages/PharmacieDetail.jsx'));
const AdminMessages = lazy(() => import('./pages/AdminMessages.jsx'));
const WhatsAppAdmin = lazy(() => import('./pages/WhatsAppAdmin.jsx'));
const VenusAdminCenter = lazy(() => import('./pages/VenusAdminCenter.jsx'));
const VenusLearningCenter = lazy(() => import('./pages/VenusLearningCenter.jsx'));
const VenusBrainCenter = lazy(() => import('./pages/VenusBrainCenter.jsx'));
const VenusWorkflowCenter = lazy(() => import('./pages/VenusWorkflowCenter.jsx'));
const VenusImprovementCenter = lazy(() => import('./pages/VenusImprovementCenter.jsx'));
const VenusDocumentLibrary = lazy(() => import('./pages/VenusDocumentLibrary.jsx'));
const VenusSupervisionCenter = lazy(() => import('./pages/VenusSupervisionCenter.jsx'));
const VenusInternationalCenter = lazy(() => import('./pages/VenusInternationalCenter.jsx'));
const VenusPerformanceCenter = lazy(() => import('./pages/VenusPerformanceCenter.jsx'));
const VenusCertificationCenter = lazy(() => import('./pages/VenusCertificationCenter.jsx'));
const NeoDashboard = lazy(() => import('./pages/NeoDashboard.jsx'));
const BugsTracking = lazy(() => import('./pages/BugsTracking.jsx'));
const PayerSilgapp = lazy(() => import('./pages/PayerSilgapp.jsx'));
const PaiementsAdmin = lazy(() => import('./pages/PaiementsAdmin.jsx'));
const DispatchLogs = lazy(() => import('./pages/DispatchLogs.jsx'));

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
  // ── Forcer le mode clair en permanence — SILGAPP reste lisible même si
  //    le téléphone est en mode sombre (Correction 4) ──
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    // Empêcher toute bascule ultérieure vers le mode sombre
    const observer = new MutationObserver(() => {
      if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
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

  // ── Heartbeat d'authentification — empêche la déconnexion involontaire ──
  // Sur Android WebView, localStorage peut être effacé quand l'app passe en
  // arrière-plan. Ce heartbeat restaure le token depuis le cookie/Preferences
  // si localStorage l'a perdu, et garde la session active.
  useEffect(() => {
    const checkAndRestoreToken = async () => {
      const token = localStorage.getItem('base44_access_token');
      if (!token || token.length < 10) {
        // localStorage a perdu le token — tenter restauration depuis cookie
        const restored = restoreTokenFromCookie();
        if (!restored) {
          // Cookie aussi perdu — tenter Capacitor Preferences
          await syncTokenFromPreferences();
        }
      }
    };

    // Vérification toutes les 60 secondes
    const interval = setInterval(checkAndRestoreToken, 60000);

    // Suivi d'installation unique par appareil
    trackAppInstall();

    // Vérification immédiate quand l'app revient au premier plan
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          checkAndRestoreToken();
        }
      };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
  
  const [livreurProfil, setLivreurProfil] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const [isPartenaire, setIsPartenaire] = useState(false);
  const [reseau, setReseau] = useState(null);

  // 🌍 ROUTES PUBLIQUES - ACCESSIBLES SANS AUTHENTIFICATION (PRIORITÉ ABSOLUE)
  // Ces routes doivent être vérifiées AVANT toute logique d'authentification
  // 🌍 ROUTES PUBLIQUES - PRIORITÉ ABSOLUE (vérification avant tout)
  const currentPath = location.pathname || window.location.pathname;
  const isPublicRoute = currentPath === '/telecharger' || 
                        currentPath === '/privacy-policy' ||
                        currentPath.startsWith('/suivi-public/') ||
                        currentPath.startsWith('/demo/');

  // /demo/ : rendu DIRECT sans passer par le Router pour éviter toute ingérence
  if (currentPath.startsWith('/demo/')) {
    const token = currentPath.replace('/demo/', '').split('?')[0].split('#')[0];
    return (
      <Suspense fallback={<LoadingScreen />}>
        <DemoDashboard token={token} />
      </Suspense>
    );
  }

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

  // Partenaire → dashboard partenaire
  if (isPartenaire) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/payer-silgapp" element={<PayerSilgapp />} />
          <Route path="*" element={<PartenaireDashboard />} />
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
              <Route path="/payer-silgapp" element={<PayerSilgapp />} />
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
          <Routes>
            <Route path="/payer-silgapp" element={<PayerSilgapp />} />
            <Route path="*" element={<LivreurApp livreurProfil={livreurProfil} />} />
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
          <Route path="/payer-silgapp" element={<PayerSilgapp />} />
          <Route path="/client/course/expedier" element={<CourseExterneFormSync />} />
          <Route path="/client/course/recevoir" element={<CourseExterneFormSync />} />
          <Route path="/client/course/deplacement" element={<CourseExterneFormSync />} />
          <Route path="/client/suivi" element={<ClientSuiviCourse />} />
          <Route path="/client/boutiques" element={<BoutiquesList />} />
          <Route path="/client/boutiques/:id" element={<BoutiqueDetail />} />
          <Route path="/client/restaurants" element={<RestaurantsList />} />
          <Route path="/client/restaurants/:id" element={<RestaurantDetail />} />
          <Route path="/client/pharmacies" element={<PharmaciesList />} />
          <Route path="/client/pharmacies/:id" element={<PharmacieDetail />} />
          <Route path="/client/mes-commandes" element={<MesCommandesBoutique />} />
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
                onPartenaire={() => setIsPartenaire(true)}
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
                onPartenaire={() => setIsPartenaire(true)}
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
          <Route path="/admin/anti-fraude" element={<AnimatedRoutes><AntiFraudePanel /></AnimatedRoutes>} />
          <Route path="/admin/support" element={<AnimatedRoutes><SupportAdmin /></AnimatedRoutes>} />
          <Route path="/admin/boutiques" element={<AnimatedRoutes><GestionBoutiques /></AnimatedRoutes>} />
          <Route path="/admin/restaurants" element={<AnimatedRoutes><GestionRestaurants /></AnimatedRoutes>} />
          <Route path="/admin/pharmacies" element={<AnimatedRoutes><GestionPharmacies /></AnimatedRoutes>} />
          <Route path="/admin/commandes-partenaires" element={<AnimatedRoutes><CommandesPartenaires /></AnimatedRoutes>} />
          <Route path="/admin/paiements" element={<AnimatedRoutes><PaiementsAdmin /></AnimatedRoutes>} />
          <Route path="/admin/dispatch-logs" element={<AnimatedRoutes><DispatchLogs /></AnimatedRoutes>} />
          <Route path="/admin/messages" element={<AnimatedRoutes><AdminMessages /></AnimatedRoutes>} />
          <Route path="/admin/whatsapp" element={<AnimatedRoutes><WhatsAppAdmin /></AnimatedRoutes>} />
          <Route path="/admin/venus" element={<AnimatedRoutes><VenusAdminCenter /></AnimatedRoutes>} />
          <Route path="/admin/venus-learning" element={<AnimatedRoutes><VenusLearningCenter /></AnimatedRoutes>} />
          <Route path="/admin/venus-brain" element={<AnimatedRoutes><VenusBrainCenter /></AnimatedRoutes>} />
          <Route path="/admin/venus-workflows" element={<AnimatedRoutes><VenusWorkflowCenter /></AnimatedRoutes>} />
          <Route path="/admin/venus-improvement" element={<AnimatedRoutes><VenusImprovementCenter /></AnimatedRoutes>} />
          <Route path="/admin/venus-documents" element={<AnimatedRoutes><VenusDocumentLibrary /></AnimatedRoutes>} />
          <Route path="/admin/venus-supervision" element={<AnimatedRoutes><VenusSupervisionCenter /></AnimatedRoutes>} />
          <Route path="/admin/venus-international" element={<AnimatedRoutes><VenusInternationalCenter /></AnimatedRoutes>} />
          <Route path="/admin/venus-performance" element={<AnimatedRoutes><VenusPerformanceCenter /></AnimatedRoutes>} />
          <Route path="/admin/venus-certification" element={<AnimatedRoutes><VenusCertificationCenter /></AnimatedRoutes>} />
          <Route path="/admin/neo" element={<AnimatedRoutes><NeoDashboard /></AnimatedRoutes>} />
          <Route path="/admin/bugs" element={<AnimatedRoutes><BugsTracking /></AnimatedRoutes>} />
          <Route path="/admin/statistiques" element={<AnimatedRoutes><Statistiques /></AnimatedRoutes>} />
          <Route path="/support" element={<AnimatedRoutes><SupportClient /></AnimatedRoutes>} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
}

// Module-level check pour /demo/ — court-circuite tout le routing React
const isDemoUrl = window.location.pathname.startsWith('/demo/');
const demoToken = isDemoUrl ? window.location.pathname.replace('/demo/', '').split('?')[0].split('#')[0] : null;

function App() {
  // Si URL démo, rendre DIRECTEMENT le dashboard sans Router ni auth
  if (isDemoUrl && demoToken) {
    return (
      <React.Suspense fallback={<SplashScreen />}>
        <DemoDashboard token={demoToken} />
      </React.Suspense>
    );
  }

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
      <IOSAppStoreBanner />
    </QueryClientProvider>
  );
}

export default AppWithProviders;