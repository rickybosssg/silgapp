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

export function trackAppInstall() {
  try {
    const deviceId = getOrCreateDeviceId();
    const platform = detectPlatform();
    let countryCode = 'BF';
    try { countryCode = localStorage.getItem('silgapp_selected_country') || 'BF'; } catch {}
    base44.functions.invoke('trackAppInstall', {
      device_id: deviceId,
      platform,
      country_code: countryCode,
    }).catch(() => null);
  } catch {}
}