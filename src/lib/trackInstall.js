import { base44 } from "@/api/base44Client";

function getOrCreateDeviceId() {
  try {
    let deviceId = localStorage.getItem('silgapp_device_id');
    if (!deviceId) {
      deviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('silgapp_device_id', deviceId);
    }
    return deviceId;
  } catch {
    return 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

function detectPlatform() {
  const ua = (navigator.userAgent || '').toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  return 'web';
}

export async function trackAppInstall() {
  try {
    const deviceId = getOrCreateDeviceId();
    const platform = detectPlatform();
    let countryCode = '';
    try { countryCode = localStorage.getItem('silgapp_selected_country') || ''; } catch {}

    // Récupérer l'email utilisateur si authentifié (optionnel — ne bloque pas le tracking anonyme)
    let userEmail = null;
    try {
      const isAuth = await base44.auth.isAuthenticated();
      if (isAuth) {
        const user = await base44.auth.me();
        userEmail = user?.email || null;
      }
    } catch {
      // Non authentifié ou erreur — tracking anonyme continue
    }

    // Fire-and-forget avec timeout — un échec de tracking ne doit JAMAIS
    // bloquer l'ouverture de SILGAPP ni remonter comme erreur critique.
    const invokePromise = base44.functions.invoke('trackAppInstall', {
      device_id: deviceId,
      platform,
      country_code: countryCode,
      ...(userEmail ? { user_email: userEmail } : {}),
    });
    Promise.race([
      invokePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('trackAppInstall timeout')), 5000)),
    ]).catch(() => null);
  } catch {
    // Silencieux — le tracking d'installation n'est jamais bloquant
  }
}