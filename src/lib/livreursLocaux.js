import { base44 } from '@/api/base44Client';

const LIVREURS_CACHE_KEY = 'silgapp_livreurs_cache';

const getPreferences = async () => {
  if (!isCapacitorAvailable()) {
    throw new Error('Capacitor not available');
  }
  const { Preferences } = await import('npm:@capacitor/preferences@5.0.7');
  return Preferences;
};

export const isCapacitorAvailable = () => {
  try {
    if (typeof window === 'undefined') return false;
    const win = window;
    return !!(win.Capacitor && win.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
};

/**
 * Synchronise la liste complète des livreurs actifs depuis la base de données
 * et la stocke localement dans Capacitor Preferences
 */
export const syncLivreursLocaux = async () => {
  console.log('[LivreursLocaux] ========== SYNC START ==========');
  
  try {
    console.log('[LivreursLocaux] Fetching all active livreurs from DB...');
    
    // Récupérer TOUS les livreurs avec leurs codes
    const allLivreurs = await base44.entities.Livreur.list('-created_date', 1000);
    
    console.log('[LivreursLocaux] Total livreurs fetched:', allLivreurs.length);
    
    // Filtrer uniquement les livreurs actifs et validés avec un code
    const activeLivreurs = allLivreurs
      .filter(livreur => 
        livreur.actif === true && 
        livreur.validation === 'valide' && 
        livreur.code_identification
      )
      .map(livreur => ({
        livreur_id: livreur.id,
        nom: livreur.nom,
        prenom: livreur.prenom,
        telephone: livreur.telephone,
        code_identification: livreur.code_identification.toUpperCase().trim(),
        quartier: livreur.quartier,
        vehicule: livreur.vehicule,
        user_email: livreur.user_email,
        synced_at: new Date().toISOString()
      }));
    
    console.log('[LivreursLocaux] Active livreurs with codes:', activeLivreurs.length);
    
    if (activeLivreurs.length === 0) {
      console.warn('[LivreursLocaux] ⚠️ No active livreurs found!');
      // Stocker quand même pour éviter de resynchroniser en boucle
      await storeLivreursLocaux([]);
      return { success: true, count: 0, warning: 'Aucun livreur actif trouvé' };
    }
    
    // Stocker localement
    await storeLivreursLocaux(activeLivreurs);
    
    console.log('[LivreursLocaux] ✅ SYNC COMPLETE -', activeLivreurs.length, 'livreurs stockés');
    console.log('[LivreursLocaux] Sample:', activeLivreurs[0]);
    
    return {
      success: true,
      count: activeLivreurs.length,
      synced_at: new Date().toISOString()
    };
  } catch (error) {
    console.error('[LivreursLocaux] ❌ SYNC FAILED:', error.message);
    throw error;
  }
};

/**
 * Stocke la liste des livreurs dans Capacitor Preferences
 */
const storeLivreursLocaux = async (livreurs) => {
  console.log('[LivreursLocaux] Storing', livreurs.length, 'livreurs locally...');
  
  if (!isCapacitorAvailable()) {
    console.warn('[LivreursLocaux] Capacitor not available, storing in localStorage');
    localStorage.setItem(LIVREURS_CACHE_KEY + '_web', JSON.stringify({
      livreurs,
      synced_at: new Date().toISOString()
    }));
    return;
  }
  
  try {
    const Preferences = await getPreferences();
    
    const cacheData = {
      livreurs,
      synced_at: new Date().toISOString(),
      count: livreurs.length
    };
    
    await Preferences.set({
      key: LIVREURS_CACHE_KEY,
      value: JSON.stringify(cacheData),
    });
    
    console.log('[LivreursLocaux] ✅ Stored in Capacitor');
    
    // Vérification immédiate
    const { value } = await Preferences.get({ key: LIVREURS_CACHE_KEY });
    if (value) {
      const parsed = JSON.parse(value);
      console.log('[LivreursLocaux] ✅ Verified:', parsed.count, 'livreurs');
    }
  } catch (error) {
    console.error('[LivreursLocaux] Storage failed:', error);
    throw error;
  }
};

/**
 * Récupère la liste des livreurs depuis le cache local
 */
export const getLivreursLocaux = async () => {
  console.log('[LivreursLocaux] ========== GET LOCAL ==========');
  
  try {
    if (!isCapacitorAvailable()) {
      console.log('[LivreursLocaux] Using localStorage (web)');
      const raw = localStorage.getItem(LIVREURS_CACHE_KEY + '_web');
      if (!raw) {
        console.log('[LivreursLocaux] ❌ No cache in localStorage');
        return null;
      }
      const parsed = JSON.parse(raw);
      console.log('[LivreursLocaux] ✅ Found', parsed.count, 'livreurs in localStorage');
      return parsed.livreurs;
    }
    
    console.log('[LivreursLocaux] Using Capacitor Preferences');
    const Preferences = await getPreferences();
    const { value } = await Preferences.get({ key: LIVREURS_CACHE_KEY });
    
    if (!value) {
      console.log('[LivreursLocaux] ❌ No cache found');
      return null;
    }
    
    const cacheData = JSON.parse(value);
    console.log('[LivreursLocaux] ✅ Found', cacheData.count, 'livreurs, synced at:', cacheData.synced_at);
    
    return cacheData.livreurs;
  } catch (error) {
    console.error('[LivreursLocaux] Get failed:', error);
    return null;
  }
};

/**
 * Vérifie un code d'identification localement (sans appel backend)
 * Retourne le livreur si trouvé, null sinon
 */
export const verifyCodeLocalement = async (code) => {
  const normalizedCode = (code || '').trim().toUpperCase();
  
  if (!normalizedCode) {
    console.warn('[LivreursLocaux] Empty code provided');
    return null;
  }
  
  console.log('[LivreursLocaux] ========== VERIFY CODE ==========');
  console.log('[LivreursLocaux] Code:', normalizedCode);
  
  const livreurs = await getLivreursLocaux();
  
  if (!livreurs) {
    console.warn('[LivreursLocaux] ❌ Cache vide - sync required');
    return null;
  }
  
  console.log('[LivreursLocaux] Searching in', livreurs.length, 'livreurs...');
  
  const livreur = livreurs.find(l => l.code_identification === normalizedCode);
  
  if (livreur) {
    console.log('[LivreursLocaux] ✅ MATCH FOUND:', livreur.nom, livreur.prenom);
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
  }
  
  console.log('[LivreursLocaux] ❌ No match for code:', normalizedCode);
  return null;
};

/**
 * Efface le cache local des livreurs
 */
export const clearLivreursCache = async () => {
  console.log('[LivreursLocaux] Clearing cache...');
  
  if (!isCapacitorAvailable()) {
    localStorage.removeItem(LIVREURS_CACHE_KEY + '_web');
    console.log('[LivreursLocaux] localStorage cache cleared');
    return;
  }
  
  try {
    const Preferences = await getPreferences();
    await Preferences.remove({ key: LIVREURS_CACHE_KEY });
    console.log('[LivreursLocaux] ✅ Cache cleared');
  } catch (error) {
    console.error('[LivreursLocaux] Clear failed:', error);
  }
};

/**
 * Vérifie si le cache existe et n'est pas trop ancien
 */
export const isCacheValide = async (maxAgeMinutes = 60) => {
  try {
    if (!isCapacitorAvailable()) {
      const raw = localStorage.getItem(LIVREURS_CACHE_KEY + '_web');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      const syncedAt = new Date(parsed.synced_at);
      const age = (Date.now() - syncedAt.getTime()) / 1000 / 60;
      return age < maxAgeMinutes;
    }
    
    const Preferences = await getPreferences();
    const { value } = await Preferences.get({ key: LIVREURS_CACHE_KEY });
    
    if (!value) return false;
    
    const parsed = JSON.parse(value);
    const syncedAt = new Date(parsed.synced_at);
    const age = (Date.now() - syncedAt.getTime()) / 1000 / 60;
    
    console.log('[LivreursLocaux] Cache age:', Math.round(age), 'minutes');
    return age < maxAgeMinutes;
  } catch (error) {
    console.error('[LivreursLocaux] Cache validation failed:', error);
    return false;
  }
};