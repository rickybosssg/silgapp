import { base44 } from '@/api/base44Client';
import { isNativeLivreurRuntime, verifyNativeLivreurCode } from '@/lib/nativeLivreurApi';
import { saveSessionNative, getSessionNative, removeSessionNative, isCapacitorAvailable } from '@/lib/capacitorStorage';
import { verifyCodeLocalement } from '@/lib/livreursLocaux';

const SESSION_KEY = 'silgapp_code_identification_session';

const normalizeCode = (value) => (value || '').trim().toUpperCase();

const getLivreurName = (livreur) => {
  const fullName = `${livreur?.prenom || ''} ${livreur?.nom || ''}`.trim();
  return fullName || livreur?.nom || 'Livreur';
};

export const getLivreurNotificationEmail = (livreur) => {
  if (livreur?.user_email) return livreur.user_email.trim().toLowerCase();
  if (livreur?.id) return `livreur-${livreur.id}@silgapp2.local`;
  return '';
};

const toCodeUser = (livreur) => ({
  id: `livreur:${livreur.id}`,
  role: 'livreur',
  full_name: getLivreurName(livreur),
  name: getLivreurName(livreur),
  email: getLivreurNotificationEmail(livreur),
  livreur_id: livreur.id,
  code_identification: livreur.code_identification || '',
  auth_provider: 'code_identification',
  livreur,
});

const saveSession = async (livreur) => {
  const sessionData = {
    livreur_id: livreur.id,
    nom: getLivreurName(livreur),
    role: 'livreur',
    code_identification: livreur.code_identification || '',
    email: getLivreurNotificationEmail(livreur),
    created_at: new Date().toISOString(),
  };
  
  const isNative = isCapacitorAvailable();
  console.log('[CodeIdentificationAuth] saveSession - isNative:', isNative);
  console.log('[CodeIdentificationAuth] Session data to save:', JSON.stringify(sessionData));
  
  if (isNative) {
    console.log('[CodeIdentificationAuth] Using NATIVE storage (Capacitor Preferences)');
    const saveResult = await saveSessionNative(sessionData);
    console.log('[CodeIdentificationAuth] Capacitor save result:', saveResult);
  } else {
    console.log('[CodeIdentificationAuth] Using WEB storage (localStorage)');
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
      console.log('[CodeIdentificationAuth] Session saved to localStorage');
      
      // Immediate verification
      const verify = localStorage.getItem(SESSION_KEY);
      console.log('[CodeIdentificationAuth] Immediate verification:', verify ? '✅ Session found' : '❌ Session NOT found');
    } catch (error) {
      console.error('[CodeIdentificationAuth] localStorage save failed:', error);
    }
  }
  
  console.log('[CodeIdentificationAuth] ✅ Session saved for:', sessionData.livreur_id, sessionData.code_identification);
};

const findLivreurByPredicate = async (predicate) => {
  const livreurs = await base44.entities.Livreur.list('-created_date', 500);
  return livreurs.find(predicate) || null;
};

export const findLivreurByIdentificationCode = async (code) => {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    console.warn('[CodeIdentificationAuth] Empty code provided');
    return null;
  }

  console.log('[CodeIdentificationAuth] ========== FIND LIVREUR START ==========');
  console.log('[CodeIdentificationAuth] Code normalized:', normalizedCode);

  // ÉTAPE 1: Vérification LOCALE (priorité - comme admin)
  console.log('[CodeIdentificationAuth] ÉTAPE 1: Vérification LOCALE...');
  const livreurLocal = await verifyCodeLocalement(normalizedCode);
  
  if (livreurLocal) {
    console.log('[CodeIdentificationAuth] ✅ MATCH LOCAL TROUVÉ:', livreurLocal.nom, livreurLocal.prenom);
    console.log('[CodeIdentificationAuth] ========== FIND LIVREUR SUCCESS (LOCAL) ==========');
    return livreurLocal;
  }

  console.log('[CodeIdentificationAuth] ❌ Pas de match local, fallback vers backend...');

  // ÉTAPE 2: Backend (fallback)
  try {
    if (isNativeLivreurRuntime()) {
      console.log('[CodeIdentificationAuth] Using NATIVE path (verifyNativeLivreurCode)');
      const livreur = await verifyNativeLivreurCode(normalizedCode);
      if (livreur) {
        console.log('[CodeIdentificationAuth] ✅ Native path SUCCESS:', livreur.nom);
        console.log('[CodeIdentificationAuth] ========== FIND LIVREUR SUCCESS ==========');
        return livreur;
      }
    }

    console.log('[CodeIdentificationAuth] Using WEB path (findLivreurByCode)');
    const response = await base44.functions.invoke('findLivreurByCode', { code: normalizedCode });
    
    if (response?.success === true && response?.livreur) {
      console.log('[CodeIdentificationAuth] ✅ Backend SUCCESS:', response.livreur.nom);
      console.log('[CodeIdentificationAuth] ========== FIND LIVREUR SUCCESS ==========');
      return response.livreur;
    }
  } catch (error) {
    console.error('[CodeIdentificationAuth] Backend lookup failed:', error?.message);
  }

  console.log('[CodeIdentificationAuth] ❌ ALL LOOKUPS FAILED');
  console.log('[CodeIdentificationAuth] ========== FIND LIVREUR FAILED ==========');
  return null;
};

