import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  clearIdentificationSession,
  getStoredIdentificationSession,
  signInWithIdentificationCode as signInWithStoredIdentificationCode,
} from '@/lib/codeIdentificationAuth';
import { clearAllSessions } from '@/lib/capacitorStorage';
import { verifyCodeLocalement, syncLivreursLocaux, getLivreursLocaux, isCacheValide } from '@/lib/livreursLocaux';

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

  /**
   * Synchronise les codes livreurs depuis la base de données
   * À appeler après connexion admin ou manuellement
   */
  const syncLivreursCodes = async () => {
    console.log('[SilgappAuth] ========== SYNC LIVREURS ==========');
    try {
      const result = await syncLivreursLocaux();
      console.log('[SilgappAuth] ✅ Sync complete:', result.count, 'livreurs');
      return result;
    } catch (error) {
      console.error('[SilgappAuth] ❌ Sync failed:', error.message);
      throw error;
    }
  };

  /**
   * Vérifie si le cache des livreurs est valide
   */
  const checkLivreursCache = async () => {
    const isValid = await isCacheValide(60); // 60 minutes
    const livreurs = await getLivreursLocaux();
    return {
      valid: isValid,
      count: livreurs?.length || 0,
      empty: !livreurs || livreurs.length === 0
    };
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
      
      // ÉTAPE 1: Vérification LOCALE (comme admin)
      console.log('[SilgappAuth] ÉTAPE 1: Vérification LOCALE du code...');
      const livreurLocal = await verifyCodeLocalement(code);
      
      if (livreurLocal) {
        console.log('[SilgappAuth] ✅ MATCH LOCAL TROUVÉ:', livreurLocal.nom, livreurLocal.prenom);
        console.log('[SilgappAuth] Livreur ID:', livreurLocal.id);
        
        // Créer l'utilisateur directement depuis le cache local
        const codeUser = {
          id: `livreur:${livreurLocal.id}`,
          role: 'livreur',
          full_name: `${livreurLocal.prenom} ${livreurLocal.nom}`.trim(),
          name: `${livreurLocal.prenom} ${livreurLocal.nom}`.trim(),
          email: livreurLocal.user_email || `livreur-${livreurLocal.id}@silgapp2.local`,
          livreur_id: livreurLocal.id,
          code_identification: livreurLocal.code_identification,
          auth_provider: 'code_identification_local',
          livreur: livreurLocal
        };
        
        console.log('[SilgappAuth] ✅ User object created from LOCAL cache');
        applyUser(codeUser);
        console.log('[SilgappAuth] ========== SIGN IN FLOW COMPLETE (LOCAL) ==========');
        return codeUser;
      }
      
      // ÉTAPE 2: Si cache vide, essayer de synchroniser
      console.log('[SilgappAuth] ❌ Pas de match local');
      const livreurs = await getLivreursLocaux();
      
      if (!livreurs || livreurs.length === 0) {
        console.warn('[SilgappAuth] ⚠️ Cache local VIDE');
        const error = new Error("Aucun code livreur enregistré. Synchronisation nécessaire.");
        error.code = 'livreurs_cache_empty';
        throw error;
      }
      
      // ÉTAPE 3: Code incorrect
      console.log('[SilgappAuth] ❌ Code incorrect dans le cache');
      const error = new Error("Code d'identification incorrect.");
      error.code = 'invalid_identification_code';
      throw error;
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
    value: { 
      user, 
      isAuthenticated, 
      isLoadingAuth, 
      authChecked, 
      checkAppState, 
      signInAsAdmin, 
      signInWithIdentificationCode, 
      logout,
      syncLivreursCodes,
      checkLivreursCache
    },
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