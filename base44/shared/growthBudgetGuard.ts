// ═══════════════════════════════════════════════════════════════════════════
// GROWTH BUDGET GUARD — Circuit breaker à sous-plafonds
// ═══════════════════════════════════════════════════════════════════════════
//
// RÔLE : Vérifier les budgets Growth et bloquer les moteurs concernés
// lorsqu'un sous-plafond est atteint.
//
// HIÉRARCHIE :
//   Niveau 1 — Sous-plafonds par canal (acquisition, primes, réactivation)
//              Le dépassement bloque UNIQUEMENT le moteur concerné.
//   Niveau 2 — Plafond global (dernier rempart)
//              Le dépassement bloque TOUS les moteurs Growth.
//
// Le moteur ne peut JAMAIS augmenter les plafonds. Seul un Super Admin peut.
//
// NE MODIFIE PAS : Dispatch V2, finance livreur, tarification, paiements.
// ═══════════════════════════════════════════════════════════════════════════

import { getCurrentMonthRange } from './growthEventNormalizer.ts';

// ── Configuration des canaux budget ──
export const BUDGET_CHANNELS = {
  acquisition: {
    moteurs: ['publicite'],
    config_cap_key: 'GROWTH_BUDGET_ACQUISITION_PER_MONTH',
    kill_switches: ['META_ACQUISITION_ENABLED'],
    label: 'Acquisition (Meta Ads)',
  },
  primes: {
    moteurs: ['prime_promo'],
    config_cap_key: 'GROWTH_BUDGET_PRIMES_PER_MONTH',
    kill_switches: ['PRIME_PROMO_AUTO_ENABLED'],
    label: 'Primes parrainage',
  },
  reactivation: {
    moteurs: ['reactivation', 'relance_premiere_course', 'rappels_habitude'],
    config_cap_key: 'GROWTH_BUDGET_REACTIVATION_PER_MONTH',
    kill_switches: ['REACTIVATION_AUTO_ENABLED', 'FIRST_COURSE_RELANCE_SEND_ENABLED', 'HABIT_REMINDER_ENABLED'],
    label: 'Réactivation & rétention',
  },
};

export const GLOBAL_BUDGET_CONFIG_KEY = 'GROWTH_TOTAL_BUDGET_PER_MONTH';
export const KILL_SWITCH_CONFIG_KEY = 'GROWTH_AUTOPILOTE_KILL_SWITCH';
export const LOCK_CONFIG_KEY = 'GROWTH_BUDGET_LOCK';
export const ALERT_THRESHOLD_PCT = 0.80;

// ── Helper : lire une valeur AppConfig ──
export function getConfigValue(configs: any[], key: string): string | null {
  const config = configs.find(c => c.cle === key);
  return config?.valeur || null;
}

// ── Helper : calculer les dépenses par moteur pour le mois courant ──
export function computeSpendByMoteur(growthSpends: any[]): Record<string, number> {
  const { start, end } = getCurrentMonthRange();
  const byMoteur: Record<string, number> = {};

  for (const spend of growthSpends) {
    if (spend.statut === 'annulee') continue;
    const spendTs = spend.date_depense ? new Date(spend.date_depense).getTime() : 0;
    if (spendTs < start || spendTs > end) continue;
    const moteur = spend.moteur || 'autre';
    byMoteur[moteur] = (byMoteur[moteur] || 0) + (spend.montant || 0);
  }

  return byMoteur;
}

