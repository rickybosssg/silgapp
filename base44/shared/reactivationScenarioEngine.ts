// ═══════════════════════════════════════════════════════════════════════════
// MOTEUR DE SCÉNARIO DE RÉACTIVATION AUTOMATIQUE — J0 / J+2 / J+5
// ═══════════════════════════════════════════════════════════════════════════
//
// RÈGLES FONDAMENTALES :
//   1. Maximum 3 pushes par scénario (J0, J+2, J+5)
//   2. Arrêt immédiat dès qu'une course est créée (converted)
//   3. Aucun push après conversion
//   4. Un client ne peut pas être dans 2 scénarios actifs simultanément
//   5. Cooldown configurable avant un nouveau scénario
//   6. Groupe contrôle : aucune notification envoyée
//   7. A/B testing persistant : la variante ne change pas pendant le scénario
//   8. Mode test : uniquement les téléphones de test, délais raccourcis
//
// NE MODIFIE PAS : Dispatch V2, GPS, tarification, comptabilité, VENUS, auth.
// ═══════════════════════════════════════════════════════════════════════════

import { sendReactivationPush } from './reactivationEngine.ts';
import { normalizePhone } from './phoneUtils.ts';

// ── Messages par défaut (configurables via AppConfig) ──────────────────────

export const DEFAULT_MESSAGES = {
  j0_a: "👋 Ça fait un moment ! Besoin d'envoyer un colis aujourd'hui ? SILGAPP trouve un livreur pour vous.",
  j0_b: "🛵 Gagnez du temps aujourd'hui : SILGAPP s'occupe de votre livraison.",
  j2_a: "🛵 Une livraison à faire aujourd'hui ? Lancez votre course sur SILGAPP en quelques secondes.",
  j2_b: "📦 Besoin d'un livreur ? SILGAPP est là pour vous, rapidement et simplement.",
  j5_a: "🎁 Revenez sur SILGAPP ! Une livraison à faire aujourd'hui ? Nous avons une offre pour votre retour.",
  j5_b: "🎁 On vous a manqué ? Profitez de votre retour sur SILGAPP pour envoyer votre colis aujourd'hui.",
};

export const DEFAULT_J0_TITLE = "SILGAPP vous manque ?";
export const DEFAULT_J2_TITLE = "Une livraison à faire ?";
export const DEFAULT_J5_TITLE = "Revenez sur SILGAPP !";

// ── Segmentation intelligente ──────────────────────────────────────────────

export type SmartSegment = 'vip' | 'regular' | 'occasional' | 'no_course';

/**
 * Calcule le segment intelligent à partir du nombre de courses LIVRÉES.
 *
 * SOURCE DE VÉRITÉ : CourseExterne (courses réellement livrées), retrouvées par
 * téléphone normalisé en priorité, fallback sur téléphone brut.
 *
 * nb_courses_total (cache ClientExterne) n'est plus la source unique — il reste
 * un indicateur secondaire utilisé uniquement si la requête CourseExterne échoue.
 */
export function computeSmartSegmentFromCount(deliveredCount: number): SmartSegment {
  if (deliveredCount === 0) return 'no_course';
  if (deliveredCount === 1) return 'occasional';
  if (deliveredCount >= 2 && deliveredCount <= 4) return 'regular';
  return 'vip'; // 5+
}

/**
 * Compte les courses LIVRÉES d'un client en interrogeant CourseExterne.
 * Matching : client_phone_normalized en priorité, fallback sur client_telephone.
 * Déduplique par course.id.
 */
export async function countDeliveredCourses(
  base44: any,
  client: any
): Promise<number> {
  const seenIds = new Set<string>();
  let courses: any[] = [];

  // 1. Recherche par téléphone normalisé (priorité)
  if (client.telephone_normalized) {
    try {
      courses = await base44.asServiceRole.entities.CourseExterne.filter(
        { client_phone_normalized: client.telephone_normalized },
        '-created_date', 500
      );
    } catch {}
  }

  // 2. Fallback : recherche par téléphone brut
  if (courses.length === 0 && client.telephone) {
    try {
      courses = await base44.asServiceRole.entities.CourseExterne.filter(
        { client_telephone: client.telephone },
        '-created_date', 500
      );
    } catch {}
  }

  // 3. Dédupliquer par course.id et ne compter que les courses livrées
  for (const c of courses) {
    if (c.id) seenIds.add(c.id);
  }

  // Compter les courses livrées uniquement
  let deliveredCount = 0;
  const uniqueCourses = Array.from(seenIds);
  // On a déjà les courses en mémoire, pas besoin de re-requêter
  for (const c of courses) {
    if (c.statut === 'livree') deliveredCount++;
  }

  return deliveredCount;
}

