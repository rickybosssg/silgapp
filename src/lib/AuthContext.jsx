import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    checkAppState();
  }, []);

  // Écouter le retour OAuth via deep link (Capacitor) ou URL directe (web)
  useEffect(() => {
    // Vérifier le token dans l'URL au montage (web ou reload APK)
    const checkUrlToken = () => {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('access_token');
      if (urlToken && urlToken !== 'null' && urlToken !== 'undefined') {
        localStorage.setItem('base44_access_token', urlToken);
        window.history.replaceState({}, document.title, window.location.pathname);
        checkUserAuth();
      }
    };
    checkUrlToken();

    // Sur Capacitor Android : écouter le deep link de retour après OAuth
    // Base44 redirige vers https://silgapp.base44.app?access_token=XXX
    // @capacitor/app intercepte cet appUrlOpen avant que le WebView le charge
    let appListenerHandle = null;
    const setupCapacitorListener = async () => {
      try {
        if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
          const { App } = await import('@capacitor/app');
          const { Browser } = await import('@capacitor/browser');
          appListenerHandle = await App.addListener('appUrlOpen', async (data) => {
            console.log('[AuthContext] appUrlOpen reçu:', data.url);
            try {
              await Browser.close();
            } catch (_) {}
            const url = new URL(data.url);
            const token = url.searchParams.get('access_token');
            if (token && token !== 'null' && token !== 'undefined') {
              localStorage.setItem('base44_access_token', token);
              checkUserAuth();
            }
          });
        }
      } catch (e) {
        console.error('[AuthContext] Erreur setup Capacitor listener:', e);
      }
    };
    setupCapacitorListener();

    return () => {
      if (appListenerHandle) appListenerHandle.remove();
    };
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);

      // Lire le token depuis toutes les sources possibles
      // appParams.token = token depuis URL (retour OAuth)
      // localStorage = token déjà persisté par le SDK
      const token = appParams.token
        || localStorage.getItem('base44_access_token')
        || localStorage.getItem('base44_token');

      if (!token) {
        // Pas de token → afficher login
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
        setAuthChecked(true);
        setAuthError({ type: 'auth_required', message: 'Non connecté' });
        return;
      }

      // Token présent → vérifier avec le SDK
      await checkUserAuth();

    } catch (error) {
      console.error('[AuthContext] Erreur au démarrage:', error);
      setAuthError({ type: 'auth_required', message: error?.message || 'Erreur au démarrage' });
      setIsLoadingAuth(false);
      setAuthChecked(true);
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
      console.error('[AuthContext] Auth check failed:', error);
      setIsAuthenticated(false);
      // Nettoyer les tokens corrompus
      localStorage.removeItem('base44_access_token');
      localStorage.removeItem('base44_token');
      setAuthError({ type: 'auth_required', message: 'Session expirée' });
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthError({ type: 'auth_required', message: 'Déconnecté' });
    localStorage.removeItem("base44_access_token");
    localStorage.removeItem("base44_token");
  };

  const navigateToLogin = (returnUrl) => {
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