// Stockage session — utilise @capacitor/preferences si natif, sinon localStorage
const SESSION_KEY = 'silgapp_code_identification_session';

export const isCapacitorAvailable = () => {
  try {
    if (typeof window === 'undefined') return false;
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
};

async function getPreferences() {
  if (isCapacitorAvailable()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      return Preferences;
    } catch {
      return null;
    }
  }
  return null;
}

export const saveSessionNative = async (sessionData) => {
  try {
    const Preferences = await getPreferences();
    if (Preferences) {
      await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(sessionData) });
    } else {
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    }
    return true;
  } catch {
    return false;
  }
};

export const getSessionNative = async () => {
  try {
    const Preferences = await getPreferences();
    if (Preferences) {
      const { value } = await Preferences.get({ key: SESSION_KEY });
      if (!value) return null;
      return JSON.parse(value);
    } else {
      const value = localStorage.getItem(SESSION_KEY);
      if (!value) return null;
      return JSON.parse(value);
    }
  } catch {
    return null;
  }
};

export const removeSessionNative = async () => {
  try {
    const Preferences = await getPreferences();
    if (Preferences) {
      await Preferences.remove({ key: SESSION_KEY });
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {}
};

export const clearAllSessions = async () => {
  try {
    const Preferences = await getPreferences();
    if (Preferences) {
      await Preferences.remove({ key: SESSION_KEY });
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {}
};