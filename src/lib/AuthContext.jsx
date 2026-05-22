import React, { createContext, useContext, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams, APP_PUBLIC_URL } from '@/lib/app-params';

const AuthContext = createContext();

const isValidToken = (token) => token && token !== 'null' && token !== 'undefined';

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

  useEffect(() => {
    const publicHost = new URL(APP_PUBLIC_URL).hostname;

    const consumeAuthUrl = async (rawUrl) => {
      const url = new URL(rawUrl, window.location.origin);
      const token = url.searchParams.get('access_token');

      if (isValidToken(token)) {
        localStorage.setItem('base44_access_token', token);
      }

      if (url.hostname === publicHost || isValidToken(token)) {
        window.history.replaceState({}, document.title, '/');
        await checkUserAuth();
      }
    };

    const checkUrlToken = async () => {
      const token = new URLSearchParams(window.location.search).get('access_token');
      if (isValidToken(token)) {
        await consumeAuthUrl(window.location.href);
      }
    };
    checkUrlToken();

    let appListenerHandle = null;
    const setupCapacitorListener = async () => {
      try {
        if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
          const { App } = await import('@capacitor/app');
          const { Browser } = await import('@capacitor/browser');

          appListenerHandle = await App.addListener('appUrlOpen', async (data) => {
            console.log('[AuthContext] appUrlOpen received:', data.url);
            try {
              await Browser.close();
            } catch (_) {}
            await consumeAuthUrl(data.url);
          });
        }
      } catch (e) {
        console.error('[AuthContext] Capacitor listener setup failed:', e);
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

      const token = appParams.token
        || localStorage.getItem('base44_access_token')
        || localStorage.getItem('base44_token');

      if (!isValidToken(token)) {
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
        setAuthChecked(true);
        setAuthError({ type: 'auth_required', message: 'Non connecte' });
        return;
      }

      await checkUserAuth();
    } catch (error) {
      console.error('[AuthContext] Startup auth check failed:', error);
      setAuthError({ type: 'auth_required', message: error?.message || 'Erreur au demarrage' });
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
      localStorage.removeItem('base44_access_token');
      localStorage.removeItem('base44_token');
      setAuthError({ type: 'auth_required', message: 'Session expiree' });
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthError({ type: 'auth_required', message: 'Deconnecte' });
    localStorage.removeItem('base44_access_token');
    localStorage.removeItem('base44_token');
  };

  const navigateToLogin = () => {
    console.warn('[AuthContext] navigateToLogin called. Use ConnexionInterne instead.');
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