export const signInWithIdentificationCode = async (code) => {
  console.log('[CodeIdentificationAuth] ========== SIGN IN START ==========');
  console.log('[CodeIdentificationAuth] Attempting sign in with code:', code);
  
  try {
    console.log('[CodeIdentificationAuth] APPEL findLivreurByIdentificationCode...');
    const livreur = await findLivreurByIdentificationCode(code);
    
    console.log('[CodeIdentificationAuth] RÉPONSE backend reçue');
    
    if (!livreur) {
      console.error('[CodeIdentificationAuth] ❌ FAILED - No livreur found with code:', code);
      console.log('[CodeIdentificationAuth] Backend response: NULL');
      console.log('[CodeIdentificationAuth] ========== SIGN IN FAILED ==========');
      const error = new Error("Code d'identification incorrect.");
      error.code = 'invalid_identification_code';
      throw error;
    }

    console.log('[CodeIdentificationAuth] ✅ Livreur found:', livreur.nom, livreur.prenom, '(ID:', livreur.id + ')');
    console.log('[CodeIdentificationAuth] Code registered:', livreur.code_identification);
    console.log('[CodeIdentificationAuth] Validation status:', livreur.validation);
    console.log('[CodeIdentificationAuth] Account active:', livreur.actif);
    
    if (livreur.validation !== 'valide') {
      console.error('[CodeIdentificationAuth] ❌ FAILED - Livreur not validated:', livreur.id);
      console.log('[CodeIdentificationAuth] ========== SIGN IN FAILED ==========');
      const error = new Error("Compte livreur non valide. Attendez la validation de l'administrateur.");
      error.code = 'invalid_livreur_validation';
      throw error;
    }

    if (livreur.actif === false) {
      console.error('[CodeIdentificationAuth] ❌ FAILED - Livreur account inactive:', livreur.id);
      console.log('[CodeIdentificationAuth] ========== SIGN IN FAILED ==========');
      const error = new Error("Compte livreur desactive. Contactez l'administrateur.");
      error.code = 'disabled_livreur';
      throw error;
    }

    console.log('[CodeIdentificationAuth] Saving session...');
    await saveSession(livreur);
    
    console.log('[CodeIdentificationAuth] SESSION_CREATED: Lecture immédiate pour vérification...');
    const verifySession = await getSessionNative();
    if (verifySession) {
      console.log('[CodeIdentificationAuth] ✅ SESSION VÉRIFIÉE:', verifySession.livreur_id);
    } else {
      console.error('[CodeIdentificationAuth] ❌ SESSION NON TROUVÉE après sauvegarde!');
    }
    
    const user = toCodeUser(livreur);
    console.log('[CodeIdentificationAuth] ✅ User object created:', {
      id: user.id,
      role: user.role,
      livreur_id: user.livreur_id,
      code_identification: user.code_identification
    });
    console.log('[CodeIdentificationAuth] ========== SIGN IN SUCCESS ==========');
    return user;
  } catch (error) {
    console.error('[CodeIdentificationAuth] ❌ SIGN IN EXCEPTION:', error.message);
    console.error('[CodeIdentificationAuth] Stack:', error.stack);
    throw error;
  }
};

