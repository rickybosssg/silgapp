import { Preferences } from '@capacitor/preferences';
import { base44 } from '@/api/base44Client';

const COOKIE_NAME = 'silgapp_auth_token';
const TOKEN_KEYS = ['base44_access_token', 'access_token', 'base44_token', 'token'];

/**
 * Persiste le token dans TROIS backends de stockage :
 * 1. localStorage — lu par le SDK Base44 (volatile sur Android WebView)
 * 2. document.cookie — sauvegarde synchrone, lue dans index.html avant tout module
 * 3. Capacitor Preferences — stockage natif (SharedPreferences/UserDefaults), survit aux redémarrages
 */
export function persistToken(token) {
  if (!token || token.length < 10) return;
  TOKEN_KEYS.forEach(key => {
    try { localStorage.setItem(key, token); } catch (_) {}
  });
  try {
    document.cookie = `${COOKIE_NAME}=${token}; path=/; max-age=31536000; SameSite=Lax`;
  } catch (_) {}
  try {
    Preferences.set({ key: COOKIE_NAME, value: token }).catch(() => {});
  } catch (_) {}
  try { base44.setToken?.(token); } catch (_) {}
}

/** Efface le token de tous les backends (logout explicite) */
export function clearPersistedToken() {
  TOKEN_KEYS.forEach(key => {
    try { localStorage.removeItem(key); } catch (_) {}
  });
  try {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  } catch (_) {}
  try {
    Preferences.remove({ key: COOKIE_NAME }).catch(() => {});
  } catch (_) {}
}

/** Restaure le token depuis le cookie (synchrone — appelé dans index.html) */
export function restoreTokenFromCookie() {
  try {
    const match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
    if (match && match[2] && match[2].length > 10) {
      const token = match[2];
      const current = localStorage.getItem('base44_access_token');
      if (!current || current.length < 10) {
        TOKEN_KEYS.forEach(key => {
          try { localStorage.setItem(key, token); } catch (_) {}
        });
        console.log('[AUTH] Token restauré depuis cookie');
      }
      return token;
    }
  } catch (_) {}
  return null;
}

/** Sync depuis Capacitor Preferences (asynchrone — appelé dans main.jsx avant render) */
export async function syncTokenFromPreferences() {
  try {
    const { value } = await Preferences.get({ key: COOKIE_NAME });
    if (value && value.length > 10) {
      const current = localStorage.getItem('base44_access_token');
      if (!current || current.length < 10) {
        TOKEN_KEYS.forEach(key => {
          try { localStorage.setItem(key, value); } catch (_) {}
        });
        console.log('[AUTH] Token restauré depuis Capacitor Preferences');
        try { base44.setToken?.(value); } catch (_) {}
        return value;
      }
    }
  } catch (_) {}
  return null;
}

/** Vérifie si un token persisté existe (cookie ou localStorage) */
export function hasPersistedToken() {
  try {
    const match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
    if (match && match[2] && match[2].length > 10) return true;
  } catch (_) {}
  for (const key of TOKEN_KEYS) {
    try {
      const t = localStorage.getItem(key);
      if (t && t.length > 10) return true;
    } catch (_) {}
  }
  return false;
}

/** Wrapper de logout — efface le token persisté puis déconnecte */
export async function logoutPersistent(redirectUrl) {
  clearPersistedToken();
  return base44.auth.logout(redirectUrl);
}
