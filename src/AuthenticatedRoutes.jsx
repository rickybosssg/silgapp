import { lazy } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
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
const TestNotificationsPush = lazy(() => import('./pages/TestNotificationsPush'));

export default function AuthenticatedRoutes({ isAdmin }) {
  return (
    <Routes>
      <Route path="/inscription-livreur" element={<InscriptionLivreur />} />

      <Route element={isAdmin ? <AppLayout /> : <Navigate to="/livreur" replace />}>
        <Route path="/" element={isAdmin ? <Dashboard /> : <Navigate to="/livreur" replace />} />
        <Route path="/nouvelle-course" element={<NouvelleCourse />} />
        <Route path="/carte" element={<CarteLivreurs />} />
        <Route path="/courses" element={<ToutesCourses />} />
        <Route path="/livreurs" element={<Livreurs />} />
        <Route path="/rapport" element={<RapportJour />} />
        <Route path="/recapitulatif" element={<RecapitulatifAdmin />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/test-notifications" element={<TestNotificationsPush />} />
      </Route>

      <Route path="/livreur" element={<LivreurApp />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}
