import { base44 } from '@/api/base44Client';
import { isNativeLivreurRuntime, verifyNativeLivreurCode } from '@/lib/nativeLivreurApi';

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

const saveSession = (livreur) => {
  const sessionData = {
    livreur_id: livreur.id,
    nom: getLivreurName(livreur),
    role: 'livreur',
    code_identification: livreur.code_identification || '',
    email: getLivreurNotificationEmail(livreur),
    created_at: new Date().toISOString(),
  };
  
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    console.log('[CodeIdentificationAuth] Session saved:', sessionData.livreur_id, sessionData.code_identification);
  } catch (error) {
    console.error('[CodeIdentificationAuth] Failed to save session:', error);
  }
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

  console.log('[CodeIdentificationAuth] findLivreurByIdentificationCode - code:', normalizedCode);
  console.log('[CodeIdentificationAuth] isNativeLivreurRuntime:', isNativeLivreurRuntime());

  if (isNativeLivreurRuntime()) {
    console.log('[CodeIdentificationAuth] Using NATIVE path (verifyNativeLivreurCode)');
    try {
      const livreur = await verifyNativeLivreurCode(normalizedCode);
      console.log('[CodeIdentificationAuth] Native path result:', livreur ? `SUCCESS - ${livreur.nom} ${livreur.prenom}` : 'FAILED - null');
      return livreur;
    } catch (error) {
      console.error('[CodeIdentificationAuth] Native path exception:', error.message);
      throw error;
    }
  }

  console.log('[CodeIdentificationAuth] Using WEB path (findLivreurByCode)');
  try {
    console.log('[CodeIdentificationAuth] Calling backend function findLivreurByCode:', normalizedCode);
    const response = await base44.functions.invoke('findLivreurByCode', { code: normalizedCode });
    console.log('[CodeIdentificationAuth] Backend response:', response.data);
    return response.data || null;
  } catch (error) {
    console.warn('[CodeIdentificationAuth] Backend lookup failed:', error?.message);
    
    try {
      const directMatches = await base44.entities.Livreur.filter({ code_identification: normalizedCode });
      const directMatch = directMatches?.find(
        (livreur) => normalizeCode(livreur.code_identification) === normalizedCode
      );
      if (directMatch) {
        console.log('[CodeIdentificationAuth] Fallback filter succeeded:', directMatch.nom);
        return directMatch;
      }
    } catch (fallbackError) {
      console.warn('[CodeIdentificationAuth] Fallback filter failed:', fallbackError?.message);
    }

    console.log('[CodeIdentificationAuth] Trying list predicate fallback...');
    return findLivreurByPredicate(
      (livreur) => normalizeCode(livreur.code_identification) === normalizedCode
    );
  }
};

export const signInWithIdentificationCode = async (code) => {
  console.log('[CodeIdentificationAuth] ========== SIGN IN START ==========');
  console.log('[CodeIdentificationAuth] Attempting sign in with code:', code);
  
  const livreur = await findLivreurByIdentificationCode(code);
  if (!livreur) {
    console.error('[CodeIdentificationAuth] ❌ FAILED - No livreur found with code:', code);
    console.log('[CodeIdentificationAuth] ========== SIGN IN FAILED ==========');
    const error = new Error("Code d'identification incorrect.");
    error.code = 'invalid_identification_code';
    throw error;
  }

  console.log('[CodeIdentificationAuth] ✅ Livreur found:', livreur.nom, livreur.prenom, '(ID:', livreur.id + ')');
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

  saveSession(livreur);
  const user = toCodeUser(livreur);
  console.log('[CodeIdentificationAuth] ✅ Session saved for:', user.full_name);
  console.log('[CodeIdentificationAuth] ✅ User object created:', {
    id: user.id,
    role: user.role,
    livreur_id: user.livreur_id,
    code_identification: user.code_identification
  });
  console.log('[CodeIdentificationAuth] ========== SIGN IN SUCCESS ==========');
  return user;
};

export const getStoredIdentificationSession = async () => {
  console.log('[CodeIdentificationAuth] ========== SESSION RESTORE CHECK ==========');
  let rawSession = null;
  
  try {
    rawSession = localStorage.getItem(SESSION_KEY);
    if (rawSession) {
      console.log('[CodeIdentificationAuth] ✅ Raw session found in localStorage:', rawSession.substring(0, 100) + '...');
    } else {
      console.log('[CodeIdentificationAuth] ❌ No session in localStorage');
      console.log('[CodeIdentificationAuth] ========== SESSION RESTORE: NO SESSION ==========');
      return null;
    }
  } catch (error) {
    console.error('[CodeIdentificationAuth] Session read failed:', error?.message);
    console.log('[CodeIdentificationAuth] ========== SESSION RESTORE FAILED ==========');
    return null;
  }
  
  if (!rawSession) {
    return null;
  }

  try {
    const session = JSON.parse(rawSession);
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

    saveSession(livreur);
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

export const clearIdentificationSession = () => {
  try {
    localStorage.removeItem(SESSION_KEY);
    console.log('[CodeIdentificationAuth] Session cleared');
  } catch (error) {
    console.error('[CodeIdentificationAuth] Failed to clear session:', error);
  }
};

export const isIdentificationCodeAlreadyUsed = async (code, ignoredLivreurId = null) => {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return false;

  const livreur = await findLivreurByIdentificationCode(normalizedCode);
  return !!livreur && livreur.id !== ignoredLivreurId;
};