// ═══════════════════════════════════════════════════════════════════════════
// COUNTRY RESOLVER (BACKEND) — Source unique backend pour la résolution pays
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️  Aucune fonction backend ne doit utiliser `|| "BF"` comme fallback.
//     Utiliser resolveCountryCode() ou requireCountryCode().
//
// Hiérarchie :
//   1. country_code de l'objet métier (course, livreur, client…)
//   2. country_code du profil/utilisateur
//   3. Premier pays actif du backend (Country)
//   4. { status: 'COUNTRY_REQUIRED' } pour les opérations critiques
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Résout le code pays depuis un contexte hiérarchique (côté backend).
 *
 * @param {object} base44 - instance SDK base44
 * @param {object} [context] - contexte de résolution
 * @param {string} [context.countryCode] - code pays explicite (body, param…)
 * @param {object} [context.entity] - objet métier avec country_code
 * @param {object} [context.userProfile] - profil utilisateur avec country_code
 * @returns {Promise<string|null>} code pays ISO 2 lettres, ou null
 */
export async function resolveCountryCode(base44, context = {}) {
  // 1. Code pays explicite passé en paramètre
  if (context.countryCode) return context.countryCode;

  // 2. Pays de l'objet métier
  const entityCC = context.entity?.country_code;
  if (entityCC) return entityCC;

  // 3. Pays du profil utilisateur
  const profileCC = context.userProfile?.country_code;
  if (profileCC) return profileCC;

  // 4. Premier pays actif du backend
  try {
    const countries = await base44.asServiceRole.entities.Country.filter({ actif: true }, "ordre", 1);
    if (countries?.[0]?.code) return countries[0].code;
  } catch (_) {}

  return null;
}

/**
 * Résout le code pays pour une opération backend CRITIQUE.
 *
 * @returns {Promise<string|{status: 'COUNTRY_REQUIRED', message: string}>}
 */
export async function requireCountryCode(base44, context = {}) {
  const code = await resolveCountryCode(base44, context);
  if (code) return code;
  return {
    status: 'COUNTRY_REQUIRED',
    message: "Impossible de déterminer le pays. Aucun country_code fourni.",
  };
}

/**
 * Résout l'indicatif téléphonique d'un pays depuis le backend Country.
 *
 * @param {object} base44 - instance SDK base44
 * @param {string} countryCode - code pays ISO 2 lettres
 * @returns {Promise<string>} indicatif (ex: "+226") ou ""
 */
export async function resolveDialCode(base44, countryCode) {
  if (!countryCode) return '';
  try {
    const countries = await base44.asServiceRole.entities.Country.filter({ code: countryCode, actif: true });
    return countries?.[0]?.indicatif || '';
  } catch (_) {
    return '';
  }
}