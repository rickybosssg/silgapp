const SESSION_KEY = 'silgapp_code_identification_session';

export const isCapacitorAvailable = () => {
  try {
    if (typeof window === 'undefined') return false;
    const win = window;
    return !!(win.Capacitor && win.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
};

const getPreferences = async () => {
  if (!isCapacitorAvailable()) {
    throw new Error('Capacitor not available');
  }
  const { Preferences } = await import('npm:@capacitor/preferences@5.0.7');
  return Preferences;
};

export const saveSessionNative = async (sessionData) => {
  console.log('[CapacitorStorage] ========== SAVE SESSION START ==========');
  console.log('[CapacitorStorage] Session data to save:', JSON.stringify(sessionData));
  
  try {
    console.log('[CapacitorStorage] Checking Capacitor availability...');
    if (!isCapacitorAvailable()) {
      console.error('[CapacitorStorage] ❌ Capacitor NOT available!');
      return false;
    }
    console.log('[CapacitorStorage] ✅ Capacitor available');
    
    console.log('[CapacitorStorage] Importing Preferences module...');
    const Preferences = await getPreferences();
    console.log('[CapacitorStorage] ✅ Preferences module loaded');
    
    console.log('[CapacitorStorage] Calling Preferences.set...');
    await Preferences.set({
      key: SESSION_KEY,
      value: JSON.stringify(sessionData),
    });
    console.log('[CapacitorStorage] ✅ Preferences.set() completed');
    
    // Immediate verification
    console.log('[CapacitorStorage] Immediate verification...');
    const { value } = await Preferences.get({ key: SESSION_KEY });
    console.log('[CapacitorStorage] Verification result:', value ? '✅ Session found' : '❌ Session NOT found');
    if (value) {
      console.log('[CapacitorStorage] Verified content:', value.substring(0, 150) + '...');
      try {
        const parsed = JSON.parse(value);
        console.log('[CapacitorStorage] Verified parsed:', JSON.stringify(parsed));
      } catch (e) {
        console.error('[CapacitorStorage] Failed to parse verified content:', e.message);
      }
    }
    
    console.log('[CapacitorStorage] ========== SAVE SESSION COMPLETE ==========');
    return true;
  } catch (error) {
    console.error('[CapacitorStorage] ❌ SAVE SESSION FAILED:', error.message);
    console.error('[CapacitorStorage] Stack:', error.stack);
    return false;
  }
};

export const getSessionNative = async () => {
  try {
    const Preferences = await getPreferences();
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
    const Preferences = await getPreferences();
    await Preferences.remove({ key: SESSION_KEY });
    console.log('[CapacitorStorage] Session removed');
  } catch (error) {
    console.error('[CapacitorStorage] Failed to remove session:', error);
  }
};

export const clearAllSessions = async () => {
  try {
    const Preferences = await getPreferences();
    await Preferences.clear();
    console.log('[CapacitorStorage] All sessions cleared');
  } catch (error) {
    console.error('[CapacitorStorage] Failed to clear all:', error);
  }
};