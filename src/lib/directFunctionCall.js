/**
 * Appelle une fonction backend directement via fetch,
 * sans passer par le SDK client qui exige une session Base44.
 * Utile pour les livreurs connectés par code d'identification (pas de session Base44).
 */
import { APP_PUBLIC_URL, BASE44_APP_ID } from '@/lib/app-params';

export const invokeDirectly = async (functionName, payload = {}) => {
  // En APK Capacitor, utiliser l'URL publique. Sinon, URL relative (fonctionne en preview et web).
  const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const base = isCapacitor ? APP_PUBLIC_URL : '';
  const url = `${base}/api/apps/${BASE44_APP_ID}/functions/${functionName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
};