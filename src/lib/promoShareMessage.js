import { PLAY_STORE_URL, APP_STORE_URL } from './crmPilotMessage.js';
import { PROMO_FIRST_COURSE_AMOUNT_FCFA } from '../../base44/shared/promoBenefits.js';

// Shared text is independent of the sender's device; both stores are always present.
export function buildPromoShareMessage({ code, reductionAmount = PROMO_FIRST_COURSE_AMOUNT_FCFA, currency = 'FCFA' }) {
  if (typeof code !== 'string' || !code.trim()) throw new Error('Code promo requis.');
  if (!['number', 'string'].includes(typeof reductionAmount) || String(reductionAmount).trim() === '') {
    throw new Error('Montant promo invalide.');
  }
  const amount = Number(reductionAmount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Montant promo invalide.');
  const benefit = amount > 0
    ? " et bénéficie de *" + amount.toLocaleString('fr-FR') + " " + currency + " de réduction* sur ta première course !"
    : '.';
  return [
    'Utilise mon code promo *' + code.trim() + '* sur SILGAPP' + benefit,
    '',
    'Télécharge SILGAPP et inscris-toi maintenant :',
    '',
    'Android (Google Play) :',
    PLAY_STORE_URL,
    '',
    'iPhone (App Store) :',
    APP_STORE_URL,
  ].join('\n');
}
