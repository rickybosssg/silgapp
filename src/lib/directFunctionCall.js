/**
 * Appelle une fonction backend directement via fetch.
 * Utilise l'URL publique /functions/ qui n'exige pas de token Base44.
 * Compatible avec les livreurs connectés par code (pas de session Base44).
 */
import { APP_PUBLIC_URL } from '@/lib/app-params';

export const invokeDirectly = async (functionName, payload = {}) => {
  const baseUrl = APP_PUBLIC_URL.replace(/\/$/, '');
  const url = `${baseUrl}/functions/${functionName}`;

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