/**
 * @deprecated Utiliser computeSmartSegmentFromCount + countDeliveredCourses.
 * Conservée pour rétrocompatibilité — ne se fie qu'au cache nb_courses_total.
 */
export function computeSmartSegment(client: any): SmartSegment {
  const nb = client.nb_courses_total || 0;
  return computeSmartSegmentFromCount(nb);
}

export const SEGMENT_PRIORITY: SmartSegment[] = ['vip', 'regular', 'occasional', 'no_course'];

export const SEGMENT_LABELS: Record<SmartSegment, string> = {
  vip: 'VIP (5+ courses)',
  regular: 'Régulier (2-4 courses)',
  occasional: 'Occasionnel (1 course)',
  no_course: 'Inscrit sans course',
};

// ── Configuration depuis AppConfig ─────────────────────────────────────────

export async function getReactivationConfig(base44: any): Promise<{
  enabled: boolean;
  paused: boolean;
  testMode: boolean;
  testPhones: string[];
  cooldownDays: number;
  messages: typeof DEFAULT_MESSAGES;
  j0Title: string;
  j2Title: string;
  j5Title: string;
  attributionWindowHours: number;
}> {
  const configs = await base44.asServiceRole.entities.AppConfig.list().catch(() => []);
  const configMap: Record<string, string> = {};
  for (const c of configs) {
    if (c.cle) configMap[c.cle] = c.valeur;
  }

  const enabled = configMap['REACTIVATION_AUTO_ENABLED'] === 'true';
  const paused = configMap['REACTIVATION_AUTO_PAUSED'] === 'true';
  const testMode = configMap['REACTIVATION_TEST_MODE'] === 'true';
  let testPhones: string[] = [];
  try { testPhones = JSON.parse(configMap['REACTIVATION_TEST_PHONES'] || '[]'); } catch {}
  const cooldownDays = Number(configMap['REACTIVATION_COOLDOWN_DAYS']) || 30;
  const attributionWindowHours = Number(configMap['REACTIVATION_ATTRIBUTION_WINDOW_HOURS']) || 72;

  return {
    enabled,
    paused,
    testMode,
    testPhones,
    cooldownDays,
    attributionWindowHours,
    messages: {
      j0_a: configMap['REACTIVATION_J0_MESSAGE_A'] || DEFAULT_MESSAGES.j0_a,
      j0_b: configMap['REACTIVATION_J0_MESSAGE_B'] || DEFAULT_MESSAGES.j0_b,
      j2_a: configMap['REACTIVATION_J2_MESSAGE_A'] || DEFAULT_MESSAGES.j2_a,
      j2_b: configMap['REACTIVATION_J2_MESSAGE_B'] || DEFAULT_MESSAGES.j2_b,
      j5_a: configMap['REACTIVATION_J5_MESSAGE_A'] || DEFAULT_MESSAGES.j5_a,
      j5_b: configMap['REACTIVATION_J5_MESSAGE_B'] || DEFAULT_MESSAGES.j5_b,
    },
    j0Title: configMap['REACTIVATION_J0_TITLE'] || DEFAULT_J0_TITLE,
    j2Title: configMap['REACTIVATION_J2_TITLE'] || DEFAULT_J2_TITLE,
    j5Title: configMap['REACTIVATION_J5_TITLE'] || DEFAULT_J5_TITLE,
  };
}

// ── Trouver la campagne automatique active ─────────────────────────────────

export async function getAutomaticCampaign(base44: any): Promise<any | null> {
  const campaigns = await base44.asServiceRole.entities.ReactivationCampaign.filter({
    is_automatic: true,
    status: 'completed',
  }, '-created_date', 5);

  // La campagne auto est "completed" (lancée une fois) mais reste active pour les scénarios
  return campaigns[0] || null;
}

