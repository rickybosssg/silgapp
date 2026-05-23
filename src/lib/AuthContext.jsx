import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearIdentificationSession,
  getStoredIdentificationSession,
  signInWithIdentificationCode as signInWithStoredIdentificationCode,
} from '@/lib/codeIdentificationAuth';

export const AuthContext = createContext();

const ADMIN_SESSION_KEY = 'silgapp2_admin_session';
const LEGACY_TOKEN_KEYS = ['base44_access_token', 'token', 'base44_token'];

const normalize = (value) => (value || '').trim().toLowerCase();

const adminConfig = {
  identifier: normalize(import.meta.env.VITE_SILGAPP2_ADMIN_IDENTIFIER || 'admin'),
  email: normalize(import.meta.env.VITE_SILGAPP2_ADMIN_EMAIL || 'admin@silgapp2.local'),
  pin: String(import.meta.env.VITE_SILGAPP2_ADMIN_PIN || '2468'),
  name: import.meta.env.VITE_SILGAPP2_ADMIN_NAME || 'Administrateur SILGAPP 2',
};

const buildAdminUser = () => ({
  id: 'admin:silgapp2',
  role: 'admin',
  email: adminConfig.email,
  full_name: adminConfig.name,
  name: adminConfig.name,
  auth_provider: 'silgapp2-local-admin',
});

const clearLegacyBrowserAuth = () => {
  LEGACY_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
};

const readAdminSession = () => {
  try {
    const session = JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || 'null');
    return session?.role === 'admin' ? buildAdminUser() : null;
  } catch (_) {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return null;
  }
};

const saveAdminSession = () => {
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
    role: 'admin',
    created_at: new Date().toISOString(),
  }));
};

const withTimeout = (promise, timeoutMs, timeoutMessage) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const applyUser = (nextUser) => {
    setUser(nextUser);
    setIsAuthenticated(!!nextUser);
    setAuthError(nextUser ? null : { type: 'auth_required', message: 'Non connecte' });
  };

  const checkAppState = async () => {
    setIsLoadingAuth(true);
    try {
      clearLegacyBrowserAuth();

      const adminUser = readAdminSession();
      if (adminUser) {
        applyUser(adminUser);
        return;
      }

      const codeSessionUser = await withTimeout(
        getStoredIdentificationSession(),
        3000,
        'Session livreur locale indisponible'
      );
      if (codeSessionUser) {
        applyUser(codeSessionUser);
        return;
      }

      applyUser(null);
    } catch (error) {
      console.error('[SILGAPP2 Auth] Startup auth check failed:', error);
      clearIdentificationSession();
      applyUser(null);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    checkAppState();
  }, []);

  const signInAsAdmin = async ({ identifier, pin }) => {
    setIsLoadingAuth(true);
    try {
      const normalizedIdentifier = normalize(identifier);
      const validIdentifier = normalizedIdentifier === adminConfig.identifier || normalizedIdentifier === adminConfig.email;

      if (!validIdentifier || String(pin || '') !== adminConfig.pin) {
        const error = new Error('Identifiant admin ou PIN incorrect.');
        error.code = 'invalid_admin_credentials';
        throw error;
      }

      clearIdentificationSession();
      saveAdminSession();
      const adminUser = buildAdminUser();
      applyUser(adminUser);
      return adminUser;
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const signInWithIdentificationCode = async (code) => {
    setIsLoadingAuth(true);
    try {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      const codeUser = await signInWithStoredIdentificationCode(code);
      applyUser(codeUser);
      return codeUser;
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const logout = async () => {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    clearIdentificationSession();
    clearLegacyBrowserAuth();
    applyUser(null);
    setAuthChecked(true);
  };

  const value = useMemo(() => ({
    user,
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings: false,
    authError,
    appPublicSettings: null,
    authChecked,
    logout,
    navigateToLogin: () => {},
    checkUserAuth: checkAppState,
    checkAppState,
    signInAsAdmin,
    signInWithIdentificationCode,
  }), [user, isAuthenticated, isLoadingAuth, authError, authChecked]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
