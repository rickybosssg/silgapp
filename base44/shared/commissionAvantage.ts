// ═══════════════════════════════════════════════════════════════════════════
// COMMISSION AVANTAGE — Logique partagée Pass Zéro Commission + Happy Hour
// ═══════════════════════════════════════════════════════════════════════════
//
// RÈGLE FINANCIÈRE ABSOLUE :
//   Un Pass ou Happy Hour ne remet JAMAIS montant_du_silga à zéro.
//   Les nouvelles courses éligibles ajoutent 0 F au dû. Le dû existant reste intact.
//   À expiration, les nouvelles courses recommencent à ajouter leur commission normale.
//
// ORDRE DE PRIORITÉ :
//   1. Happy Hour applicable au timestamp ? → taux promotionnel
//   2. Pass actif au timestamp ? → 0 %
//   3. Sinon → commission normale Country
//
// FIGEMENT À L'ACCEPTATION :
//   Le taux est déterminé au moment où le livreur accepte la course (heure_acceptation).
//   Une fois figé, la finalisation utilise ces valeurs sans réévaluer le Pass/Happy Hour.
//   L'expiration ultérieure du Pass ou la modification du Happy Hour ne modifie jamais
//   rétroactivement une course déjà figée.
//
// REDISPATCH :
//   Si A accepte puis annule, et B accepte ensuite, le taux est recalculé au moment
//   de l'acceptation de B. Les données figées correspondent au livreur qui réalise
//   finalement la course.
// ═══════════════════════════════════════════════════════════════════════════

import { chargerConfigPays, normalizeCommissionPct } from './dispatchConstants.ts';
import { normalizeEnterpriseId } from './enterpriseFinance.ts';

export interface AvantageCommission {
  taux_normal: number;        // Country.commission_pct
  taux_applique: number;      // taux effectif (peut être 0)
  mode: 'normal' | 'pass_zero' | 'happy_hour';
  pass_id: string | null;
  happy_hour_id: string | null;
}

/**
 * Vérifie si un PassAchat est actif à un timestamp donné.
 * Un Pass est actif si : statut=valide ET debut_at <= timestamp < expiration_at.
 */
export async function passActifAt(
  base44: any,
  livreurId: string,
  timestamp: Date
): Promise<{ actif: boolean; pass_id: string | null }> {
  if (!livreurId) return { actif: false, pass_id: null };

  const achats = await base44.asServiceRole.entities.PassAchat.filter({
    livreur_id: livreurId,
    statut: 'valide',
  }).catch(() => []);

  for (const achat of (achats || [])) {
    if (!achat.debut_at || !achat.expiration_at) continue;
    const debut = new Date(achat.debut_at);
    const fin = new Date(achat.expiration_at);
    if (timestamp >= debut && timestamp < fin) {
      return { actif: true, pass_id: achat.id };
    }
  }

  return { actif: false, pass_id: null };
}

/**
 * Vérifie si un Happy Hour est actif à un timestamp donné, pour un pays donné.
 * Un Happy Hour est actif si : actif=true ET le timestamp tombe dans la fenêtre
 * horaire (jour + heure_debut/heure_fin) dans le fuseau horaire configuré.
 */
