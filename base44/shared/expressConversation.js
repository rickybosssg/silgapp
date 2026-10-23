import { extractExpressFields, parseExpressPrice } from './expressOrder.js';

const keys = ['depart', 'arrivee', 'prix'];
const empty = () => ({ depart: '', arrivee: '', prix: '' });
const clean = value => String(value || '').trim().replace(/^[\s,;.!]+|[\s,;.!]+$/gu, '');
const uncertain = value => /\b(?:ou|environ|peut[- ]être)\b/iu.test(value);
const numberOnly = value => /^\d[\d\s]*$/u.test(value);
const amount = value => { try { return parseExpressPrice(clean(value)); } catch { return ''; } };
const location = value => {
  const text = clean(value);
  return text.length <= 160 && !uncertain(text) && !numberOnly(text) &&
    !/\b(?:livreur|besoin|prix|francs?|merci|bonjour)\b/iu.test(text) ? text : '';
};

// Bounded grammar, not universal speech understanding. Unrecognized material
// stays unresolved; exact catalogue resolution still happens before review.
export function mergeExpressTurn(previous, input, requested = '') {
  const fields = { depart: previous?.depart || '', arrivee: previous?.arrivee || '', prix: previous?.prix || '' };
  const changed = [];
  let source = clean(input).replace(/^(?:(?:alors|bonjour|bonsoir|s['’]il vous pla[iî]t)[,\s.!]*)+/iu, '');
  source = source.replace(/^(?:j['’]ai besoin d['’]un livreur|je (?:veux|voudrais|souhaite) (?:un livreur|envoyer un colis))\s*(?:[,.:]\s*)?/iu, '');
  source = source.replace(/^des\s+/iu, 'de ');
  const correction = /^(?:non[,\s]+)?plut[oô]t\s+(.+)$/iu.exec(source);
  let patch = empty();
  if (correction) {
    // A correction with an explicit currency changes only the price. A bare
    // number could be a quartier: leave it for a targeted clarification.
    if (/(?:francs?|fcfa|f)\s*[.!]?$/iu.test(correction[1])) patch.prix = amount(correction[1]);
  } else {
    const labelledPrice = /(?:^|[\s,;.])(?:et\s+)?(?:le\s+)?prix(?:\s*[:,]\s*|\s+)(.+)$/iu.exec(source);
    let route = source;
    if (labelledPrice) {
      patch.prix = amount(labelledPrice[1]);
      route = clean(source.slice(0, labelledPrice.index));
    }
    const legacy = extractExpressFields(route);
    patch.depart = location(legacy.depart);
    patch.arrivee = location(legacy.arrivee);
    if (!labelledPrice) patch.prix = legacy.prix;
    // Currency is mandatory in an unlabelled separate clause.
    const trailing = /^(.*?)[,;.]\s*(.+(?:francs?|fcfa|f))\s*[.!]?$/iu.exec(route);
    if (!patch.prix && trailing && amount(trailing[2])) {
      const partial = extractExpressFields(trailing[1]);
      patch = { depart: location(partial.depart), arrivee: location(partial.arrivee), prix: amount(trailing[2]) };
    }
    if (!patch.prix && !labelledPrice && /(?:francs?|fcfa|f)\s*[.!]?$/iu.test(route)) {
      const words = route.split(/\s+/u);
      for (let i = 1; i < words.length; i++) {
        const prix = amount(words.slice(i).join(' '));
        if (!prix) continue;
        const partial = extractExpressFields(words.slice(0, i).join(' '));
        if (location(partial.depart) && location(partial.arrivee)) {
          patch = { depart: location(partial.depart), arrivee: location(partial.arrivee), prix }; break;
        }
      }
    }
    const missingLocations = ['depart', 'arrivee'].filter(key => !fields[key]);
    if (!patch.depart && !patch.arrivee && missingLocations.length === 1 && location(route)) patch[missingLocations[0]] = location(route);
    if (!Object.values(patch).some(Boolean) && keys.includes(requested)) {
      if (requested === 'prix') patch.prix = amount(source);
      else patch[requested] = location(source);
    }
  }
  for (const key of keys) if (patch[key] && patch[key] !== fields[key]) { fields[key] = patch[key]; changed.push(key); }
  const missing = keys.filter(key => !fields[key]);
  const question = missing.length === 1 ? {
    depart: 'Quel est votre quartier de départ ?', arrivee: 'Quel est votre quartier d’arrivée ?', prix: 'Quel prix proposez-vous en francs ?',
  }[missing[0]] : missing.length ? 'Précisez le départ, l’arrivée et le prix encore manquants.' : '';
  const ambiguous = !!source && !changed.length && (!Object.values(patch).some(Boolean));
  return { fields, changed, requested: missing.length === 1 ? missing[0] : '',
    question: ambiguous ? (numberOnly(source) || correction ? 'Ce nombre désigne-t-il un quartier ou un prix ? Précisez « départ », « arrivée » ou « prix ».' : question || 'Que souhaitez-vous modifier : départ, arrivée ou prix ?') : question };
}
