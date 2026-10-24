// OperationalCity is the existing activation authority. The historical country
// flag is reported separately: never rewrite saved settings to hide a conflict.
export function describeCityPolicy(cities, configs, countryCode) {
  const code = String(countryCode || '').toUpperCase();
  const scoped = cities.filter(c => String(c.country_code || code).toUpperCase() === code);
  const active = scoped.filter(c => c.actif === true);
  const values = [...new Set(configs.filter(c => c.cle === `CITY_DISPATCH_ENABLED:${code}`).map(c => c.valeur))];
  const countryFlag = values.length === 1 && ['true', 'false'].includes(values[0]) ? values[0] === 'true' : null;
  const conflicts = [];
  if (values.length > 1 || values.some(v => !['true', 'false'].includes(v))) conflicts.push('invalid_country_flag');
  if (countryFlag !== null && countryFlag !== (active.length > 0)) conflicts.push('country_city_activation_conflict');
  return {countryCode: code, enabled: active.length > 0, activeCities: active.map(c => c.nom), countryFlag,
    authority: 'OperationalCity.actif', conflicts};
}

export async function readCityPolicySummary(entities, countryCode) {
  const code = String(countryCode || '').toUpperCase();
  const cities = await entities.OperationalCity.filter({country_code: code}, 'nom_affichage', 100);
  const configs = await entities.AppConfig.filter({cle: `CITY_DISPATCH_ENABLED:${code}`});
  return describeCityPolicy(cities || [], configs || [], code);
}
