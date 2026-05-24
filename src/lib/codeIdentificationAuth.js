import { base44 } from '@/api/base44Client';
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

  if (isCapacitorAvailable()) {
    await saveSessionNative(sessionData);
  } else {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
  }
};

/**
 * Cherche un livreur par code via la fonction backend sécurisée.
 * Ne jamais appeler base44.entities ou asServiceRole directement ici.
 */
const findLivreurViaBackend = async (code) => {
  const response = await base44.functions.invoke('findLivreurByCode', { code });
  const data = response?.data;
  if (data?.success === true && data?.livreur) {
    return data.livreur;
  }
  return null;
};

/**
 * Cherche un livreur par son ID via la fonction backend sécurisée.
 */
const findLivreurByIdViaBackend = async (livreurId) => {
  const response = await base44.functions.invoke('findLivreurByCode', { livreur_id: livreurId });
  const data = response?.data;
  if (data?.success === true && data?.livreur) {
    return data.livreur;
  }
  return null;
};

export const findLivreurByIdentificationCode = async (code) => {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return null;

  // ÉTAPE 1: Cache local APK (rapide, hors-ligne)
  const livreurLocal = await verifyCodeLocalement(normalizedCode);
  if (livreurLocal) {
    return livreurLocal;
  }

  // ÉTAPE 2: Backend sécurisé (asServiceRole côté serveur uniquement)
  return findLivreurViaBackend(normalizedCode);
};

export const signInWithIdentificationCode = async (code) => {
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
  return toCodeUser(livreur);
};

export const getStoredIdentificationSession = async () => {
  let session = null;

  if (isCapacitorAvailable()) {
    try {
      session = await getSessionNative();
    } catch {
      return null;
    }
  } else {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) session = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!session?.livreur_id) {
    await clearIdentificationSession();
    return null;
  }

  try {
    // Récupérer le livreur via backend (pas d'accès direct aux entités)
    const livreur = await findLivreurByIdViaBackend(session.livreur_id);
    if (!livreur) {
      await clearIdentificationSession();
      return null;
    }

    if (livreur.actif === false) {
      await clearIdentificationSession();
      return null;
    }

    await saveSession(livreur);
    return toCodeUser(livreur);
  } catch {
    await clearIdentificationSession();
    return null;
  }
};

export const clearIdentificationSession = async () => {
  if (isCapacitorAvailable()) {
    await removeSessionNative();
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
};