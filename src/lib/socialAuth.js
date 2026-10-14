// Provider state observed in the owner's dashboard screenshots, 2026-10-14
// 11:02 UTC. This is a dated observation, not a live configuration probe.
// Session readiness remains separate: no successful round trip is claimed.
export const SOCIAL_AUTH_READINESS = Object.freeze({
  google: Object.freeze({ providerEnabled: true, oauthMode: 'default', webSessionVerified: false }),
  apple: Object.freeze({ providerEnabled: true, webSessionVerified: false }),
});

export function availableSocialProviders(platform, readiness = SOCIAL_AUTH_READINESS, sdkReady = true) {
  // The installed SDK navigates window.location. No verified system-browser
  // session bridge exists in this wrapper; never run OAuth in its WebView.
  if (platform !== 'web' || !sdkReady) return [];
  return ['google', 'apple'].filter(provider => readiness[provider]?.providerEnabled === true && readiness[provider]?.webSessionVerified === true);
}

export function beginSocialLogin({ provider, platform, auth, location, readiness = SOCIAL_AUTH_READINESS }) {
  if (!availableSocialProviders(platform, readiness, typeof auth?.loginWithProvider === 'function').includes(provider)) {
    throw new Error('Cette connexion n’est pas encore disponible sur cet appareil. Utilisez votre e-mail et votre mot de passe.');
  }
  const origin = new URL(location.origin);
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))) {
    throw new Error('Adresse de retour de connexion non prise en charge.');
  }
  const path = typeof location.pathname === 'string' && location.pathname.startsWith('/') && !location.pathname.startsWith('//')
    ? location.pathname : '/';
  // Do not copy credentials, query parameters or fragments into the callback.
  // Base44 owns OAuth validation, account identity and the returned session.
  auth.loginWithProvider(provider, origin.origin + path);
}
