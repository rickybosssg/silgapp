import { Preferences } from '@capacitor/preferences';

const SESSION_KEY = 'silgapp_code_identification_session';

export const isCapacitorAvailable = () => {
  try {
    return !!Preferences;
  } catch {
    return false;
  }
};

export const saveSessionNative = async (sessionData) => {
  try {
    console.log('[CapacitorStorage] Saving session:', sessionData.livreur_id);
    await Preferences.set({
      key: SESSION_KEY,
      value: JSON.stringify(sessionData),
    });
    console.log('[CapacitorStorage] ✅ Session saved successfully');
    return true;
  } catch (error) {
    console.error('[CapacitorStorage] ❌ Failed to save session:', error);
    return false;
  }
};

export const getSessionNative = async () => {
  try {
    const { value } = await Preferences.get({ key: SESSION_KEY });
    if (!value) {
      console.log('[CapacitorStorage] No session found');
      return null;
    }
    
    const session = JSON.parse(value);
    console.log('[CapacitorStorage] ✅ Session restored:', session.livreur_id);
    return session;
  } catch (error) {
    console.error('[CapacitorStorage] Failed to get session:', error);
    return null;
  }
};

export const removeSessionNative = async () => {
  try {
    await Preferences.remove({ key: SESSION_KEY });
    console.log('[CapacitorStorage] Session removed');
  } catch (error) {
    console.error('[CapacitorStorage] Failed to remove session:', error);
  }
};

export const clearAllSessions = async () => {
  try {
    await Preferences.clear();
    console.log('[CapacitorStorage] All sessions cleared');
  } catch (error) {
    console.error('[CapacitorStorage] Failed to clear all:', error);
  }
};