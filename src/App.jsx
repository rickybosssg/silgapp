import React, { Suspense, lazy, useState, useEffect } from 'react';
import SplashScreen from './components/SplashScreen';
import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
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
const PolitiqueConfidentialite = lazy(() => import('./pages/PolitiqueConfidentialite.jsx'));

// AnimatedRoutes supprimé — useLocation() dans un composant imbriqué cause React #185 sur Android

function AppContent() {
  // TOUS LES HOOKS EN PREMIER — avant tout return conditionnel (règle React #185)
  const navigate = useNavigate();
  const location = useLocation();
  const [livreurProfil, setLivreurProfil] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const [reseau, setReseau] = useState(null);

  // Thème système
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

  // Bouton retour Android
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

  // 🌍 ROUTES PUBLIQUES - ACCESSIBLES SANS AUTHENTIFICATION (PRIORITÉ ABSOLUE)
  const isPublicRoute = location.pathname === '/telecharger' ||
                        location.pathname === '/privacy-policy' ||
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
              <Route path="/" element={<Dashboard />} />
              <Route path="/nouvelle-course" element={<NouvelleCourse />} />
              <Route path="/carte" element={<CarteLivreurs />} />
              <Route path="/courses" element={<ToutesCourses />} />
              <Route path="/livreurs" element={<Livreurs />} />
              <Route path="/rapport" element={<RapportJour />} />
              <Route path="/recapitulatif" element={<RecapitulatifAdmin reseau="interne" />} />
              <Route path="/admin/externe" element={<DashboardAdminExterne />} />
              <Route path="/admin/externe/stats-telechargements" element={<StatsTelechargementsAdmin />} />
              <Route path="/admin/externe/dus-livreurs" element={<DusLivreursExternes />} />
              <Route path="/admin/externe/twilio-sandbox" element={<TwilioSandboxMonitor />} />
              <Route path="/admin/externe/clients" element={<ClientsExternesPage />} />
              <Route path="/admin/publicites" element={<GestionPublicites />} />
            </>
          ) : (
            <>
              <Route path="/" element={<DashboardExterne />} />
              <Route path="/carte" element={<CarteLivreursExterne />} />
              <Route path="/courses" element={<ToutesCoursesExternes />} />
              <Route path="/livreurs" element={<LivreursExternes />} />
              <Route path="/rapport" element={<RapportJourExterne />} />
              <Route path="/recapitulatif" element={<RecapitulatifAdmin reseau="externe" />} />
              <Route path="/admin/externe/dus-livreurs" element={<DusLivreursExternes />} />
              <Route path="/admin/externe/clients" element={<ClientsExternesPage />} />
              <Route path="/admin/externe/stats-telechargements" element={<StatsTelechargementsAdmin />} />
              <Route path="/admin/gestion-pays" element={<GestionPays />} />
              <Route path="/admin/global" element={<AdminGlobal />} />
              <Route path="/admin/pays/:code" element={<DashboardPays />} />
              <Route path="/admin/pays/:code/carte" element={<CarteLivreursExterne />} />
              <Route path="/admin/publicites" element={<GestionPublicites />} />
            </>
          )}
          <Route path="/notifications" element={<Notifications />} />
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
      <Toaster />
    </QueryClientProvider>
  );
}

export default AppWithProviders;