import { useEffect, useState } from 'react';
import {
  clearIdentificationSession,
  getStoredIdentificationSession,
  signInWithIdentificationCode as signInWithStoredIdentificationCode,
} from '@/lib/codeIdentificationAuth';
import { clearAllSessions } from '@/lib/capacitorStorage';

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

export const useSilgappAuth = () => {
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
    setIsLoadingAuth(true);
    try {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      console.log('[SilgappAuth] Signing in livreur with code:', code);
      const codeUser = await signInWithStoredIdentificationCode(code);
      console.log('[SilgappAuth] ✅ Livreur signed in:', codeUser.full_name, 'role:', codeUser.role, 'livreur_id:', codeUser.livreur_id);
      applyUser(codeUser);
      return codeUser;
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

  return {
    user,
    isAuthenticated,
    isLoadingAuth,
    authChecked,
    checkAppState,
    signInAsAdmin,
    signInWithIdentificationCode,
    logout,
  };
};