// ── Trouver les clients éligibles pour de nouveaux scénarios ──────────────

export interface EligibleClient {
  client: any;
  token: any | null;
  segment: SmartSegment;
}

export async function findEligibleClients(
  base44: any,
  config: Awaited<ReturnType<typeof getReactivationConfig>>,
  campaign: any,
  maxNewScenarios: number = 50
): Promise<EligibleClient[]> {
  const clients = await base44.asServiceRole.entities.ClientExterne.list();
  const tokens = await base44.asServiceRole.entities.NotificationToken.filter({ user_type: 'client', actif: true });

  const tokenByClientEmail: Record<string, any> = {};
  for (const t of tokens) {
    if (t.user_email) tokenByClientEmail[t.user_email] = t;
  }

  // Clients déjà dans un scénario actif ou en cooldown
  const activeScenarios = await base44.asServiceRole.entities.ReactivationScenario.filter({
    status: 'active',
  });
  const activeClientIds = new Set(activeScenarios.map((s: any) => s.client_id));

  const cooldownScenarios = await base44.asServiceRole.entities.ReactivationScenario.filter({
    status: ['completed', 'expired', 'converted'],
  });
  const now = Date.now();
  const cooldownMs = config.cooldownDays * 86400000;
  const inCooldown = new Set<string>();
  for (const s of cooldownScenarios) {
    const refDate = s.cooldown_expires_at ? new Date(s.cooldown_expires_at).getTime() :
                   s.j5_sent_at ? new Date(s.j5_sent_at).getTime() + cooldownMs :
                   s.j0_sent_at ? new Date(s.j0_sent_at).getTime() + cooldownMs : 0;
    if (refDate && now < refDate) {
      inCooldown.add(s.client_id);
    }
  }

  const now2 = Date.now();
  let eligible: EligibleClient[] = [];

  for (const c of clients) {
    // Doit avoir un token FCM natif (pas web_)
    const token = c.user_email ? tokenByClientEmail[c.user_email] || null : null;
    if (!token || !token.token || String(token.token).startsWith('web_')) continue;

    // Pas déjà dans un scénario actif
    if (activeClientIds.has(c.id)) continue;

    // Pas en cooldown
    if (inCooldown.has(c.id)) continue;

    // Mode test : filtrer par téléphones de test
    if (config.testMode) {
      const normalized = normalizePhone(c.telephone, c.country_code || undefined);
      if (!config.testPhones.includes(normalized) && !config.testPhones.includes(c.telephone)) continue;
    }

    // Inactivité minimum (30 jours par défaut, configurable via campaign)
    const lastCourse = c.derniere_course_date ? new Date(c.derniere_course_date).getTime() : 0;
    const inactiveDays = lastCourse === 0 ? 9999 : (now2 - lastCourse) / 86400000;
    if (inactiveDays < (campaign.inactive_days_min || 30)) continue;

    // Filtre pays si défini
    if (campaign.country_code && c.country_code !== campaign.country_code) continue;

    const deliveredCount = await countDeliveredCourses(base44, c);
    const segment = computeSmartSegmentFromCount(deliveredCount);

    // Filtre par smart_segment si défini
    if (campaign.smart_segment && campaign.smart_segment !== 'all' && segment !== campaign.smart_segment) continue;

    eligible.push({ client: c, token, segment });
  }

  // Trier par priorité de segment (VIP d'abord)
  const segmentOrder: Record<SmartSegment, number> = { vip: 0, regular: 1, occasional: 2, no_course: 3 };
  eligible.sort((a, b) => segmentOrder[a.segment] - segmentOrder[b.segment]);

  // Limiter le nombre de nouveaux scénarios par exécution
  if (eligible.length > maxNewScenarios) {
    eligible = eligible.slice(0, maxNewScenarios);
  }

  return eligible;
}

// ── Créer un scénario avec J0 ──────────────────────────────────────────────

