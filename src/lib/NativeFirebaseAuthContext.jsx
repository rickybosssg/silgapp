import React, { useEffect, useMemo, useState } from 'react';
import { NativeFirebaseAuth } from '@/lib/nativeFirebaseAuthClient';
import { AuthContext } from '@/lib/AuthContext';
import { resolveNativeAuthorizedUser } from '@/lib/nativeAccessResolver';

export const NativeFirebaseAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const applyFirebaseUser = async (firebaseUser) => {
    if (!firebaseUser) {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Non connecte' });
      return null;
    }

    try {
      const authorizedUser = await resolveNativeAuthorizedUser(firebaseUser);
      setUser(authorizedUser);
      setIsAuthenticated(true);
      setAuthError(null);
      return authorizedUser;
    } catch (error) {
      console.error('[NativeFirebaseAuth] Access resolution failed:', error);
      await NativeFirebaseAuth.signOut();
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({
        type: error?.code === 'user_not_registered' ? 'user_not_registered' : 'auth_required',
        message: error?.message || 'Compte non autorise. Contactez l administrateur.',
      });
      return null;
    }
  };

  const checkAppState = async () => {
    try {
      setIsLoadingAuth(true);
      const result = await NativeFirebaseAuth.getCurrentUser();
      await applyFirebaseUser(result.user);
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
