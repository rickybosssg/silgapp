import { Preferences } from '@capacitor/preferences';

const LIVREURS_CACHE_KEY = 'silgapp_livreurs_cache';
const SYNC_META_KEY = 'silgapp_livreurs_sync_meta';

export const isCapacitorAvailable = () => {
  try {
    if (typeof window === 'undefined') return false;
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
};

/**
 * Stocke la liste des livreurs localement (Capacitor ou localStorage)
 */
const storeLivreursLocaux = async (livreurs) => {
  const synced_at = new Date().toISOString();
  const cacheData = JSON.stringify({ livreurs, synced_at, count: livreurs.length });
  const metaData = JSON.stringify({ synced_at, count: livreurs.length });

  if (isCapacitorAvailable()) {
    await Preferences.set({ key: LIVREURS_CACHE_KEY, value: cacheData });
    await Preferences.set({ key: SYNC_META_KEY, value: metaData });
  } else {
    localStorage.setItem(LIVREURS_CACHE_KEY, cacheData);
    localStorage.setItem(SYNC_META_KEY, metaData);
  }
};

/**
 * Stocke les livreurs depuis les données brutes du backend (utilisé par LivreursCacheSync)
 * Retourne la meta { synced_at, count }
 */
export const storeLivreursLocauxFromData = async (data) => {
  const livreurs = data.livreurs || [];
  const synced_at = data.synced_at || new Date().toISOString();
  const count = data.count || livreurs.length;

  const cacheData = JSON.stringify({ livreurs, synced_at, count });
  const metaData = JSON.stringify({ synced_at, count });

  if (isCapacitorAvailable()) {
    await Preferences.set({ key: LIVREURS_CACHE_KEY, value: cacheData });
    await Preferences.set({ key: SYNC_META_KEY, value: metaData });
  } else {
    localStorage.setItem(LIVREURS_CACHE_KEY, cacheData);
    localStorage.setItem(SYNC_META_KEY, metaData);
  }

  return { synced_at, count };
};

/**
 * Lit la meta de synchronisation (date + count)
 */
export const getSyncMeta = async () => {
  try {
    let raw = null;
    if (isCapacitorAvailable()) {
      const { value } = await Preferences.get({ key: SYNC_META_KEY });
      raw = value;
    } else {
      raw = localStorage.getItem(SYNC_META_KEY);
    }
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/**
 * Synchronise la liste complète des livreurs actifs depuis la base de données
 */
export const syncLivreursLocaux = async () => {
  const { base44 } = await import('@/api/base44Client');
  const allLivreurs = await base44.entities.Livreur.list('-created_date', 1000);

  const activeLivreurs = allLivreurs
    .filter(l => l.actif === true && l.validation === 'valide' && l.code_identification)
    .map(l => ({
      livreur_id: l.id,
      nom: l.nom,
      prenom: l.prenom,
      telephone: l.telephone,
      code_identification: l.code_identification.toUpperCase().trim(),
      quartier: l.quartier,
      vehicule: l.vehicule,
      user_email: l.user_email,
      synced_at: new Date().toISOString()
    }));

  await storeLivreursLocaux(activeLivreurs);

  return { success: true, count: activeLivreurs.length, synced_at: new Date().toISOString() };
};

/**
 * Récupère la liste des livreurs depuis le cache local
 */
export const getLivreursLocaux = async () => {
  try {
    let raw = null;

    if (isCapacitorAvailable()) {
      const { value } = await Preferences.get({ key: LIVREURS_CACHE_KEY });
      raw = value;
    } else {
      raw = localStorage.getItem(LIVREURS_CACHE_KEY);
    }

    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.livreurs || null;
  } catch {
    return null;
  }
};

/**
 * Vérifie un code d'identification localement
 */
export const verifyCodeLocalement = async (code) => {
  const normalizedCode = (code || '').trim().toUpperCase();
  if (!normalizedCode) return null;

  const livreurs = await getLivreursLocaux();
  if (!livreurs || livreurs.length === 0) return null;

  const livreur = livreurs.find(l => l.code_identification === normalizedCode);
  if (!livreur) return null;

  return {
    id: livreur.livreur_id,
    nom: livreur.nom,
    prenom: livreur.prenom,
    telephone: livreur.telephone,
    code_identification: livreur.code_identification,
    quartier: livreur.quartier,
    vehicule: livreur.vehicule,
    user_email: livreur.user_email,
    validation: 'valide',
    actif: true
  };
};

/**
 * Efface le cache local des livreurs
 */
export const clearLivreursCache = async () => {
  if (isCapacitorAvailable()) {
    await Preferences.remove({ key: LIVREURS_CACHE_KEY });
  } else {
    localStorage.removeItem(LIVREURS_CACHE_KEY);
  }
};

/**
 * Vérifie si le cache existe et n'est pas trop ancien
 */
export const isCacheValide = async (maxAgeMinutes = 60) => {
  try {
    let raw = null;
    if (isCapacitorAvailable()) {
      const { value } = await Preferences.get({ key: LIVREURS_CACHE_KEY });
      raw = value;
    } else {
      raw = localStorage.getItem(LIVREURS_CACHE_KEY);
    }
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const age = (Date.now() - new Date(parsed.synced_at).getTime()) / 1000 / 60;
    return age < maxAgeMinutes;
  } catch {
    return false;
  }
};