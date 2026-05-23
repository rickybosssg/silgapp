import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  clearIdentificationSession,
  getStoredIdentificationSession,
  signInWithIdentificationCode as signInWithStoredIdentificationCode,
} from '@/lib/codeIdentificationAuth';
import { clearAllSessions } from '@/lib/capacitorStorage';

const AuthContext = createContext(null);

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

const clearLegacyBrowserAuth = async () => {
  LEGACY_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
  try {
    await clearAllSessions();
  } catch (error) {
    console.warn('[SilgappAuth] Failed to clear Capacitor sessions:', error);
  }
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

export const SilgappAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  const applyUser = (nextUser) => {
    setUser(nextUser);
    setIsAuthenticated(!!nextUser);
  };

  const checkAppState = async () => {
    setIsLoadingAuth(true);
    try {
      await clearLegacyBrowserAuth();

      const adminUser = readAdminSession();
      if (adminUser) {
        console.log('[SilgappAuth] ✅ Admin session restored');
        applyUser(adminUser);
        return;
      }

      console.log('[SilgappAuth] Checking livreur session...');
      const codeSessionUser = await getStoredIdentificationSession();
      if (codeSessionUser) {
        console.log('[SilgappAuth] ✅ Livreur session restored:', codeSessionUser.full_name, 'role:', codeSessionUser.role);
        applyUser(codeSessionUser);
        return;
      }

      console.log('[SilgappAuth] ❌ No session found');
      applyUser(null);
    } catch (error) {
      console.error('[SilgappAuth] Startup auth check failed:', error);
      await clearIdentificationSession();
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

      await clearIdentificationSession();
      saveAdminSession();
      const adminUser = buildAdminUser();
      console.log('[SilgappAuth] ✅ Admin signed in:', adminUser.full_name);
      applyUser(adminUser);
      return adminUser;
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const signInWithIdentificationCode = async (code) => {
    console.log('[SilgappAuth] ========== SIGN IN FLOW START ==========');
    console.log('[SilgappAuth] START_LOGIN: Code reçu:', code);
    setIsLoadingAuth(true);
    try {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      console.log('[SilgappAuth] Admin session cleared');
      
      console.log('[SilgappAuth] APPEL findLivreurByCode...');
      const codeUser = await signInWithStoredIdentificationCode(code);
      
      console.log('[SilgappAuth] RÉPONSE backend: Livreur trouvé:', codeUser.full_name);
      console.log('[SilgappAuth] User data:', JSON.stringify({
        id: codeUser.id,
        role: codeUser.role,
        livreur_id: codeUser.livreur_id,
        code_identification: codeUser.code_identification
      }));
      
      console.log('[SilgappAuth] SESSION_CREATED: Application du user...');
      applyUser(codeUser);
      
      console.log('[SilgappAuth] NAVIGATION dashboard: isAuthenticated=', !!codeUser);
      console.log('[SilgappAuth] ========== SIGN IN FLOW COMPLETE ==========');
      
      return codeUser;
    } catch (error) {
      console.error('[SilgappAuth] ❌ SIGN IN FAILED:', error.message);
      console.error('[SilgappAuth] Stack:', error.stack);
      throw error;
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const logout = async () => {
    console.log('[SilgappAuth] Logging out...');
    localStorage.removeItem(ADMIN_SESSION_KEY);
    await clearIdentificationSession();
    await clearLegacyBrowserAuth();
    applyUser(null);
    setAuthChecked(true);
    console.log('[SilgappAuth] ✅ Logged out');
  };

  return React.createElement(AuthContext.Provider, {
    value: { user, isAuthenticated, isLoadingAuth, authChecked, checkAppState, signInAsAdmin, signInWithIdentificationCode, logout },
    children,
  });
};

export const useSilgappAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useSilgappAuth must be used within a SilgappAuthProvider');
  }
  return context;
};