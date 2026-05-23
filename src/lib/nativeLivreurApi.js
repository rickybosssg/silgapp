import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';

export const isNativeLivreurRuntime = () => !!appParams.isCapacitor;

export const nativeLivreurInvoke = async (payload) => {
  const result = await base44.functions.invoke('getNotificationStats', {
    ...payload,
    native_livreur: true,
  });
  if (result?.error) {
    throw new Error(result.error);
  }
  return result;
};

export const verifyNativeLivreurCode = async (code) => {
  const result = await nativeLivreurInvoke({ action: 'verifyCode', code });
  return result?.livreur || null;
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