// ── Vérifier les budgets et bloquer les moteurs si nécessaire ──
export async function checkGrowthBudget(base44: any): Promise<{
  channels: Record<string, { spent: number; cap: number; exceeded: boolean; alert: boolean }>;
  global: { spent: number; cap: number; exceeded: boolean; alert: boolean };
  any_exceeded: boolean;
  kill_switch_activated: boolean;
  actions_taken: string[];
}> {
  const actionsTaken: string[] = [];

  // ── Lire toutes les configs ──
  const configs = await base44.asServiceRole.entities.AppConfig.list().catch(() => []);
  const growthSpends = await base44.asServiceRole.entities.GrowthSpend.filter(
    { statut: ['engagee', 'payee'] },
    '-date_depense', 500
  ).catch(() => []);

  const spendByMoteur = computeSpendByMoteur(growthSpends);
  const globalCap = parseInt(getConfigValue(configs, GLOBAL_BUDGET_CONFIG_KEY) || '0') || 0;

  // ── Calculer les dépenses par canal ──
  const channels: Record<string, any> = {};
  let totalGrowthSpend = 0;

  for (const [channelKey, channelConfig] of Object.entries(BUDGET_CHANNELS)) {
    const channelSpend = channelConfig.moteurs.reduce(
      (sum: number, m: string) => sum + (spendByMoteur[m] || 0),
      0
    );
    const channelCap = parseInt(getConfigValue(configs, channelConfig.config_cap_key) || '0') || 0;
    const exceeded = channelCap > 0 && channelSpend >= channelCap;
    const alert = channelCap > 0 && channelSpend >= channelCap * ALERT_THRESHOLD_PCT;

    channels[channelKey] = {
      spent: channelSpend,
      cap: channelCap,
      exceeded,
      alert,
    };
    totalGrowthSpend += channelSpend;

    // ── Niveau 1 : bloquer le moteur concerné si sous-plafond dépassé ──
    if (exceeded) {
      for (const killSwitchKey of channelConfig.kill_switches) {
        const currentVal = getConfigValue(configs, killSwitchKey);
        if (currentVal === 'true') {
          const configId = configs.find(c => c.cle === killSwitchKey)?.id;
          if (configId) {
            await base44.asServiceRole.entities.AppConfig.update(configId, { valeur: 'false' }).catch(() => {});
            actionsTaken.push(`Désactivé ${killSwitchKey} (canal ${channelKey} : ${channelSpend}/${channelCap} FCFA)`);
          }
        }
      }
    }
  }

  // ── Niveau 2 : plafond global (dernier rempart) ──
  const globalExceeded = globalCap > 0 && totalGrowthSpend >= globalCap;
  const globalAlert = globalCap > 0 && totalGrowthSpend >= globalCap * ALERT_THRESHOLD_PCT;

  if (globalExceeded) {
    // Désactiver TOUS les moteurs Growth
    const allKillSwitches = [
      ...BUDGET_CHANNELS.acquisition.kill_switches,
      ...BUDGET_CHANNELS.primes.kill_switches,
      ...BUDGET_CHANNELS.reactivation.kill_switches,
    ];

    for (const killSwitchKey of allKillSwitches) {
      const currentVal = getConfigValue(configs, killSwitchKey);
      if (currentVal === 'true') {
        const configId = configs.find(c => c.cle === killSwitchKey)?.id;
        if (configId) {
          await base44.asServiceRole.entities.AppConfig.update(configId, { valeur: 'false' }).catch(() => {});
          actionsTaken.push(`Désactivé ${killSwitchKey} (plafond global dépassé : ${totalGrowthSpend}/${globalCap} FCFA)`);
        }
      }
    }

    // Activer le kill switch global
    const killSwitchConfig = configs.find(c => c.cle === KILL_SWITCH_CONFIG_KEY);
    if (killSwitchConfig && killSwitchConfig.valeur !== 'true') {
      await base44.asServiceRole.entities.AppConfig.update(killSwitchConfig.id, { valeur: 'true' }).catch(() => {});
      actionsTaken.push(`Kill switch global activé (plafond global dépassé)`);
    }
  }

  const anyExceeded = Object.values(channels).some((c: any) => c.exceeded) || globalExceeded;
  const killSwitchActive = getConfigValue(configs, KILL_SWITCH_CONFIG_KEY) === 'true';

  return {
    channels,
    global: { spent: totalGrowthSpend, cap: globalCap, exceeded: globalExceeded, alert: globalAlert },
    any_exceeded: anyExceeded,
    kill_switch_activated: killSwitchActive,
    actions_taken: actionsTaken,
  };
}