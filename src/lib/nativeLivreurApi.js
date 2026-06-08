import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';

export const isNativeLivreurRuntime = () => {
  const isNative = !!appParams.isCapacitor;
  console.log('[NativeLivreurApi] isNativeLivreurRuntime:', isNative, 'appParams:', appParams);
  return isNative;
};

export const nativeLivreurInvoke = async (payload) => {
  console.log('[NativeLivreurApi] nativeLivreurInvoke - payload:', JSON.stringify(payload));
  console.log('[NativeLivreurApi] Calling function: nativeLivreur');
  
  try {
    const result = await base44.functions.invoke('nativeLivreur', payload);
    console.log('[NativeLivreurApi] Response received:', result);
    
    if (result?.error) {
      console.error('[NativeLivreurApi] Error in response:', result.error);
      throw new Error(result.error);
    }
    
    return result;
  } catch (error) {
    console.error('[NativeLivreurApi] Exception during invoke:', error.message);
    throw error;
  }
};

export const verifyNativeLivreurCode = async (code) => {
  console.log('[NativeLivreurApi] verifyNativeLivreurCode - code:', code);
  
  try {
    const result = await nativeLivreurInvoke({ action: 'verifyCode', code });
    console.log('[NativeLivreurApi] verifyCode result:', result);
    const livreur = result?.livreur || null;
    console.log('[NativeLivreurApi] Extracted livreur:', livreur ? `${livreur.nom} ${livreur.prenom}` : 'null');
    return livreur;
  } catch (error) {
    console.error('[NativeLivreurApi] verifyNativeLivreurCode failed:', error.message);
    throw error;
  }
};

export const getNativeLivreurState = async (livreurId) => nativeLivreurInvoke({
  action: 'getState',
  livreur_id: livreurId,
});

export const updateNativeLivreur = async (livreurId, data) => nativeLivreurInvoke({
  action: 'updateLivreur',
  livreur_id: livreurId,
  data,
});

export const updateNativeLivreurCourse = async (livreurId, courseId, data) => nativeLivreurInvoke({
  action: 'updateCourse',
  livreur_id: livreurId,
  course_id: courseId,
  data,
});