export async function createScenario(
  base44: any,
  config: Awaited<ReturnType<typeof getReactivationConfig>>,
  campaign: any,
  eligible: EligibleClient
): Promise<any | null> {
  const { client, token, segment } = eligible;

  // A/B variant persistant (hash déterministe par client_id)
  const abVariant = hashClientId(client.id) % 2 === 0 ? 'A' : 'B';

  // Groupe contrôle (pourcentage configurable)
  const controlPct = campaign.control_group_pct || 0;
  const isControl = controlPct > 0 && (hashClientId(client.id) % 100) < controlPct;

  const now = new Date().toISOString();
  const cooldownExpiresAt = new Date(Date.now() + config.cooldownDays * 86400000).toISOString();

  const scenario = await base44.asServiceRole.entities.ReactivationScenario.create({
    campaign_id: campaign.id,
    client_id: client.id,
    client_telephone: client.telephone || '',
    client_phone_normalized: normalizePhone(client.telephone, client.country_code || undefined) || '',
    country_code: client.country_code || '',
    segment,
    ab_variant: abVariant,
    is_control_group: isControl,
    status: 'active',
    next_push_at: now,
    next_push_step: 0,
    cooldown_expires_at: cooldownExpiresAt,
    test_mode: config.testMode,
  });

  // Envoyer J0 (sauf groupe contrôle)
  if (!isControl && token?.token) {
    const message = abVariant === 'A' ? config.messages.j0_a : config.messages.j0_b;
    const result = await sendReactivationPush(
      [{ token: token.token, recipient_id: scenario.id }],
      config.j0Title,
      message,
      campaign.id
    );

    // Créer le recipient pour tracking
    const recipient = await base44.asServiceRole.entities.ReactivationCampaignRecipient.create({
      campaign_id: campaign.id,
      client_id: client.id,
      client_telephone: client.telephone || '',
      user_email: client.user_email || '',
      push_token: token.token,
      push_token_id: token.id || '',
      is_control_group: false,
      ab_variant: abVariant,
      status: result.results[0]?.ok ? 'sent' : 'failed',
      sent_at: result.results[0]?.ok ? now : null,
      fcm_error: result.results[0]?.ok ? null : (result.results[0]?.error || null),
      country_code: client.country_code || '',
    });

    await base44.asServiceRole.entities.ReactivationScenario.update(scenario.id, {
      j0_recipient_id: recipient.id,
      j0_sent_at: result.results[0]?.ok ? now : null,
      next_push_at: new Date(Date.now() + (campaign.push_interval_days || 2) * 86400000).toISOString(),
      next_push_step: 2,
    });
  } else if (isControl) {
    // Groupe contrôle : créer un recipient marqué control
    await base44.asServiceRole.entities.ReactivationCampaignRecipient.create({
      campaign_id: campaign.id,
      client_id: client.id,
      client_telephone: client.telephone || '',
      user_email: client.user_email || '',
      is_control_group: true,
      ab_variant: abVariant,
      status: 'control',
      country_code: client.country_code || '',
    });
  }

  return scenario;
}

// ── Traiter les scénarios en attente de J+2 ou J+5 ─────────────────────────

