export const OFFICIAL_STORES = {
  android: 'https://play.google.com/store/apps/details?id=com.base6a0ec08f3af5e1d1284254c1.app',
  ios: 'https://apps.apple.com/app/id6782046749',
};

export function updateInvitation(config, platform, installed, now = Date.now()) {
  if (!OFFICIAL_STORES[platform] || config?.enabled !== true || config?.store_available !== true) return null;
  const version = value => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : null;
  const current = version(installed), target = version(config.version);
  const verified = Date.parse(config.verified_at);
  if (!current || !target || !Number.isFinite(verified) || verified > now) return null;
  let newer = false;
  for (let i = 0; i < 3; i++) {
    if (target[i] !== current[i]) { newer = target[i] > current[i]; break; }
  }
  return newer ? { version: config.version, url: OFFICIAL_STORES[platform] } : null;
}
