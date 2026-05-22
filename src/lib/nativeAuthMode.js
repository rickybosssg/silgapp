import { appParams } from '@/lib/app-params';

export const AUTH_MODE_STORAGE_KEY = 'silgapp_auth_mode';
export const AUTH_MODE_NATIVE_FIREBASE = 'native-firebase';
export const AUTH_MODE_BASE44 = 'base44';

export const getRequestedAuthMode = () => {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_AUTH_MODE || '';
  }

  const url = new URL(window.location.href);
  const queryMode = url.searchParams.get('auth_mode');
  if (queryMode) {
    localStorage.setItem(AUTH_MODE_STORAGE_KEY, queryMode);
    url.searchParams.delete('auth_mode');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    return queryMode;
  }

  return localStorage.getItem(AUTH_MODE_STORAGE_KEY) || import.meta.env.VITE_AUTH_MODE || '';
};

export const isNativeFirebaseAuthEnabled = () => {
  const requestedMode = getRequestedAuthMode();

  if (!appParams.isCapacitor && import.meta.env.VITE_ALLOW_NATIVE_AUTH_ON_WEB !== 'true') {
    return false;
  }

  if (requestedMode === AUTH_MODE_BASE44) return false;
  if (requestedMode === AUTH_MODE_NATIVE_FIREBASE) return true;

  return appParams.isCapacitor && import.meta.env.VITE_ENABLE_NATIVE_FIREBASE_AUTH === 'true';
};