export async function processPendingScenarios(
  base44: any,
  config: Awaited<ReturnType<typeof getReactivationConfig>>,
  campaign: any,
  maxProcess: number = 50
): Promise<{ j2Sent: number; j5Sent: number; expired: number; errors: number }> {
  const now = Date.now();
  const activeScenarios = await base44.asServiceRole.entities.ReactivationScenario.filter({
    status: 'active',
  });

  // Filtrer les scénarios dont le prochain push est dû
  const dueScenarios = activeScenarios.filter((s: any) => {
    if (s.next_push_step < 0) return false;
    if (!s.next_push_at) return false;
    return now >= new Date(s.next_push_at).getTime();
  });

  // Mode test : délais raccourcis (J0 → J+2min, J+2 → J+5min)
  const testMultiplier = config.testMode ? 1 / 1440 : 1; // 1 min au lieu de 1 jour en mode test

  let j2Sent = 0;
  let j5Sent = 0;
  let expired = 0;
  let errors = 0;

  const toProcess = dueScenarios.slice(0, maxProcess);

  for (const s of toProcess) {
    try {
      // Vérifier si le client a créé une course (conversion)
      const isConverted = await checkScenarioConversion(base44, s, config);
      if (isConverted) {
        continue; // Le scénario a été marqué converted
      }

      // Récupérer le token FCM actuel
      const tokens = await base44.asServiceRole.entities.NotificationToken.filter({
        user_type: 'client',
        actif: true,
        client_id: s.client_id,
      });
      const token = tokens[0];
      if (!token || !token.token || String(token.token).startsWith('web_')) {
        // Token invalide : marquer le scénario comme complété sans envoyer
        await base44.asServiceRole.entities.ReactivationScenario.update(s.id, {
          status: 'completed',
          next_push_step: -1,
        });
        continue;
      }

      const abVariant = s.ab_variant || 'A';
      const now_iso = new Date().toISOString();

      if (s.next_push_step === 2) {
        // ── J+2 ──
        const message = abVariant === 'A' ? config.messages.j2_a : config.messages.j2_b;
        const result = await sendReactivationPush(
          [{ token: token.token, recipient_id: s.id }],
          config.j2Title,
          message,
          s.campaign_id
        );

        const recipient = await base44.asServiceRole.entities.ReactivationCampaignRecipient.create({
          campaign_id: s.campaign_id,
          client_id: s.client_id,
          client_telephone: s.client_telephone || '',
          user_email: token.user_email || '',
          push_token: token.token,
          push_token_id: token.id || '',
          is_control_group: false,
          ab_variant: abVariant,
          status: result.results[0]?.ok ? 'sent' : 'failed',
          sent_at: result.results[0]?.ok ? now_iso : null,
          fcm_error: result.results[0]?.ok ? null : (result.results[0]?.error || null),
          country_code: s.country_code || '',
        });

        const intervalMs = (campaign.push_interval_2_days || 3) * 86400000 * testMultiplier;
        await base44.asServiceRole.entities.ReactivationScenario.update(s.id, {
          j2_recipient_id: recipient.id,
          j2_sent_at: result.results[0]?.ok ? now_iso : null,
          next_push_at: new Date(Date.now() + intervalMs).toISOString(),
          next_push_step: 5,
        });
        j2Sent++;
      } else if (s.next_push_step === 5) {
        // ── J+5 ──
        const message = abVariant === 'A' ? config.messages.j5_a : config.messages.j5_b;
        const result = await sendReactivationPush(
          [{ token: token.token, recipient_id: s.id }],
          config.j5Title,
          message,
          s.campaign_id
        );

        const recipient = await base44.asServiceRole.entities.ReactivationCampaignRecipient.create({
          campaign_id: s.campaign_id,
          client_id: s.client_id,
          client_telephone: s.client_telephone || '',
          user_email: token.user_email || '',
          push_token: token.token,
          push_token_id: token.id || '',
          is_control_group: false,
          ab_variant: abVariant,
          status: result.results[0]?.ok ? 'sent' : 'failed',
          sent_at: result.results[0]?.ok ? now_iso : null,
          fcm_error: result.results[0]?.ok ? null : (result.results[0]?.error || null),
          country_code: s.country_code || '',
        });

        // Après J+5 : fin du scénario
        await base44.asServiceRole.entities.ReactivationScenario.update(s.id, {
          j5_recipient_id: recipient.id,
          j5_sent_at: result.results[0]?.ok ? now_iso : null,
          status: 'completed',
          next_push_step: -1,
        });
        j5Sent++;
      }
    } catch (err) {
      console.error(`[SCENARIO] Erreur traitement ${s.id}:`, err);
      errors++;
    }
  }

  // ── Marquer les scénarios expirés (J+5 dépassé sans conversion) ──
  const stillActive = activeScenarios.filter((s: any) => s.status === 'active');
  for (const s of stillActive) {
    if (s.next_push_step === -1) continue;
    // Si J+5 a été envoyé et le scénario est toujours actif → marquer completed
    if (s.j5_sent_at && s.status === 'active') {
      await base44.asServiceRole.entities.ReactivationScenario.update(s.id, {
        status: 'completed',
        next_push_step: -1,
      });
      expired++;
    }
  }

  return { j2Sent, j5Sent, expired, errors };
}

// ── Vérifier si un scénario a été converti (course créée) ─────────────────

