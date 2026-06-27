import React, { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { QueryClientProvider } from "@tanstack/react-query";
import SplashScreen from "./components/SplashScreen";
import PageNotFound from "./lib/PageNotFound";
import AuthGate from "./components/auth/AuthGate.jsx";
import AppMaintenanceGate from "./components/admin/AppMaintenanceGate.jsx";
import { queryClientInstance } from "@/lib/query-client";
import { restoreTokenFromCookie, syncTokenFromPreferences } from "@/lib/authPersistence";

const LoadingScreen = () => <SplashScreen />;
const InscriptionLivreur = () => null;

const AppLayout = lazy(() => import("./components/layout/AppLayout"));
const DashboardExterne = lazy(() => import("./pages/DashboardExterne.jsx"));
const CarteLivreursExterne = lazy(() => import("./pages/CarteLivreursExterne"));
const ToutesCoursesExternes = lazy(() => import("./pages/ToutesCoursesExternes"));
const LivreursExternes = lazy(() => import("./pages/LivreursExternes"));
const RapportJourExterne = lazy(() => import("./pages/RapportJourExterne"));
const Notifications = lazy(() => import("./pages/Notifications"));
const RecapitulatifAdmin = lazy(() => import("./pages/RecapitulatifAdmin"));
const LivreurExterneApp = lazy(() => import("./pages/LivreurExterneApp.jsx"));
const ClientExterneApp = lazy(() => import("./pages/ClientExterneApp.jsx"));
const RecapCourseLivreur = lazy(() => import("./pages/RecapCourseLivreur.jsx"));
const CourseExterneFormSync = lazy(() => import("./pages/CourseExterneFormSync.jsx"));
const ClientSuiviCourse = lazy(() => import("./pages/ClientSuiviCourse.jsx"));
const DashboardAdminExterne = lazy(() => import("./pages/DashboardAdminExterne.jsx"));
const DusLivreursExternes = lazy(() => import("./pages/DusLivreursExternes.jsx"));
const ClientsExternesPage = lazy(() => import("./pages/ClientsExternesPage.jsx"));
const PublicSuiviCourse = lazy(() => import("./pages/PublicSuiviCourse.jsx"));
const GestionPays = lazy(() => import("./pages/GestionPays.jsx"));
const AdminGlobal = lazy(() => import("./pages/AdminGlobal.jsx"));
const DashboardPays = lazy(() => import("./pages/DashboardPays.jsx"));
const Maintenance = lazy(() => import("./pages/Maintenance.jsx"));
const TelechargerSILGAPP = lazy(() => import("./pages/TelechargerSILGAPP.jsx"));
const StatsTelechargementsAdmin = lazy(() => import("./pages/StatsTelechargementsAdmin.jsx"));
const GestionPublicites = lazy(() => import("./pages/GestionPublicites.jsx"));
const FraisAnnulationAdmin = lazy(() => import("./pages/FraisAnnulationAdmin.jsx"));
const VenusRapportsPage = lazy(() => import("./pages/VenusRapportsPage.jsx"));
const ZonesChaudesAdmin = lazy(() => import("./pages/ZonesChaudesAdmin.jsx"));
const AdminCourseForm = lazy(() => import("./pages/AdminCourseForm.jsx"));
const DemandesLivreursAdmin = lazy(() => import("./components/admin/DemandesLivreursPanel.jsx"));
const LivreursBloquesEncours = lazy(() => import("./components/admin/LivreursBloquesEncours.jsx"));
const Comptabilite = lazy(() => import("./pages/Comptabilite.jsx"));
const CommandesPartenaires = lazy(() => import("./pages/CommandesPartenaires.jsx"));
const AntiFraudePanel = lazy(() => import("./components/admin/AntiFraudePanel.jsx"));
const SupportAdmin = lazy(() => import("./components/admin/SupportAdmin.jsx"));
const SupportClient = lazy(() => import("./pages/SupportClient.jsx"));
const AdminMessages = lazy(() => import("./pages/AdminMessages.jsx"));
const PolitiqueConfidentialite = lazy(() => import("./pages/PolitiqueConfidentialite.jsx"));
const TestNotifications = lazy(() => import("./pages/TestNotifications.jsx"));
const DiagnosticPushComplet = lazy(() => import("./pages/DiagnosticPushComplet.jsx"));
const TestDispatchLivreur = lazy(() => import("./pages/TestDispatchLivreur.jsx"));
const CentreNotificationsPush = lazy(() => import("./pages/CentreNotificationsPush.jsx"));
const DemoDashboard = lazy(() => import("./pages/DemoDashboard.jsx"));
const BoutiquesList = lazy(() => import("./pages/BoutiquesList.jsx"));
const BoutiqueDetail = lazy(() => import("./pages/BoutiqueDetail.jsx"));
const RestaurantsList = lazy(() => import("./pages/RestaurantsList.jsx"));
const RestaurantDetail = lazy(() => import("./pages/RestaurantDetail.jsx"));
const PartenaireDashboard = lazy(() => import("./pages/PartenaireDashboard.jsx"));
const GestionBoutiques = lazy(() => import("./pages/GestionBoutiques.jsx"));
const GestionRestaurants = lazy(() => import("./pages/GestionRestaurants.jsx"));
const GestionPharmacies = lazy(() => import("./pages/GestionPharmacies.jsx"));
const MesCommandesBoutique = lazy(() => import("./pages/MesCommandesBoutique.jsx"));
const LivraisonsProgrammees = lazy(() => import("./pages/LivraisonsProgrammees.jsx"));
const PharmaciesList = lazy(() => import("./pages/PharmaciesList.jsx"));
const PharmacieDetail = lazy(() => import("./pages/PharmacieDetail.jsx"));

function AnimatedRoutes({ children }) {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={{
          initial: { opacity: 0, x: 24 },
          animate: { opacity: 1, x: 0 },
          exit: { opacity: 0, x: -24 },
        }}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.22, ease: "easeInOut" }}
        style={{ width: "100%", minHeight: "100%" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function PublicRoutes() {
  return (
    <Routes>
      <Route path="/telecharger" element={<TelechargerSILGAPP />} />
      <Route path="/suivi-public/:token" element={<PublicSuiviCourse />} />
      <Route path="/privacy-policy" element={<PolitiqueConfidentialite />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

function ClientRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ClientExterneApp />} />
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
      <Route path="/client/livraisons-programmees" element={<LivraisonsProgrammees />} />
      <Route path="/livreur/recap-course/:courseId" element={<RecapCourseLivreur />} />
      <Route path="*" element={<ClientExterneApp />} />
    </Routes>
  );
}

function LivreurRoutes({ livreurProfil }) {
  return (
    <AppMaintenanceGate>
      <Routes>
        <Route path="/livreur/recap-course/:courseId" element={<RecapCourseLivreur />} />
        <Route path="*" element={<LivreurExterneApp livreurProfil={{ ...livreurProfil, type_livreur: "externe" }} />} />
      </Routes>
    </AppMaintenanceGate>
  );
}

function AdminExterneRoutes() {
  return (
    <Routes>
      <Route path="/inscription-livreur" element={<InscriptionLivreur />} />
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
        <Route path="/admin/zones-chaudes" element={<AnimatedRoutes><ZonesChaudesAdmin /></AnimatedRoutes>} />
        <Route path="/admin/nouvelle-course" element={<AnimatedRoutes><AdminCourseForm /></AnimatedRoutes>} />
        <Route path="/admin/demandes-livreurs" element={<AnimatedRoutes><DemandesLivreursAdmin /></AnimatedRoutes>} />
        <Route path="/admin/livreurs-bloques" element={<AnimatedRoutes><LivreursBloquesEncours /></AnimatedRoutes>} />
        <Route path="/admin/comptabilite" element={<AnimatedRoutes><Comptabilite /></AnimatedRoutes>} />
        <Route path="/admin/anti-fraude" element={<AnimatedRoutes><AntiFraudePanel /></AnimatedRoutes>} />
        <Route path="/admin/support" element={<AnimatedRoutes><SupportAdmin /></AnimatedRoutes>} />
        <Route path="/admin/boutiques" element={<AnimatedRoutes><GestionBoutiques /></AnimatedRoutes>} />
        <Route path="/admin/restaurants" element={<AnimatedRoutes><GestionRestaurants /></AnimatedRoutes>} />
        <Route path="/admin/pharmacies" element={<AnimatedRoutes><GestionPharmacies /></AnimatedRoutes>} />
        <Route path="/admin/commandes-partenaires" element={<AnimatedRoutes><CommandesPartenaires /></AnimatedRoutes>} />
        <Route path="/admin/messages" element={<AnimatedRoutes><AdminMessages /></AnimatedRoutes>} />
        <Route path="/notifications" element={<AnimatedRoutes><Notifications /></AnimatedRoutes>} />
        <Route path="/admin/test-notifications" element={<AnimatedRoutes><TestNotifications /></AnimatedRoutes>} />
        <Route path="/diagnostic-push-complet" element={<AnimatedRoutes><DiagnosticPushComplet /></AnimatedRoutes>} />
        <Route path="/admin/test-dispatch-livreur" element={<AnimatedRoutes><TestDispatchLivreur /></AnimatedRoutes>} />
        <Route path="/admin/centre-notifications" element={<AnimatedRoutes><CentreNotificationsPush /></AnimatedRoutes>} />
        <Route path="/maintenance" element={<AnimatedRoutes><Maintenance /></AnimatedRoutes>} />
        <Route path="/support" element={<AnimatedRoutes><SupportClient /></AnimatedRoutes>} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
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
  const [livreurProfil, setLivreurProfil] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const [isPartenaire, setIsPartenaire] = useState(false);

  useEffect(() => {
    const handleBackButton = (event) => {
      event.preventDefault();
      if (location.pathname !== "/") navigate(-1);
    };
    document.addEventListener("backbutton", handleBackButton, false);
    return () => document.removeEventListener("backbutton", handleBackButton);
  }, [navigate, location.pathname]);

  useEffect(() => {
    const checkAndRestoreToken = async () => {
      const token = localStorage.getItem("base44_access_token");
      if (!token || token.length < 10) {
        const restored = restoreTokenFromCookie();
        if (!restored) await syncTokenFromPreferences();
      }
    };

    const interval = setInterval(checkAndRestoreToken, 60000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkAndRestoreToken();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const currentPath = location.pathname || window.location.pathname;
  const isPublicRoute = currentPath === "/telecharger" ||
    currentPath === "/privacy-policy" ||
    currentPath.startsWith("/suivi-public/") ||
    currentPath.startsWith("/demo/");

  if (currentPath.startsWith("/demo/")) {
    const token = currentPath.replace("/demo/", "").split("?")[0].split("#")[0];
    return (
      <Suspense fallback={<LoadingScreen />}>
        <DemoDashboard token={token} />
      </Suspense>
    );
  }

  if (isPublicRoute) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <PublicRoutes />
      </Suspense>
    );
  }

  if (isPartenaire) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <PartenaireDashboard />
      </Suspense>
    );
  }

  if (livreurProfil) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <LivreurRoutes livreurProfil={livreurProfil} />
      </Suspense>
    );
  }

  if (isClient) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <ClientRoutes />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <AuthGate
        onLivreur={setLivreurProfil}
        onClient={() => setIsClient(true)}
        onPartenaire={() => setIsPartenaire(true)}
      >
        <AdminExterneRoutes />
      </AuthGate>
    </Suspense>
  );
}

const isDemoUrl = window.location.pathname.startsWith("/demo/");
const demoToken = isDemoUrl ? window.location.pathname.replace("/demo/", "").split("?")[0].split("#")[0] : null;

function App() {
  if (isDemoUrl && demoToken) {
    return (
      <Suspense fallback={<SplashScreen />}>
        <DemoDashboard token={demoToken} />
      </Suspense>
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
    </QueryClientProvider>
  );
}

export default AppWithProviders;
