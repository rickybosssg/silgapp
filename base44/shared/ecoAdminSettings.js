import { guestSuperAdmin, failGuest } from './guestOrderPolicy.js';

const suffixes = ['ENABLED', 'ON_ROUTE_ENABLED', 'EMERGENCY_STOP'];
export async function ecoAdminSettings(entities, user, body) {
  guestSuperAdmin(user);
  if (body.action === 'countries') {
    const rows = await entities.Country.filter({ actif: true }, 'ordre', 101);
    if (!Array.isArray(rows) || rows.length > 100) failGuest('COUNTRIES_UNAVAILABLE', 'Liste des pays indisponible.', 503);
    return { success: true, countries: rows.map(c => ({ code: c.code, nom: c.nom })) };
  }
  if (!/^[A-Z]{2}$/.test(body.country_code || '')) failGuest('COUNTRY_INVALID', 'Sélectionnez un pays.', 400);
  const countries = await entities.Country.filter({ code: body.country_code }, undefined, 2);
  if (countries.length !== 1) failGuest('COUNTRY_INVALID', 'Pays non configuré.', 400);
  const key = suffix => `ECO:${body.country_code}:${suffix}`;
  const rows = await entities.AppConfig.filter({ cle: { $in: suffixes.map(key) } }, undefined, 10);
  const values = {};
  for (const suffix of suffixes) {
    const matches = rows.filter(row => row.cle === key(suffix));
    if (matches.length > 1 || (matches.length && !['true', 'false'].includes(matches[0].valeur))) failGuest('CONFIG_CONFLICT', 'Configuration contradictoire : vérification administrative requise.', 409);
    values[suffix] = { value: matches[0]?.valeur === 'true', configured: !!matches.length, revision: matches[0]?.updated_date || null };
  }
  if (body.action === 'read') return { success: true, country_code: body.country_code, settings: values };
  if (body.action !== 'set' || !suffixes.includes(body.setting) || typeof body.value !== 'boolean') failGuest('INVALID_ACTION', 'Paramètre non autorisé.', 400);
  const row = rows.find(item => item.cle === key(body.setting));
  // Do not auto-provision absent keys or overwrite a simultaneous administrator change.
  if (!row || !row.updated_date) failGuest('CONFIG_MISSING', 'Le paramètre existant doit être configuré avant modification.', 409);
  if (body.revision !== row.updated_date) failGuest('CONFIG_CONFLICT', 'La configuration a changé. Actualisez.', 409);
  if (row.valeur === String(body.value)) return { success: true, unchanged: true };
  const result = await entities.AppConfig.updateMany({ id: row.id, updated_date: row.updated_date, valeur: row.valeur }, { $set: { valeur: String(body.value) } });
  if (Number(result?.updated) !== 1) failGuest('CONFIG_CONFLICT', 'Modification concurrente. Actualisez.', 409);
  const confirmed = await entities.AppConfig.get(row.id);
  if (confirmed.valeur !== String(body.value)) failGuest('CONFIG_UNCERTAIN', 'Modification non confirmée. Actualisez.', 409);
  return { success: true };
}
