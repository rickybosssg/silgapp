import { registerPlugin } from '@capacitor/core';

export const NativeFirebaseAuth = registerPlugin('NativeFirebaseAuth', {
  web: () => ({
    async getCurrentUser() {
      return { user: null };
    },
    async signInWithGoogle() {
      throw new Error('Google Sign-In natif disponible uniquement dans l APK Android.');
    },
    async signInWithEmailAndPassword() {
      throw new Error('Firebase Auth natif disponible uniquement dans l APK Android.');
    },
    async createUserWithEmailAndPassword() {
      throw new Error('Firebase Auth natif disponible uniquement dans l APK Android.');
    },
    async signOut() {
      return {};
    },
  }),
});