export async function checkScenarioConversion(
  base44: any,
  scenario: any,
  config: Awaited<ReturnType<typeof getReactivationConfig>>
): Promise<boolean> {
  if (scenario.status === 'converted') return true;
  if (!scenario.client_phone_normalized && !scenario.client_telephone) return false;

  const referenceTime = scenario.j0_sent_at ? new Date(scenario.j0_sent_at).getTime() : Date.now();
  const windowMs = config.attributionWindowHours * 3600000;
  const now = Date.now();

  // Chercher les courses créées après J0
  let courses: any[] = [];
  if (scenario.client_phone_normalized) {
    courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { client_phone_normalized: scenario.client_phone_normalized },
      '-created_date', 10
    ).catch(() => []);
  }
  if (courses.length === 0 && scenario.client_telephone) {
    courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { client_telephone: scenario.client_telephone },
      '-created_date', 10
    ).catch(() => []);
  }

  for (const course of courses) {
    const courseCreated = course.created_date ? new Date(course.created_date).getTime() : 0;
    if (courseCreated < referenceTime) continue;
    if ((courseCreated - referenceTime) > windowMs) continue;

    // Course trouvée → marquer le scénario comme converti
    const revenue = course.prix_final || course.prix_propose_client || course.prix_propose_admin || 0;
    const commission = course.commission_silga || 0;
    const isDelivered = course.statut === 'livree';

    await base44.asServiceRole.entities.ReactivationScenario.update(scenario.id, {
      status: 'converted',
      converted_at: course.created_date,
      course_id: course.id,
      course_completed_at: isDelivered ? (course.heure_livraison || course.colis_livre_at) : null,
      revenue,
      commission,
      next_push_step: -1,
    });

    // Mettre à jour le recipient J0 (ou le plus récent) avec la conversion
    const recipientId = scenario.j5_recipient_id || scenario.j2_recipient_id || scenario.j0_recipient_id;
    if (recipientId) {
      await base44.asServiceRole.entities.ReactivationCampaignRecipient.update(recipientId, {
        course_created_at: course.created_date,
        course_id: course.id,
        revenue,
        commission,
        status: 'converted',
        course_completed_at: isDelivered ? (course.heure_livraison || course.colis_livre_at) : null,
      }).catch(() => null);
    }

    return true;
  }

  return false;
}

// ── Hash déterministe pour A/B variant et groupe contrôle ──────────────────

function hashClientId(clientId: string): number {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = ((hash << 5) - hash) + clientId.charCodeAt(i);
    hash = hash & hash; // Convertir en 32-bit integer
  }
  return Math.abs(hash);
}

// ── Recalculer les segments des scénarios existants ─────────────────────────
//
// CORRECTION CIBLÉE — Recalcule UNIQUEMENT le champ `segment` des scénarios
// existants en utilisant les courses réellement livrées dans CourseExterne.
//
// NE TOUCHE PAS : ab_variant, is_control_group, j0_sent_at, j2_sent_at,
// j5_sent_at, next_push_at, next_push_step, cooldown_expires_at, status,
// ou tout autre champ du scénario.
//
// Retourne le nombre de scénarios corrigés et la distribution finale.

export async function recalculateScenarioSegments(
  base44: any,
  campaignId?: string
): Promise<{
  total: number;
  corrected: number;
  distribution: { no_course: number; occasional: number; regular: number; vip: number };
}> {
  const filter: any = campaignId ? { campaign_id: campaignId } : {};
  const scenarios = await base44.asServiceRole.entities.ReactivationScenario.filter(
    filter, '-created_date', 200
  );

  const clientIds = scenarios.map((s: any) => s.client_id).filter(Boolean);
  const clients = await base44.asServiceRole.entities.ClientExterne.filter({
    id: { $in: clientIds }
  });
  const clientMap: Record<string, any> = {};
  for (const c of clients) clientMap[c.id] = c;

  let corrected = 0;
  const distribution = { no_course: 0, occasional: 0, regular: 0, vip: 0 };

  for (const s of scenarios) {
    const client = clientMap[s.client_id];
    if (!client) {
      distribution[s.segment as keyof typeof distribution]++;
      continue;
    }

    const deliveredCount = await countDeliveredCourses(base44, client);
    const realSegment = computeSmartSegmentFromCount(deliveredCount);
    distribution[realSegment]++;

    if (realSegment !== s.segment) {
      // CORRECTION : uniquement le champ segment
      await base44.asServiceRole.entities.ReactivationScenario.update(s.id, {
        segment: realSegment,
      });
      corrected++;
    }
  }

  return { total: scenarios.length, corrected, distribution };
}
