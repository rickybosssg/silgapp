// Stockage session — utilise localStorage (compatible APK Base44 natif)
const SESSION_KEY = 'silgapp_code_identification_session';

export const isCapacitorAvailable = () => {
  try {
    if (typeof window === 'undefined') return false;
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
};

export const saveSessionNative = async (sessionData) => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    return true;
  } catch {
    return false;
  }
};

export const getSessionNative = async () => {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    if (!value) return null;
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const removeSessionNative = async () => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
};

export const clearAllSessions = async () => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
};