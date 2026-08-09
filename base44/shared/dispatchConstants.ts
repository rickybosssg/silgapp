// ── Constantes et utilitaires partagés du dispatch ──────────────────────────
// Source unique de vérité pour les statuts actifs, indicatifs téléphoniques,
// configuration pays (avec cache), et normalisation des commissions.

import { haversineKm } from './geoUtils.ts';

// Ré-export pour rétrocompatibilité (haversineKm retourne null si coords invalides)
export { haversineKm as calculerDistance };

// Statuts de course active (le livreur est engagé dans la livraison).
// INCLUS: tous les statuts intermédiaires des courses administratives
// (client_contacto, en_route_expediteur) et le statut arrivee.
// Un livreur avec une course dans un de ces statuts ne doit JAMAIS
// recevoir de nouvelle proposition de dispatch.
export const STATUTS_ACTIFS_COURSE = [
  'livreur_en_route', 'client_contacte', 'en_route_expediteur',
  'arrive_prise_en_charge', 'colis_recupere',
  'passager_embarque', 'pris_en_charge', 'en_livraison', 'arrivee',
];

// Statuts actifs élargi (identique à STATUTS_ACTIFS_COURSE — unifié)
export const STATUTS_ACTIFS_VERIF = STATUTS_ACTIFS_COURSE;

// Map pays → indicatif téléphonique (avec +)
export const INDICATIFS: Record<string, string> = {
  BF: '+226', CI: '+225', TG: '+228', BJ: '+229', SN: '+221',
  ML: '+223', GN: '+224', NE: '+227', GH: '+233',
};

/**
 * Normalise un pourcentage de commission.
 * @returns Le pourcentage (0-100) ou null si invalide.
 */
export function normalizeCommissionPct(value: any): number | null {
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return pct;
}

// ── Cache des configs pays (TTL 5 min) ──
const COUNTRY_CONFIG_CACHE = new Map<string, { data: any; expires: number }>();
const COUNTRY_CONFIG_TTL_MS = 5 * 60 * 1000;

/**
 * Charge la configuration d'un pays depuis la DB avec cache TTL 5 min.
 * Évite les requêtes répétées dans accepter_course, valider_prix_manuel, calculPrixCourseExterne.
 */
export async function chargerConfigPays(base44: any, countryCode: string) {
  if (!countryCode) return null;
  const cached = COUNTRY_CONFIG_CACHE.get(countryCode);
  if (cached && cached.expires > Date.now()) return cached.data;
  try {
    const countries = await base44.asServiceRole.entities.Country.filter({ code: countryCode, actif: true });
    const data = countries?.[0] || null;
    COUNTRY_CONFIG_CACHE.set(countryCode, { data, expires: Date.now() + COUNTRY_CONFIG_TTL_MS });
    return data;
  } catch {
    return null;
  }
}