export const getStoredIdentificationSession = async () => {
  console.log('[CodeIdentificationAuth] ========== SESSION RESTORE CHECK ==========');
  const isNative = isCapacitorAvailable();
  console.log('[CodeIdentificationAuth] isNative:', isNative);
  
  let session = null;
  
  if (isNative) {
    console.log('[CodeIdentificationAuth] Using NATIVE storage (Capacitor Preferences)');
    try {
      session = await getSessionNative();
      if (session) {
        console.log('[CodeIdentificationAuth] ✅ Session found in Capacitor:', session.livreur_id);
      } else {
        console.log('[CodeIdentificationAuth] ❌ No session in Capacitor');
      }
    } catch (error) {
      console.error('[CodeIdentificationAuth] Capacitor session read failed:', error?.message);
      console.log('[CodeIdentificationAuth] ========== SESSION RESTORE FAILED ==========');
      return null;
    }
  } else {
    console.log('[CodeIdentificationAuth] Using WEB storage (localStorage)');
    try {
      const rawSession = localStorage.getItem(SESSION_KEY);
      if (rawSession) {
        console.log('[CodeIdentificationAuth] ✅ Raw session found in localStorage:', rawSession.substring(0, 100) + '...');
        session = JSON.parse(rawSession);
      } else {
        console.log('[CodeIdentificationAuth] ❌ No session in localStorage');
      }
    } catch (error) {
      console.error('[CodeIdentificationAuth] localStorage read failed:', error?.message);
      console.log('[CodeIdentificationAuth] ========== SESSION RESTORE FAILED ==========');
      return null;
    }
  }
  
  if (!session) {
    console.log('[CodeIdentificationAuth] ========== SESSION RESTORE: NO SESSION ==========');
    return null;
  }

  try {
    console.log('[CodeIdentificationAuth] Parsed session:', JSON.stringify(session, null, 2));
    
    if (!session?.livreur_id) {
      console.warn('[CodeIdentificationAuth] Invalid session - no livreur_id');
      clearIdentificationSession();
      console.log('[CodeIdentificationAuth] ========== SESSION RESTORE: INVALID ==========');
      return null;
    }

    console.log('[CodeIdentificationAuth] Fetching livreur data for session:', session.livreur_id);
    const livreur = await findLivreurByPredicate((item) => item.id === session.livreur_id);
    if (!livreur) {
      console.error('[CodeIdentificationAuth] ❌ Livreur not found for session:', session.livreur_id);
      clearIdentificationSession();
      console.log('[CodeIdentificationAuth] ========== SESSION RESTORE: LIVREUR NOT FOUND ==========');
      return null;
    }
    
    console.log('[CodeIdentificationAuth] ✅ Livreur found for session:', livreur.nom, livreur.actif);
    if (livreur.actif === false) {
      console.error('[CodeIdentificationAuth] ❌ Livreur account is inactive:', session.livreur_id);
      clearIdentificationSession();
      console.log('[CodeIdentificationAuth] ========== SESSION RESTORE: ACCOUNT INACTIVE ==========');
      return null;
    }

    await saveSession(livreur);
    const user = toCodeUser(livreur);
    console.log('[CodeIdentificationAuth] ✅ Session restored successfully for:', user.full_name, user.code_identification);
    console.log('[CodeIdentificationAuth] ========== SESSION RESTORE SUCCESS ==========');
    return user;
  } catch (error) {
    console.error('[CodeIdentificationAuth] Stored session restore failed:', error?.message);
    clearIdentificationSession();
    console.log('[CodeIdentificationAuth] ========== SESSION RESTORE ERROR ==========');
    return null;
  }
};

export const clearIdentificationSession = async () => {
  const isNative = isCapacitorAvailable();
  console.log('[CodeIdentificationAuth] clearIdentificationSession - isNative:', isNative);
  
  if (isNative) {
    console.log('[CodeIdentificationAuth] Using NATIVE storage clear (Capacitor Preferences)');
    await removeSessionNative();
  } else {
    console.log('[CodeIdentificationAuth] Using WEB storage clear (localStorage)');
    try {
      localStorage.removeItem(SESSION_KEY);
      console.log('[CodeIdentificationAuth] localStorage session cleared');
    } catch (error) {
      console.error('[CodeIdentificationAuth] localStorage clear failed:', error);
    }
  }
  
  console.log('[CodeIdentificationAuth] ✅ Session cleared');
};

export const isIdentificationCodeAlreadyUsed = async (code, ignoredLivreurId = null) => {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return false;

  const livreur = await findLivreurByIdentificationCode(normalizedCode);
  return !!livreur && livreur.id !== ignoredLivreurId;
};