/**
 * Stub sans authentification.
 * Toute la logique d'auth/session a été supprimée.
 * L'application est maintenant sans authentification.
 */
import { createContext, useContext } from 'react';

const AuthContext = createContext({
  user: null,
  logout: () => {},
});

export const SilgappAuthProvider = ({ children }) => children;

export const useSilgappAuth = () => useContext(AuthContext);
