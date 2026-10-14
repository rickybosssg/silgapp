export const SILGAPP_IOS_LOGO = new URL('../assets/silgapp-logo-ios.png', import.meta.url).href;

function nativePlatform() {
  try {
    const bridge = /** @type {any} */ (globalThis).Capacitor;
    return bridge?.getPlatform?.();
  } catch {
    return undefined;
  }
}

// Keep every existing Android/web image URL unchanged.
export function silgappLogo(originalLogo, platform = nativePlatform()) {
  return platform === 'ios' ? SILGAPP_IOS_LOGO : originalLogo;
}
