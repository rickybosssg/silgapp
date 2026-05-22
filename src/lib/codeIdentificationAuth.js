import { base44 } from '@/api/base44Client';

const SESSION_KEY = 'silgapp_code_identification_session';

const normalizeCode = (value) => (value || '').trim().toUpperCase();

const getLivreurName = (livreur) => {
  const fullName = `${livreur?.prenom || ''} ${livreur?.nom || ''}`.trim();
  return fullName || livreur?.nom || 'Livreur';
};

const toCodeUser = (livreur) => ({
  id: `livreur:${livreur.id}`,
  role: 'livreur',
  full_name: getLivreurName(livreur),
  name: getLivreurName(livreur),
  email: livreur.user_email || '',
  livreur_id: livreur.id,
  code_identification: livreur.code_identification || '',
  auth_provider: 'code_identification',
  livreur,
});

const saveSession = (livreur) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    livreur_id: livreur.id,
    nom: getLivreurName(livreur),
    role: 'livreur',
    code_identification: livreur.code_identification || '',
    email: livreur.user_email || '',
    created_at: new Date().toISOString(),
  }));
};

const findLivreurByPredicate = async (predicate) => {
  const livreurs = await base44.entities.Livreur.list('-created_date', 500);
  return livreurs.find(predicate) || null;
};

export const findLivreurByIdentificationCode = async (code) => {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return null;

  try {
    const directMatches = await base44.entities.Livreur.filter({ code_identification: normalizedCode });
    const directMatch = directMatches?.find(
      (livreur) => normalizeCode(livreur.code_identification) === normalizedCode
    );
    if (directMatch) return directMatch;
  } catch (error) {
    console.warn('[CodeIdentificationAuth] Direct lookup failed, falling back to list:', error?.message);
  }

  return findLivreurByPredicate(
    (livreur) => normalizeCode(livreur.code_identification) === normalizedCode
  );
};

export const signInWithIdentificationCode = async (code) => {
  const livreur = await findLivreurByIdentificationCode(code);
  if (!livreur) {
    const error = new Error("Code d'identification incorrect.");
    error.code = 'invalid_identification_code';
    throw error;
  }

  if (livreur.actif === false) {
    const error = new Error("Compte livreur desactive. Contactez l'administrateur.");
    error.code = 'disabled_livreur';
    throw error;
  }

  saveSession(livreur);
  return toCodeUser(livreur);
};

export const getStoredIdentificationSession = async () => {
  const rawSession = localStorage.getItem(SESSION_KEY);
  if (!rawSession) return null;

  try {
    const session = JSON.parse(rawSession);
    if (!session?.livreur_id) {
      clearIdentificationSession();
      return null;
    }

    const livreur = await findLivreurByPredicate((item) => item.id === session.livreur_id);
    if (!livreur || livreur.actif === false) {
      clearIdentificationSession();
      return null;
    }

    saveSession(livreur);
    return toCodeUser(livreur);
  } catch (error) {
    console.warn('[CodeIdentificationAuth] Stored session restore failed:', error?.message);
    clearIdentificationSession();
    return null;
  }
};

export const clearIdentificationSession = () => {
  localStorage.removeItem(SESSION_KEY);
};

export const isIdentificationCodeAlreadyUsed = async (code, ignoredLivreurId = null) => {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return false;

  const livreur = await findLivreurByIdentificationCode(normalizedCode);
  return !!livreur && livreur.id !== ignoredLivreurId;
};
