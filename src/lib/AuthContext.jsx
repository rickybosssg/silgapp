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