export async function happyHourActifAt(
  base44: any,
  countryCode: string,
  timestamp: Date
): Promise<{ actif: boolean; config_id: string | null; taux_promotionnel: number }> {
  if (!countryCode) return { actif: false, config_id: null, taux_promotionnel: 0 };

  const configs = await base44.asServiceRole.entities.HappyHourConfig.filter({
    country_code: countryCode,
    actif: true,
  }).catch(() => []);

  for (const config of (configs || [])) {
    if (!config.heure_debut || !config.heure_fin) continue;

    // Convertir le timestamp dans le fuseau horaire du Happy Hour
    const tz = config.fuseau_horaire || 'Africa/Ouagadougou';
    const localTime = new Date(timestamp.toLocaleString('en-US', { timeZone: tz }));

    // Vérifier le jour
    if (config.recurrence === 'hebdomadaire' && config.jour_semaine != null) {
      const jourTs = localTime.getDay();
      if (jourTs !== Number(config.jour_semaine)) continue;
    } else if (config.recurrence === 'unique' && config.date_specifique) {
      const dateStr = localTime.toISOString().slice(0, 10);
      if (dateStr !== config.date_specifique) continue;
    }

    // Vérifier l'heure (comparaison HH:MM)
    const hh = String(localTime.getHours()).padStart(2, '0');
    const mm = String(localTime.getMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;

    if (timeStr >= config.heure_debut && timeStr < config.heure_fin) {
      return {
        actif: true,
        config_id: config.id,
        taux_promotionnel: Number(config.taux_promotionnel) || 0,
      };
    }
  }

  return { actif: false, config_id: null, taux_promotionnel: 0 };
}

/**
 * Évalue l'avantage de commission applicable à un timestamp donné.
 * READ-ONLY — ne modifie aucune donnée.
 *
 * Ordre :
 *   1. Happy Hour actif → taux promotionnel
 *   2. Pass actif → 0 %
 *   3. Sinon → commission normale Country
 *
 * @param base44 - client SDK
 * @param livreurId - ID du livreur qui accepte la course
 * @param countryCode - code pays de la course
 * @param timestamp - moment de l'acceptation
 * @returns { taux_normal, taux_applique, mode, pass_id, happy_hour_id }
 */
export async function evaluerAvantageCommission(
  base44: any,
  livreurId: string,
  countryCode: string,
  timestamp: Date
): Promise<AvantageCommission> {
  // Charger le taux normal du pays
  const countryConfig = await chargerConfigPays(base44, countryCode);
  const tauxNormal = normalizeCommissionPct(countryConfig?.commission_pct) ?? 20;

  // 1. Happy Hour actif au timestamp ?
  const hh = await happyHourActifAt(base44, countryCode, timestamp);
  if (hh.actif && hh.config_id) {
    return {
      taux_normal: tauxNormal,
      taux_applique: hh.taux_promotionnel,
      mode: 'happy_hour',
      pass_id: null,
      happy_hour_id: hh.config_id,
    };
  }

  // 2. Pass actif au timestamp ?
  const pass = await passActifAt(base44, livreurId, timestamp);
  if (pass.actif && pass.pass_id) {
    return {
      taux_normal: tauxNormal,
      taux_applique: 0,
      mode: 'pass_zero',
      pass_id: pass.pass_id,
      happy_hour_id: null,
    };
  }

  // 3. Commission normale
  return {
    taux_normal: tauxNormal,
    taux_applique: tauxNormal,
    mode: 'normal',
    pass_id: null,
    happy_hour_id: null,
  };
}

/**
 * Fige la commission sur une course au moment de l'acceptation.
 * Écrit commission_taux_normal, commission_taux_applique, commission_mode,
 * pass_id, happy_hour_id, commission_locked_at sur la course.
 *
 * À utiliser après l'updateMany d'acceptation, une fois que le livreur est
 * confirmé comme assigné à la course.
 *
 * REDISPATCH : si un nouveau livreur accepte (après annulation du précédent),
 * cette fonction recalcule le taux pour le NOUVEAU livreur au NOUVEAU timestamp.
 * Les anciennes données figées sont écrasées — le taux suit le livreur qui
 * réalise finalement la course.
 *
 * @param base44 - client SDK (asServiceRole)
 * @param courseId - ID de la course
 * @param livreurId - ID du livreur qui accepte
 * @param countryCode - code pays de la course
 * @param heureAcceptation - timestamp d'acceptation (ISO string)
 */
export async function figerCommissionAcceptation(
  base44: any,
  courseId: string,
  livreurId: string,
  countryCode: string,
  heureAcceptation: string
): Promise<AvantageCommission | null> {
  if (!courseId || !livreurId || !countryCode || !heureAcceptation) {
    console.warn(`[COMMISSION_LOCK] Paramètres manquants — course=${courseId || 'null'} livreur=${livreurId || 'null'} country=${countryCode || 'null'} heure=${heureAcceptation || 'null'}`);
    return null;
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // ENTERPRISE : Les courses Enterprise sont TOTALEMENT indépendantes des
    // avantages publics (Happy Hour, Pass, Pass Code). Le taux est verrouillé
    // selon enterprise_commission_rate_locked (si déjà figé) ou le taux actuel
    // de l'enterprise. Les champs Happy Hour / Pass ne sont JAMAIS settés.
    // IDEMPOTENT : si enterprise_commission_rate_locked est déjà présent, ne
    // pas le remplacer.
    // ═══════════════════════════════════════════════════════════════════════
    const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
    if (course && normalizeEnterpriseId(course.enterprise_id)) {
      // ── Idempotence : ne pas remplacer un taux déjà figé ──
      if (course.enterprise_commission_rate_locked != null && course.enterprise_commission_locked_at) {
        const tauxExistant = Number(course.enterprise_commission_rate_locked);
        console.log(`[COMMISSION_LOCK] Course Enterprise ${courseId} déjà figée à ${tauxExistant}% — skip re-figement`);
        return {
          taux_normal: tauxExistant,
          taux_applique: tauxExistant,
          mode: 'normal',
          pass_id: null,
          happy_hour_id: null,
        };
      }

      // ── Charger le taux Enterprise depuis l'entreprise ──
      const enterprises = await base44.asServiceRole.entities.Enterprise.filter({
        enterprise_financier_id: normalizeEnterpriseId(course.enterprise_id),
      }).catch(() => []);
      const enterprise = enterprises?.[0];
      const tauxEnterprise = Number(enterprise?.commission_silgapp_pct);
      if (!Number.isFinite(tauxEnterprise) || tauxEnterprise < 0) {
        console.error(`[COMMISSION_LOCK] Course Enterprise ${courseId} — taux invalide sur l'entreprise, fallback normal`);
        // Ne pas bloquer l'acceptation — fallback vers evaluerAvantageCommission
      } else {
        // ── Figer le taux Enterprise (UNE SEULE FOIS) ──
        const nowIso = new Date().toISOString();
        await base44.asServiceRole.entities.CourseExterne.update(courseId, {
          enterprise_commission_rate_locked: tauxEnterprise,
          enterprise_commission_locked_at: nowIso,
          // commission_taux_applique = 0 pour que le livreur ne soit pas débité
          // (la commission Enterprise est payée par l'entreprise via EnterpriseLedger)
          commission_taux_normal: tauxEnterprise,
          commission_taux_applique: 0,
          commission_mode: 'normal',
          pass_id: '',
          happy_hour_id: '',
          commission_locked_at: nowIso,
        });

        console.log(`[COMMISSION_LOCK] Course Enterprise ${courseId} figée: mode=normal taux_enterprise=${tauxEnterprise}% (commission_silga=0 — payée par entreprise) livreur=${livreurId}`);
        return {
          taux_normal: tauxEnterprise,
          taux_applique: 0,
          mode: 'normal',
          pass_id: null,
          happy_hour_id: null,
        };
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC (enterprise_id null/absent) : comportement inchangé — Happy Hour,
    // Pass et commission normale du pays s'appliquent comme avant.
    // ═══════════════════════════════════════════════════════════════════════
    const avantage = await evaluerAvantageCommission(
      base44,
      livreurId,
      countryCode,
      new Date(heureAcceptation)
    );

    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      commission_taux_normal: avantage.taux_normal,
      commission_taux_applique: avantage.taux_applique,
      commission_mode: avantage.mode,
      pass_id: avantage.pass_id || '',
      happy_hour_id: avantage.happy_hour_id || '',
      commission_locked_at: new Date().toISOString(),
    });

    console.log(`[COMMISSION_LOCK] Course ${courseId} figée: mode=${avantage.mode} taux=${avantage.taux_applique}% (normal=${avantage.taux_normal}%) livreur=${livreurId}`);
    return avantage;
  } catch (err: any) {
    console.error(`[COMMISSION_LOCK] ÉCHEC figement — course=${courseId} livreur=${livreurId} country=${countryCode} heure_acceptation=${heureAcceptation} erreur="${err?.message || String(err)}"`);
    return null;
  }
}

/**
 * Vérifie si un Pass est actuellement actif pour un livreur (maintenant).
 * Utilisé par le frontend pour afficher le badge Pass actif.
 */
export async function verifierPassActifMaintenant(
  base44: any,
  livreurId: string
): Promise<{ actif: boolean; expiration_at: string | null; pass_nom: string | null }> {
  if (!livreurId) return { actif: false, expiration_at: null, pass_nom: null };

  const now = new Date();
  const achats = await base44.asServiceRole.entities.PassAchat.filter({
    livreur_id: livreurId,
    statut: 'valide',
  }).catch(() => []);

  for (const achat of (achats || [])) {
    if (!achat.debut_at || !achat.expiration_at) continue;
    const debut = new Date(achat.debut_at);
    const fin = new Date(achat.expiration_at);
    if (now >= debut && now < fin) {
      return {
        actif: true,
        expiration_at: achat.expiration_at,
        pass_nom: achat.pass_offer_nom || null,
      };
    }
  }

  return { actif: false, expiration_at: null, pass_nom: null };
}

/**
 * Vérifie si un Happy Hour est actuellement actif pour un pays (maintenant).
 * Utilisé par le frontend pour afficher le badge Happy Hour actif.
 */
export async function verifierHappyHourActifMaintenant(
  base44: any,
  countryCode: string
): Promise<{ actif: boolean; fin_at: string | null; taux: number | null }> {
  if (!countryCode) return { actif: false, fin_at: null, taux: null };

  const hh = await happyHourActifAt(base44, countryCode, new Date());
  if (!hh.actif) return { actif: false, fin_at: null, taux: null };

  // Calculer l'heure de fin en ISO pour le compte à rebours
  // On ne peut pas connaître l'heure de fin exacte sans la config complète,
  // mais on peut la retrouver
  const configs = await base44.asServiceRole.entities.HappyHourConfig.filter({
    country_code: countryCode,
    actif: true,
  }).catch(() => []);

  for (const config of (configs || [])) {
    if (config.id === hh.config_id && config.heure_fin) {
      const tz = config.fuseau_horaire || 'Africa/Ouagadougou';
      const now = new Date();
      const localTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
      const [finH, finM] = config.heure_fin.split(':').map(Number);
      localTime.setHours(finH, finM, 0, 0);
      // Si l'heure de fin est passée aujourd'hui (devrait pas arriver car actif), on garde quand même
      return {
        actif: true,
        fin_at: localTime.toISOString(),
        taux: hh.taux_promotionnel,
      };
    }
  }

  return { actif: true, fin_at: null, taux: hh.taux_promotionnel };
}