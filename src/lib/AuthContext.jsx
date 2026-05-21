import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';

const AuthContext = createContext();

// URL absolue pour les appels API hors-SDK (public-settings)
const BASE44_SERVER = 'https://app.base44.com';
const BASE44_API_BASE = `${BASE44_SERVER}/api/apps/public`;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      // Utiliser fetch natif (sans dépendance SDK interne) — fonctionne dans Capacitor
      const url = `${BASE44_API_BASE}/prod/public-settings/by-id/${appParams.appId}`;
      const headers = { 'Content-Type': 'application/json', 'X-App-Id': appParams.appId };
      if (appParams.token) headers['Authorization'] = `Bearer ${appParams.token}`;

      let publicSettings = null;
      try {
        const res = await fetch(url, { headers });
        if (res.ok) {
          publicSettings = await res.json();
          setAppPublicSettings(publicSettings);
        } else if (res.status === 401) {
          setAuthError({ type: 'auth_required', message: 'Session expirée' });
          setIsLoadingPublicSettings(false);
          setIsLoadingAuth(false);
          return;
        } else if (res.status === 403) {
          let body = {};
          try { body = await res.json(); } catch (_) {}
          const reason = body?.extra_data?.reason || 'forbidden';
          setAuthError({ type: reason, message: body?.message || 'Accès refusé' });
          setIsLoadingPublicSettings(false);
          setIsLoadingAuth(false);
          return;
        }
        // Erreur réseau non bloquante → continuer vers auth
      } catch (fetchError) {
        console.warn('[AuthContext] public-settings fetch failed (réseau?):', fetchError.message);
        // Ne pas bloquer : continuer pour tenter l'auth
      }

      setIsLoadingPublicSettings(false);

      // Vérifier l'auth utilisateur si token présent
      if (appParams.token) {
        await checkUserAuth();
      } else {
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
        setAuthChecked(true);
        // Pas de token → forcer affichage login
        setAuthError({ type: 'auth_required', message: 'Non connecté' });
      }
    } catch (error) {
      console.error('[AuthContext] Unexpected error in checkAppState:', error);
      setAuthError({ type: 'auth_required', message: error?.message || 'Erreur au démarrage' });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
      console.error('[AuthContext] User auth check failed:', error);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Session expirée' });
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem("base44_access_token");
    window.location.reload(); // Réaffiche ConnexionInterne sans sortir de l'APK
  };

  const navigateToLogin = (returnUrl) => {
    // No-op: connexion gérée par ConnexionInterne dans l'APK
    console.warn('[AuthContext] navigateToLogin appelé — utiliser ConnexionInterne à la place');
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};