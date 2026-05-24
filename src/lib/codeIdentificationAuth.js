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
  
  if (isNative) {
    await saveSessionNative(sessionData);
  } else {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
  }
};

const findLivreurByPredicate = async (predicate) => {
  const livreurs = await base44.entities.Livreur.list('-created_date', 500);
  return livreurs.find(predicate) || null;
};

export const findLivreurByIdentificationCode = async (code) => {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    return null;
  }

  // ÉTAPE 1: Vérification LOCALE (priorité - comme admin)
  const livreurLocal = await verifyCodeLocalement(normalizedCode);
  
  if (livreurLocal) {
    return livreurLocal;
  }

  // ÉTAPE 2: Backend (fallback)
  try {
    if (isNativeLivreurRuntime()) {
      const livreur = await verifyNativeLivreurCode(normalizedCode);
      if (livreur) {
        return livreur;
      }
    }

    const response = await base44.functions.invoke('findLivreurByCode', { code: normalizedCode });
    
    if (response?.success === true && response?.livreur) {
      return response.livreur;
    }
  } catch (error) {
    console.error('[CodeIdentificationAuth] Backend lookup failed:', error?.message);
  }

  return null;
};

export const signInWithIdentificationCode = async (code) => {
  try {
    const livreur = await findLivreurByIdentificationCode(code);
    
    if (!livreur) {
      const error = new Error("Code d'identification incorrect.");
      error.code = 'invalid_identification_code';
      throw error;
    }
    
    if (livreur.validation !== 'valide') {
      const error = new Error("Compte livreur non valide. Attendez la validation de l'administrateur.");
      error.code = 'invalid_livreur_validation';
      throw error;
    }

    if (livreur.actif === false) {
      const error = new Error("Compte livreur desactive. Contactez l'administrateur.");
      error.code = 'disabled_livreur';
      throw error;
    }

    await saveSession(livreur);
    
    const user = toCodeUser(livreur);
    return user;
  } catch (error) {
    throw error;
  }
};

export const getStoredIdentificationSession = async () => {
  const isNative = isCapacitorAvailable();
  
  let session = null;
  
  if (isNative) {
    try {
      session = await getSessionNative();
    } catch (error) {
      return null;
    }
  } else {
    try {
      const rawSession = localStorage.getItem(SESSION_KEY);
      if (rawSession) {
        session = JSON.parse(rawSession);
      }
    } catch (error) {
      return null;
    }
  }
  
  if (!session) {
    return null;
  }

  try {
    if (!session?.livreur_id) {
      clearIdentificationSession();
      return null;
    }

    const livreur = await findLivreurByPredicate((item) => item.id === session.livreur_id);
    if (!livreur) {
      clearIdentificationSession();
      return null;
    }
    
    if (livreur.actif === false) {
      clearIdentificationSession();
      return null;
    }

    await saveSession(livreur);
    const user = toCodeUser(livreur);
    return user;
  } catch (error) {
    clearIdentificationSession();
    return null;
  }
};

export const clearIdentificationSession = async () => {
  const isNative = isCapacitorAvailable();
  
  if (isNative) {
    await removeSessionNative();
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
};

export const isIdentificationCodeAlreadyUsed = async (code, ignoredLivreurId = null) => {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return false;

  const livreurs = await base44.entities.Livreur.list();
  const livreur = livreurs.find(l => l.code_identification === normalizedCode);
  return !!livreur && livreur.id !== ignoredLivreurId;
};