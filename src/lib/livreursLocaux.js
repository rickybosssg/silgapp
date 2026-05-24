import { base44 } from '@/api/base44Client';
import { Preferences } from '@capacitor/preferences';

const LIVREURS_CACHE_KEY = 'silgapp_livreurs_cache';

export const isCapacitorAvailable = () => {
  try {
    if (typeof window === 'undefined') return false;
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
};

/**
 * Synchronise la liste complète des livreurs actifs depuis la base de données
 * et la stocke localement dans Capacitor Preferences
 */
export const syncLivreursLocaux = async () => {
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
 * Stocke la liste des livreurs localement
 */
const storeLivreursLocaux = async (livreurs) => {
  const cacheData = JSON.stringify({ livreurs, synced_at: new Date().toISOString(), count: livreurs.length });

  if (isCapacitorAvailable()) {
    await Preferences.set({ key: LIVREURS_CACHE_KEY, value: cacheData });
  } else {
    localStorage.setItem(LIVREURS_CACHE_KEY, cacheData);
  }
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