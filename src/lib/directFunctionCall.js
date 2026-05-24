/**
 * Appelle une fonction backend directement via fetch,
 * en injectant le token de session disponible (preview ou APK).
 */
import { appParams } from '@/lib/app-params';

export const invokeDirectly = async (functionName, payload = {}) => {
  const { appId, token, appBaseUrl } = appParams;

  // Construire l'URL : URL relative en preview/web, URL absolue en APK Capacitor
  const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const base = isCapacitor ? (appBaseUrl || '') : '';
  const url = `${base}/api/apps/${appId}/functions/${functionName}`;

  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
};