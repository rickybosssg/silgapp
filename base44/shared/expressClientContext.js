// Same profile selection as Commander: its selected ID, otherwise latest linked profile.
// Always re-read through the caller's entity permissions and validate ownership.
export const EXPRESS_PROFILE_MESSAGES = {
  AUTH_REQUIRED: 'Reconnectez-vous pour continuer.',
  CLIENT_PROFILE_REQUIRED: 'Complétez votre profil client avant de commander.',
  CLIENT_PROFILE_MISMATCH: 'Le profil ne correspond plus à cette session. Reconnectez-vous.',
  CLIENT_COUNTRY_REQUIRED: 'Complétez le pays de votre profil client.',
  CLIENT_COUNTRY_CHANGED: 'Le pays du profil a changé. Sélectionnez à nouveau les quartiers.',
  PUBLIC_CLIENT_REQUIRED: 'Cette commande express est réservée au profil client public. Utilisez Commander pour votre compte entreprise.',
  CLIENT_DISABLED: 'Ce profil client est désactivé. Contactez le support.',
  CLIENT_FEES_BLOCKED: 'Veuillez régulariser vos frais d’annulation.',
};

function reject(code) {
  throw Object.assign(new Error(EXPRESS_PROFILE_MESSAGES[code]), { code });
}

export function validateExpressClient(user, client, expectedCountry = '') {
  if (!user?.email) reject('AUTH_REQUIRED');
  if (!client?.id) reject('CLIENT_PROFILE_REQUIRED');
  if (client.user_email !== user.email) reject('CLIENT_PROFILE_MISMATCH');
  if (client.enterprise_id || user.enterprise_id) reject('PUBLIC_CLIENT_REQUIRED');
  if (client.actif === false) reject('CLIENT_DISABLED');
  if (client.bloque_frais_annulation) reject('CLIENT_FEES_BLOCKED');
  if (!/^[A-Z]{2}$/.test(client.country_code || '')) reject('CLIENT_COUNTRY_REQUIRED');
  if (expectedCountry && expectedCountry !== client.country_code) reject('CLIENT_COUNTRY_CHANGED');
  return { user, client, country: client.country_code };
}

export async function resolveExpressClient({ user, entity, profileId, expectedCountry = '' }) {
  if (!user?.email) reject('AUTH_REQUIRED');
  const client = profileId
    ? await entity.get(profileId)
    : (await entity.filter({ user_email: user.email }, '-created_date', 1))?.[0];
  return validateExpressClient(user, client, expectedCountry);
}
