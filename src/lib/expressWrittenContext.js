import { scopeVoiceQuartiers as scopeExpressQuartiers } from './expressQuartierSuggestions.js';

export function expressCurrency(config) {
  const code = String(config?.devise || '').trim();
  const symbol = String(config?.devise_symbole || '').trim();
  if (/^(?:XOF|XAF|F\s*CFA|FCFA)$/i.test(code) || /^(?:XOF|XAF|F\s*CFA|FCFA)$/i.test(symbol)) return 'FCFA';
  return symbol || code;
}

export async function loadExpressWrittenContext(api, client) {
  const country = client.country_code;
  const [countries, quartiers] = await Promise.all([
    api.entities.Country.filter({code: country, actif: true}),
    api.entities.Quartier.filter({country_code: country, actif: true}, 'nom', 500),
  ]);
  const matches = countries.filter(row => row.code === country && row.actif === true);
  if (matches.length !== 1 || !expressCurrency(matches[0])) throw new Error('Configuration du pays indisponible. Rechargez le formulaire.');
  const scoped = scopeExpressQuartiers(quartiers, country, client.ville);
  if (!scoped.length) throw new Error('Aucun quartier disponible pour votre ville. Vérifiez votre profil ou réessayez.');
  return {currency: expressCurrency(matches[0]), quartiers: scoped};
}
