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
// Messages génériques (rétrocompatibilité — utilisés si pas de message segment)
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

// ── Messages par SEGMENT (A/B/C) — identité hybride ──────────────────────
// Segment A = no_course (jamais commandé)
// Segment B = creee_non_livree (course créée mais jamais livrée)
// Segment C = occasional/regular/vip (déjà livré, inactif)
export const SEGMENT_MESSAGES: Record<string, { j0: string; j2: string; j5: string; j0_title: string; j2_title: string; j5_title: string }> = {
  no_course: {
    j0: "Besoin d'envoyer quelque chose ? SILGAPP trouve un livreur pour vous. Essayez votre première course.",
    j2: "Une livraison à faire ? Avec SILGAPP, lancez votre demande directement depuis votre téléphone.",
    j5: "Votre prochaine livraison peut commencer ici. Ouvrez SILGAPP et lancez votre course.",
    j0_title: "Votre première course SILGAPP",
    j2_title: "Une livraison à faire ?",
    j5_title: "Lancez votre course",
  },
  creee_non_livree: {
    j0: "Votre dernière demande n'a pas abouti ? SILGAPP est disponible pour votre prochaine livraison.",
    j2: "Besoin d'un livreur ? Retentez votre livraison avec SILGAPP.",
    j5: "Un colis à envoyer ? SILGAPP est prêt pour votre prochaine demande.",
    j0_title: "Retentez votre livraison",
    j2_title: "Besoin d'un livreur ?",
    j5_title: "SILGAPP est prêt",
  },
  occasional: {
    j0: "Ça fait un moment ! Un colis à envoyer ? SILGAPP est toujours là pour vos livraisons.",
    j2: "Besoin d'un livreur aujourd'hui ? Ouvrez SILGAPP et lancez votre course.",
    j5: "Une livraison à faire ? SILGAPP vous accompagne à nouveau.",
    j0_title: "SILGAPP vous manque ?",
    j2_title: "Besoin d'un livreur ?",
    j5_title: "Une livraison à faire ?",
  },
  regular: {
    j0: "Ça fait un moment ! Un colis à envoyer ? SILGAPP est toujours là pour vos livraisons.",
    j2: "Besoin d'un livreur aujourd'hui ? Ouvrez SILGAPP et lancez votre course.",
    j5: "Une livraison à faire ? SILGAPP vous accompagne à nouveau.",
    j0_title: "SILGAPP vous manque ?",
    j2_title: "Besoin d'un livreur ?",
    j5_title: "Une livraison à faire ?",
  },
  vip: {
    j0: "Ça fait un moment ! Un colis à envoyer ? SILGAPP est toujours là pour vos livraisons.",
    j2: "Besoin d'un livreur aujourd'hui ? Ouvrez SILGAPP et lancez votre course.",
    j5: "Une livraison à faire ? SILGAPP vous accompagne à nouveau.",
    j0_title: "SILGAPP vous manque ?",
    j2_title: "Besoin d'un livreur ?",
    j5_title: "Une livraison à faire ?",
  },
};

// ── Récupérer le message par segment + étape + variante ──
export function getSegmentMessage(
  segment: string,
  step: 'j0' | 'j2' | 'j5',
  variant: 'A' | 'B',
  config: { messages: typeof DEFAULT_MESSAGES; j0Title: string; j2Title: string; j5Title: string }
): { title: string; message: string } {
  const segMessages = SEGMENT_MESSAGES[segment] || SEGMENT_MESSAGES.occasional;
  if (step === 'j0') {
    // J0 : message segment, title segment
    return { title: segMessages.j0_title, message: segMessages.j0 };
  } else if (step === 'j2') {
    return { title: segMessages.j2_title, message: segMessages.j2 };
  } else {
    return { title: segMessages.j5_title, message: segMessages.j5 };
  }
}

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
 * Matching HYBRIDE : telephone_normalized en priorité, fallback sur user_email.
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

  // 3. Fallback HYBRIDE : recherche par user_email (clients App sans téléphone)
  const email = (client.user_email || '').trim().toLowerCase();
  if (courses.length === 0 && email) {
    try {
      courses = await base44.asServiceRole.entities.CourseExterne.filter(
        { client_user_email: email },
        '-created_date', 500
      );
    } catch {}
  }

  // 4. Dédupliquer par course.id et ne compter que les courses livrées
  for (const c of courses) {
    if (c.id) seenIds.add(c.id);
  }

  let deliveredCount = 0;
  for (const c of courses) {
    if (c.statut === 'livree') deliveredCount++;
  }

  return deliveredCount;
}

