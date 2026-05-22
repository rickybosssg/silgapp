import React, { useEffect, useMemo, useState } from 'react';
import { NativeFirebaseAuth } from '@/lib/nativeFirebaseAuthClient';
import { AuthContext } from '@/lib/AuthContext';

const ROLE_STORAGE_KEY = 'silgapp_native_user_role';

const normalizeFirebaseUser = (firebaseUser) => {
  if (!firebaseUser) return null;

  const adminEmails = (import.meta.env.VITE_NATIVE_AUTH_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const email = firebaseUser.email || '';
  const storedRole = localStorage.getItem(ROLE_STORAGE_KEY);
  const defaultRole = import.meta.env.VITE_NATIVE_AUTH_DEFAULT_ROLE || 'admin';
  const role = storedRole || (adminEmails.includes(email.toLowerCase()) ? 'admin' : defaultRole);

  return {
    id: firebaseUser.uid,
    firebase_uid: firebaseUser.uid,
    email,
    full_name: firebaseUser.displayName || email,
    name: firebaseUser.displayName || email,
    photo_url: firebaseUser.photoUrl,
    role,
    auth_provider: 'firebase-native',
  };
};

export const NativeFirebaseAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const applyFirebaseUser = (firebaseUser) => {
    const normalizedUser = normalizeFirebaseUser(firebaseUser);
    setUser(normalizedUser);
    setIsAuthenticated(!!normalizedUser);
    setAuthError(normalizedUser ? null : { type: 'auth_required', message: 'Non connecte' });
    return normalizedUser;
  };

  const checkAppState = async () => {
    try {
      setIsLoadingAuth(true);
      const result = await NativeFirebaseAuth.getCurrentUser();
      applyFirebaseUser(result.user);
    } catch (error) {
      console.error('[NativeFirebaseAuth] Startup auth check failed:', error);
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: error?.message || 'Non connecte' });
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    checkAppState();
  }, []);

  const signInWithGoogle = async () => {
    setIsLoadingAuth(true);
    try {
      const result = await NativeFirebaseAuth.signInWithGoogle();
      return applyFirebaseUser(result.user);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const signInWithEmailAndPassword = async (email, password) => {
    setIsLoadingAuth(true);
    try {
      const result = await NativeFirebaseAuth.signInWithEmailAndPassword({ email, password });
      return applyFirebaseUser(result.user);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const createUserWithEmailAndPassword = async (email, password) => {
    setIsLoadingAuth(true);
    try {
      const result = await NativeFirebaseAuth.createUserWithEmailAndPassword({ email, password });
      return applyFirebaseUser(result.user);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const logout = async () => {
    await NativeFirebaseAuth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    setAuthError({ type: 'auth_required', message: 'Deconnecte' });
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
    signInWithGoogle,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    isNativeFirebaseAuth: true,
  }), [user, isAuthenticated, isLoadingAuth, authError, authChecked]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
