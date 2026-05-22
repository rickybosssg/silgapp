import { registerPlugin } from '@capacitor/core';
import { FirebaseRestAuth } from '@/lib/firebaseRestAuth';

const NativeFirebaseAuthPlugin = registerPlugin('NativeFirebaseAuth', {
  web: () => ({
    async getCurrentUser() {
      return FirebaseRestAuth.getCurrentUser();
    },
    async signInWithGoogle() {
      throw new Error('Google Sign-In natif nécessite le plugin Android Firebase.');
    },
    async signInWithEmailAndPassword(options) {
      return FirebaseRestAuth.signInWithEmailAndPassword(options);
    },
    async createUserWithEmailAndPassword(options) {
      return FirebaseRestAuth.createUserWithEmailAndPassword(options);
    },
    async signOut() {
      return FirebaseRestAuth.signOut();
    },
  }),
});

const callNativeOrRest = async (method, options) => {
  try {
    return await NativeFirebaseAuthPlugin[method](options);
  } catch (error) {
    if (method === 'signInWithGoogle') throw error;
    console.warn(`[NativeFirebaseAuth] Plugin unavailable for ${method}, using Firebase REST fallback:`, error?.message);
    return FirebaseRestAuth[method](options);
  }
};

export const NativeFirebaseAuth = {
  getCurrentUser: () => callNativeOrRest('getCurrentUser'),
  signInWithGoogle: () => callNativeOrRest('signInWithGoogle'),
  signInWithEmailAndPassword: (options) => callNativeOrRest('signInWithEmailAndPassword', options),
  createUserWithEmailAndPassword: (options) => callNativeOrRest('createUserWithEmailAndPassword', options),
  signOut: () => callNativeOrRest('signOut'),
};
