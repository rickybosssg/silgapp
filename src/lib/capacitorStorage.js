import { Preferences } from '@capacitor/preferences';

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
  if (!isCapacitorAvailable()) return false;
  try {
    await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(sessionData) });
    return true;
  } catch (error) {
    console.error('[CapacitorStorage] saveSession failed:', error.message);
    return false;
  }
};

export const getSessionNative = async () => {
  if (!isCapacitorAvailable()) return null;
  try {
    const { value } = await Preferences.get({ key: SESSION_KEY });
    if (!value) return null;
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const removeSessionNative = async () => {
  if (!isCapacitorAvailable()) return;
  try {
    await Preferences.remove({ key: SESSION_KEY });
  } catch (error) {
    console.error('[CapacitorStorage] removeSession failed:', error.message);
  }
};

export const clearAllSessions = async () => {
  if (!isCapacitorAvailable()) return;
  try {
    await Preferences.clear();
  } catch (error) {
    console.error('[CapacitorStorage] clearAll failed:', error.message);
  }
};