/**
 * Compte les courses (total + livrées) d'un client via maps préchargées.
 * Matching HYBRIDE : telephone_normalized en priorité, fallback sur user_email.
 * Aucun N+1 — utilise les maps passées en paramètre.
 */
export function countClientCoursesFromMaps(
  client: any,
  phoneToCourses: Map<string, any[]>,
  emailToCourses: Map<string, any[]>
): { total: number; delivered: number; lastCourseDate: number } {
  const seenIds = new Set<string>();
  const clientCourses: any[] = [];

  const phone = (client.telephone_normalized || '').trim();
  if (phone) {
    for (const c of (phoneToCourses.get(phone) || [])) {
      if (!seenIds.has(c.id)) { seenIds.add(c.id); clientCourses.push(c); }
    }
  }

  const email = (client.user_email || '').trim().toLowerCase();
  if (email) {
    for (const c of (emailToCourses.get(email) || [])) {
      if (!seenIds.has(c.id)) { seenIds.add(c.id); clientCourses.push(c); }
    }
  }

  let delivered = 0;
  let lastCourseDate = 0;
  for (const c of clientCourses) {
    if (c.statut === 'livree') delivered++;
    const created = c.created_date ? new Date(c.created_date).getTime() : 0;
    if (created > lastCourseDate) lastCourseDate = created;
  }

  return { total: clientCourses.length, delivered, lastCourseDate };
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
  // ── Chargement bulk : clients, tokens, courses, users ──
  // Aucun N+1 — toutes les courses sont chargées en une fois.
  const clients = await base44.asServiceRole.entities.ClientExterne.list();
  const tokens = await base44.asServiceRole.entities.NotificationToken.filter({ user_type: 'client', actif: true });

  const tokenByClientEmail: Record<string, any> = {};
  for (const t of tokens) {
    if (t.user_email) tokenByClientEmail[t.user_email] = t;
  }

  // ── Chargement bulk des CourseExterne (paginé) ──
  const courseFilter: any = {};
  if (campaign.country_code) courseFilter.country_code = campaign.country_code;
  const allCourses: any[] = [];
  let skip = 0;
  while (true) {
    const batch = await base44.asServiceRole.entities.CourseExterne.filter(
      courseFilter, '-created_date', 500, skip
    );
    allCourses.push(...(batch || []));
    if (!batch || batch.length < 500) break;
    skip += 500;
    if (skip > 5000) break;
  }

  // ── Construction des maps phone→courses et email→courses ──
  const phoneToCourses = new Map<string, any[]>();
  const emailToCourses = new Map<string, any[]>();
  for (const c of allCourses) {
    const phone = (c.client_phone_normalized || '').trim();
    if (phone) {
      if (!phoneToCourses.has(phone)) phoneToCourses.set(phone, []);
      phoneToCourses.get(phone)!.push(c);
    }
    const email = (c.client_user_email || '').trim().toLowerCase();
    if (email) {
      if (!emailToCourses.has(email)) emailToCourses.set(email, []);
      emailToCourses.get(email)!.push(c);
    }
  }

  // ── Clients déjà dans un scénario actif ou en cooldown POUR CETTE CAMPAGNE ──
  // IMPORTANT : les scénarios des ANCIENNES campagnes ne bloquent PAS la nouvelle
  // vague. Chaque campagne est évaluée indépendamment (reset contrôlé).
  const activeScenarios = await base44.asServiceRole.entities.ReactivationScenario.filter({
    status: 'active',
    campaign_id: campaign.id,
  });
  const activeClientIds = new Set(activeScenarios.map((s: any) => s.client_id));

  // ── Déduplication hybride : une personne = un seul scénario ──
  // Pour éviter qu'un client avec téléphone + email soit ciblé deux fois
  const activePersonKeys = new Set<string>();
  for (const s of activeScenarios) {
    if (s.client_phone_normalized) activePersonKeys.add(`phone:${s.client_phone_normalized}`);
    if (s.client_user_email) activePersonKeys.add(`email:${s.client_user_email.toLowerCase()}`);
  }

  const cooldownScenarios = await base44.asServiceRole.entities.ReactivationScenario.filter({
    status: ['completed', 'expired', 'converted'],
    campaign_id: campaign.id,
  });
  const now = Date.now();
  const cooldownMs = config.cooldownDays * 86400000;
  const inCooldown = new Set<string>();
  const cooldownPersonKeys = new Set<string>();
  for (const s of cooldownScenarios) {
    const refDate = s.cooldown_expires_at ? new Date(s.cooldown_expires_at).getTime() : 
                   s.j5_sent_at ? new Date(s.j5_sent_at).getTime() + cooldownMs :
                   s.j0_sent_at ? new Date(s.j0_sent_at).getTime() + cooldownMs : 0;
    if (refDate && now < refDate) {
      inCooldown.add(s.client_id);
      if (s.client_phone_normalized) cooldownPersonKeys.add(`phone:${s.client_phone_normalized}`);
      if (s.client_user_email) cooldownPersonKeys.add(`email:${s.client_user_email.toLowerCase()}`);
    }
  }

  const now2 = Date.now();
  let eligible: EligibleClient[] = [];
  const seenPersonKeys = new Set<string>(); // anti-doublon intra-sélection

  for (const c of clients) {
    // Doit avoir un token FCM natif (pas web_)
    const token = c.user_email ? tokenByClientEmail[c.user_email] || null : null;
    if (!token || !token.token || String(token.token).startsWith('web_')) continue;

    // Pas déjà dans un scénario actif
    if (activeClientIds.has(c.id)) continue;

    // Pas en cooldown
    if (inCooldown.has(c.id)) continue;

    // ── Déduplication hybride : vérifier si la PERSONNE est déjà active ou en cooldown ──
    const phone = (c.telephone_normalized || '').trim();
    const email = (c.user_email || '').trim().toLowerCase();
    const personKey = phone ? `phone:${phone}` : (email ? `email:${email}` : null);
    if (!personKey) continue; // non identifiable
    if (activePersonKeys.has(personKey)) continue;
    if (cooldownPersonKeys.has(personKey)) continue;
    if (seenPersonKeys.has(personKey)) continue; // déjà sélectionné dans ce batch

    // Mode test : filtrer par téléphones de test
    if (config.testMode) {
      const normalized = normalizePhone(c.telephone, c.country_code || undefined);
      if (!config.testPhones.includes(normalized) && !config.testPhones.includes(c.telephone)) continue;
    }

    // Filtre pays si défini
    if (campaign.country_code && c.country_code !== campaign.country_code) continue;

    // ── Calcul hybride : courses par téléphone + email (source de vérité) ──
    const { total, delivered, lastCourseDate } = countClientCoursesFromMaps(c, phoneToCourses, emailToCourses);

    // ── Détermination du segment A/B/C ──
    let segment: SmartSegment;
    if (total === 0) {
      segment = 'no_course'; // Segment A
    } else if (delivered === 0) {
      segment = 'creee_non_livree'; // Segment B
    } else {
      segment = computeSmartSegmentFromCount(delivered); // Segment C (occasional/regular/vip)
    }

    // Filtre par smart_segment si défini
    if (campaign.smart_segment && campaign.smart_segment !== 'all' && segment !== campaign.smart_segment) continue;

    // ── Inactivité : basée sur la VRAIE dernière course (CourseExterne) ──
    const inactiveDays = lastCourseDate === 0 ? 9999 : (now2 - lastCourseDate) / 86400000;
    if (inactiveDays < (campaign.inactive_days_min || 30)) continue;

    seenPersonKeys.add(personKey);
    eligible.push({ client: c, token, segment });
  }

  // Trier par priorité de segment (no_course d'abord pour premières conversions)
  const segmentOrder: Record<string, number> = { no_course: 0, creee_non_livree: 1, occasional: 2, regular: 3, vip: 4 };
  eligible.sort((a, b) => (segmentOrder[a.segment] ?? 9) - (segmentOrder[b.segment] ?? 9));

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
    client_user_email: client.user_email || '',
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

  // Envoyer J0 (sauf groupe contrôle) — message par SEGMENT
  if (!isControl && token?.token) {
    const { title: j0Title, message: j0Message } = getSegmentMessage(segment, 'j0', abVariant as 'A' | 'B', config);
    const result = await sendReactivationPush(
      [{ token: token.token, recipient_id: scenario.id }],
      j0Title,
      j0Message,
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
  let errors = 0;
  const activeScenarios = await base44.asServiceRole.entities.ReactivationScenario.filter({
    status: 'active',
  });

  // ── Scénarios expired : vérifier les conversions attribuables ──
  // Un scénario expired (token perdu) ne doit PLUS recevoir de push, mais sa
  // conversion peut encore être attribuée si une course a été créée dans la
  // fenêtre d'attribution (72h après J0).
  // On les charge séparément, on vérifie les conversions, et on n'envoie
  // AUCUN push. Si non converti, le scénario reste expired.
  const expiredScenarios = await base44.asServiceRole.entities.ReactivationScenario.filter({
    status: 'expired',
  });
  const expiredToCheck = expiredScenarios.filter((s: any) => {
    if (!s.j0_sent_at) return false;
    const j0Ts = new Date(s.j0_sent_at).getTime();
    const windowMs = config.attributionWindowHours * 3600000;
    return now < (j0Ts + windowMs); // Encore dans la fenêtre d'attribution
  });
  for (const s of expiredToCheck.slice(0, maxProcess)) {
    try {
      await checkScenarioConversion(base44, s, config);
    } catch {
      errors++;
    }
  }

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

  const toProcess = dueScenarios.slice(0, maxProcess);

  for (const s of toProcess) {
    try {
      // Vérifier si le client a créé une course (conversion)
      const isConverted = await checkScenarioConversion(base44, s, config);
      if (isConverted) {
        continue; // Le scénario a été marqué converted
      }

      // ── CORRECTION : Gestion des control groups (next_push_step === 0) ──
      // Les control groups ne reçoivent aucun push mais doivent être clôturés
      // après la fin du cycle J0/J2/J5 + fenêtre d'attribution, pour ne pas
      // rester 'active' éternellement.
      if (s.is_control_group && s.next_push_step === 0) {
        // Date de clôture = création + (J0→J2) + (J2→J5) + fenêtre d'attribution
        const j0ToJ2Ms = (campaign.push_interval_days || 2) * 86400000;
        const j2ToJ5Ms = (campaign.push_interval_2_days || 3) * 86400000;
        const attributionMs = config.attributionWindowHours * 3600000;
        const closureTs = new Date(s.created_date).getTime() + j0ToJ2Ms + j2ToJ5Ms + attributionMs;
        if (now >= closureTs) {
          await base44.asServiceRole.entities.ReactivationScenario.update(s.id, {
            status: 'completed',
            next_push_step: -1,
          });
          expired++;
        }
        continue;
      }

      // ── Garde-fou anti-retry infini pour les scénarios avec échecs J2/J5 ──
      // Si le scénario a dépassé la fin du cycle (création + J0→J2 + J2→J5 + attribution)
      // sans conversion, le marquer comme 'expired' pour arrêter les retries.
      if (s.next_push_step >= 2) {
        const j0ToJ2Ms = (campaign.push_interval_days || 2) * 86400000;
        const j2ToJ5Ms = (campaign.push_interval_2_days || 3) * 86400000;
        const attributionMs = config.attributionWindowHours * 3600000;
        const hardDeadlineTs = new Date(s.created_date).getTime() + j0ToJ2Ms + j2ToJ5Ms + attributionMs;
        if (now >= hardDeadlineTs) {
          await base44.asServiceRole.entities.ReactivationScenario.update(s.id, {
            status: 'expired',
            next_push_step: -1,
          });
          expired++;
          continue;
        }
      }

      // Récupérer le token FCM actuel
      const tokens = await base44.asServiceRole.entities.NotificationToken.filter({
        user_type: 'client',
        actif: true,
        client_id: s.client_id,
      });
      const token = tokens[0];
      if (!token || !token.token || String(token.token).startsWith('web_')) {
        // Token invalide : marquer le scénario comme expiré (échec technique, pas un succès)
        await base44.asServiceRole.entities.ReactivationScenario.update(s.id, {
          status: 'expired',
          next_push_step: -1,
        });
        continue;
      }

      const abVariant = s.ab_variant || 'A';
      const now_iso = new Date().toISOString();

      if (s.next_push_step === 2) {
        // ── J+2 — message par SEGMENT ──
        const { title: j2Title, message: j2Message } = getSegmentMessage(s.segment, 'j2', abVariant as 'A' | 'B', config);
        const result = await sendReactivationPush(
          [{ token: token.token, recipient_id: s.id }],
          j2Title,
          j2Message,
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

        // CORRECTION : next_push_at J5 calculé depuis l'heure PLANIFIÉE de J2,
        // pas depuis Date.now() (heure réelle d'exécution).
        // Un retard de traitement de 1 minute à J2 ne doit pas décaler J5 de 6h.
        const intervalMs = (campaign.push_interval_2_days || 3) * 86400000 * testMultiplier;
        const j2PlannedTs = s.next_push_at ? new Date(s.next_push_at).getTime() : now;
        const j5PlannedTs = j2PlannedTs + intervalMs;
        await base44.asServiceRole.entities.ReactivationScenario.update(s.id, {
          j2_recipient_id: recipient.id,
          j2_sent_at: result.results[0]?.ok ? now_iso : null,
          next_push_at: new Date(j5PlannedTs).toISOString(),
          next_push_step: 5,
        });
        j2Sent++;
      } else if (s.next_push_step === 5) {
        // ── J+5 — message par SEGMENT ──
        const { title: j5Title, message: j5Message } = getSegmentMessage(s.segment, 'j5', abVariant as 'A' | 'B', config);
        const result = await sendReactivationPush(
          [{ token: token.token, recipient_id: s.id }],
          j5Title,
          j5Message,
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

        // CORRECTION : ne marquer 'completed' que si le push J5 a réussi.
        // Si le push échoue, conserver status='active' pour permettre un retry
        // au prochain cycle (sous réserve du garde-fou d'expiration ci-dessous).
        if (result.results[0]?.ok) {
          await base44.asServiceRole.entities.ReactivationScenario.update(s.id, {
            j5_recipient_id: recipient.id,
            j5_sent_at: now_iso,
            status: 'completed',
            next_push_step: -1,
          });
          j5Sent++;
        } else {
          // Échec J5 : journaliser précisément, conserver active pour retry.
          // Le garde-fou d'expiration (ligne ci-dessous) empêche les retries infinis.
          console.error(`[SCENARIO] Échec push J5 scénario ${s.id}: ${result.results[0]?.error}`);
          // Réinitialiser next_push_at à maintenant pour un retry au prochain cycle
          await base44.asServiceRole.entities.ReactivationScenario.update(s.id, {
            j5_recipient_id: recipient.id,
            j5_sent_at: null,
            next_push_at: new Date(now + 3600000).toISOString(), // retry dans 1h
          });
          errors++;
        }
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
  if (!scenario.client_phone_normalized && !scenario.client_telephone && !scenario.client_user_email) return false;

  const referenceTime = scenario.j0_sent_at ? new Date(scenario.j0_sent_at).getTime() : Date.now();
  const windowMs = config.attributionWindowHours * 3600000;
  const now = Date.now();

  // Chercher les courses créées après J0 — HYBRIDE
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
  // Fallback HYBRIDE : recherche par client_user_email (clients App sans téléphone)
  if (courses.length === 0 && scenario.client_user_email) {
    courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { client_user_email: scenario.client_user_email },
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