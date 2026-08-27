/**
 * Moteur de réactivation clients SILGAPP.
 * - Calcul des segments (push actif, récupérables, externe)
 * - Sélection des cibles avec anti-spam + groupe contrôle + A/B
 * - Envoi FCM (réutilise fcmUtils.ts — source unique)
 * - Attribution des conversions
 *
 * RÈGLE FONDAMENTALE : aucune dépense automatique (pas de WhatsApp/SMS payant).
 * Le canal est exclusivement FCM push gratuit.
 */

import { getFirebaseConfig, getAccessToken, sendFcmMessage, APP_URL, ANDROID_CHANNEL_ID } from './fcmUtils.ts';
import { normalizePhone } from './phoneUtils.ts';

const DEFAULT_ATTRIBUTION_WINDOW_HOURS = 72;
const DEFAULT_ANTI_SPAM_HOURS = 48;
const DEFAULT_CONTROL_GROUP_PCT = 15;

export interface PushResult {
  recipient_id: string;
  ok: boolean;
  error?: string;
}

export async function sendReactivationPush(
  targets: { token: string; recipient_id: string }[],
  title: string,
  message: string,
  campaignId: string
): Promise<{ success: number; failed: number; invalid: string[]; results: PushResult[] }> {
  const config = getFirebaseConfig();
  if (!config.projectId || !config.clientEmail || !config.privateKey) {
    throw new Error("Firebase non configuré — FIREBASE_SERVICE_ACCOUNT_JSON manquant");
  }

  const accessToken = await getAccessToken(config.clientEmail, config.privateKey);
  const BATCH_SIZE = 5;

  let success = 0;
  let failed = 0;
  const invalid: string[] = [];
  const results: PushResult[] = [];

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(async (target) => {
      const fcmPayload = {
        notification: { title, body: message },
        data: {
          type: "reactivation_campaign",
          campaign_id: String(campaignId),
          recipient_id: String(target.recipient_id),
          destination: "create_course",
          click_action: APP_URL,
        },
        android: {
          priority: "HIGH",
          ttl: "86400s",
          notification: {
            channel_id: ANDROID_CHANNEL_ID,
            sound: "default",
            vibrate_timings: ["0s", "0.2s", "0.1s", "0.2s", "0.1s", "0.4s"],
            default_sound: true,
            notification_priority: "PRIORITY_HIGH",
            visibility: "PUBLIC",
            click_action: APP_URL,
          },
        },
        webpush: { fcm_options: { link: APP_URL } },
      };
      const r = await sendFcmMessage(config.projectId, accessToken, target.token, fcmPayload);
      if (!r.ok) {
        const errorCode = r.result?.error?.details?.[0]?.errorCode || r.result?.error?.status;
        if (["UNREGISTERED", "INVALID_ARGUMENT"].includes(errorCode)) {
          invalid.push(target.token);
        }
        return { recipient_id: target.recipient_id, ok: false, error: errorCode || "unknown" };
      }
      return { recipient_id: target.recipient_id, ok: true };
    }));
    results.push(...batchResults);
    success += batchResults.filter((r) => r.ok).length;
    failed += batchResults.filter((r) => !r.ok).length;
    if (i + BATCH_SIZE < targets.length) await new Promise((r) => setTimeout(r, 200));
  }

  return { success, failed, invalid, results };
}

// ── Segmentation ──────────────────────────────────────────────────────────────

export interface SegmentStats {
  totalClients: number;
  pushActive: number;
  pushActiveAppActive: number;
  pushActiveAppInactive: number;
  pushRecoverable: number;
  externalNoAccount: number;
  zeroCourse: number;
  oneCourse: number;
  twoToFourCourses: number;
  fiveToNineCourses: number;
  tenPlusCourses: number;
  inactive7d: number;
  inactive30d: number;
  inactive60d: number;
  inactive90d: number;
}

export async function computeSegmentStats(base44: any): Promise<SegmentStats> {
  const clients = await base44.asServiceRole.entities.ClientExterne.list();
  const tokens = await base44.asServiceRole.entities.NotificationToken.filter({ user_type: "client", actif: true });

  const clientEmails = new Set(clients.filter((c: any) => c.user_email).map((c: any) => c.user_email));
  const tokenEmails = new Set(tokens.map((t: any) => t.user_email).filter(Boolean));
  const tokenByClientEmail: Record<string, any> = {};
  for (const t of tokens) {
    if (t.user_email) tokenByClientEmail[t.user_email] = t;
  }

  const now = Date.now();
  const days7 = 7 * 86400000;
  const days30 = 30 * 86400000;
  const days60 = 60 * 86400000;
  const days90 = 90 * 86400000;

  let pushActive = 0;
  let pushActiveAppActive = 0;
  let pushActiveAppInactive = 0;
  let pushRecoverable = 0;
  let externalNoAccount = 0;
  let zeroCourse = 0;
  let oneCourse = 0;
  let twoToFour = 0;
  let fiveToNine = 0;
  let tenPlus = 0;
  let inactive7 = 0;
  let inactive30 = 0;
  let inactive60 = 0;
  let inactive90 = 0;

  for (const c of clients) {
    const hasToken = c.user_email && tokenEmails.has(c.user_email);
    const hasEmail = !!c.user_email;

    if (hasToken) {
      pushActive++;
      if (c.app_active === true) pushActiveAppActive++;
      else pushActiveAppInactive++;
    } else if (hasEmail) {
      pushRecoverable++;
    } else {
      externalNoAccount++;
    }

    const nb = c.nb_courses_total || 0;
    if (nb === 0) zeroCourse++;
    else if (nb === 1) oneCourse++;
    else if (nb >= 2 && nb <= 4) twoToFour++;
    else if (nb >= 5 && nb <= 9) fiveToNine++;
    else if (nb >= 10) tenPlus++;

    const lastCourse = c.derniere_course_date ? new Date(c.derniere_course_date).getTime() : 0;
    if (lastCourse === 0 || (now - lastCourse) >= days7) inactive7++;
    if (lastCourse === 0 || (now - lastCourse) >= days30) inactive30++;
    if (lastCourse === 0 || (now - lastCourse) >= days60) inactive60++;
    if (lastCourse === 0 || (now - lastCourse) >= days90) inactive90++;
  }

  return {
    totalClients: clients.length,
    pushActive,
    pushActiveAppActive,
    pushActiveAppInactive,
    pushRecoverable,
    externalNoAccount,
    zeroCourse,
    oneCourse,
    twoToFourCourses: twoToFour,
    fiveToNineCourses: fiveToNine,
    tenPlusCourses: tenPlus,
    inactive7d: inactive7,
    inactive30d: inactive30,
    inactive60d: inactive60,
    inactive90d: inactive90,
  };
}

// ── Sélection des cibles ─────────────────────────────────────────────────────

export interface TargetSelectionParams {
  segment_type: string;
  country_code?: string;
  city?: string;
  course_min?: number;
  course_max?: number;
  max_targets?: number;
  inactive_days_min?: number;
  control_group_pct?: number;
  ab_variants?: any[];
  campaign_id?: string;
}

export interface TargetClient {
  client: any;
  token: any | null;
  is_control: boolean;
  ab_variant: string | null;
}

export async function selectTargets(base44: any, params: TargetSelectionParams): Promise<{ targets: TargetClient[]; controlCount: number }> {
  const clients = await base44.asServiceRole.entities.ClientExterne.list();
  const tokens = await base44.asServiceRole.entities.NotificationToken.filter({ user_type: "client", actif: true });

  const tokenByClientEmail: Record<string, any> = {};
  for (const t of tokens) {
    if (t.user_email) tokenByClientEmail[t.user_email] = t;
  }

  const now = Date.now();
  let eligible: TargetClient[] = [];

  for (const c of clients) {
    // Filtre pays
    if (params.country_code && c.country_code !== params.country_code) continue;
    // Filtre ville
    if (params.city && (c.ville || "").toLowerCase() !== params.city.toLowerCase()) continue;

    const nb = c.nb_courses_total || 0;
    if (nb < (params.course_min || 0)) continue;
    if (params.course_max != null && nb > params.course_max) continue;

    if (params.inactive_days_min) {
      const lastCourse = c.derniere_course_date ? new Date(c.derniere_course_date).getTime() : 0;
      const inactiveDays = lastCourse === 0 ? 9999 : (now - lastCourse) / 86400000;
      if (inactiveDays < params.inactive_days_min) continue;
    }

    const token = c.user_email ? tokenByClientEmail[c.user_email] || null : null;

    // Segment filtering
    if (params.segment_type === "push_active") {
      // Exclure les tokens web_ (pas natifs Android/iOS) dès la sélection
      if (!token || !token.token || String(token.token).startsWith("web_")) continue;
    } else if (params.segment_type === "push_recoverable") {
      if (!c.user_email || token) continue;
    } else if (params.segment_type === "all_push_eligible") {
      if (!c.user_email) continue;
    } else if (params.segment_type === "external_no_account") {
      if (c.user_email) continue;
    }

    eligible.push({ client: c, token, is_control: false, ab_variant: null });
  }

  // ── Anti-spam : exclure les clients déjà ciblés dans les dernières 48h ──
  //    + exclure les clients qui ont DÉJÀ un recipient dans cette campagne (idempotence)
  const antiSpamMs = DEFAULT_ANTI_SPAM_HOURS * 3600000;
  const recentRecipients = await base44.asServiceRole.entities.ReactivationCampaignRecipient.list();
  const recentSet = new Set<string>();
  const alreadyInCampaign = new Set<string>();
  for (const r of recentRecipients) {
    // Exclure si déjà un recipient dans CETTE campagne (peu importe le statut)
    if (params.campaign_id && r.campaign_id === params.campaign_id) {
      if (r.client_id) alreadyInCampaign.add(r.client_id);
    }
    // Exclure si envoyé dans une autre campagne dans les dernières 48h
    if (r.sent_at && (now - new Date(r.sent_at).getTime()) < antiSpamMs) {
      if (r.client_id) recentSet.add(r.client_id);
    }
  }
  eligible = eligible.filter((t) => !recentSet.has(t.client.id) && !alreadyInCampaign.has(t.client.id));

  // ── Limite max_targets (campagnes pilotes) ──
  const maxTargets = params.max_targets || 0;
  if (maxTargets > 0 && eligible.length > maxTargets) {
    // Tri déterministe pour que la sélection soit reproductible
    eligible.sort((a, b) => a.client.id < b.client.id ? -1 : 1);
    eligible = eligible.slice(0, maxTargets);
  }

  // ── Groupe contrôle ──
  const controlPct = params.control_group_pct || 0;
  if (controlPct > 0) {
    // Shuffle deterministic by client id hash
    eligible.sort((a, b) => a.client.id < b.client.id ? -1 : 1);
    const controlCount = Math.floor(eligible.length * controlPct / 100);
    for (let i = 0; i < controlCount; i++) {
      eligible[i].is_control = true;
    }
  }

  // ── A/B testing ──
  if (params.ab_variants && params.ab_variants.length > 0) {
    const variants = params.ab_variants;
    for (let i = 0; i < eligible.length; i++) {
      if (eligible[i].is_control) continue;
      eligible[i].ab_variant = variants[i % variants.length].variant || String.fromCharCode(65 + (i % variants.length));
    }
  }

  const controlCount = eligible.filter((t) => t.is_control).length;
  return { targets: eligible, controlCount };
}

// ── Attribution des conversions ──────────────────────────────────────────────

export async function attributeConversions(base44: any): Promise<{ attributed: number; revenueTotal: number; commissionTotal: number; campaignsProcessed: number }> {
  // Lire la fenêtre d'attribution depuis AppConfig (configurable)
  let windowHours = DEFAULT_ATTRIBUTION_WINDOW_HOURS;
  try {
    const configs = await base44.asServiceRole.entities.AppConfig.filter({ cle: "REACTIVATION_ATTRIBUTION_WINDOW_HOURS" });
    if (configs?.length > 0 && configs[0].valeur) {
      windowHours = Number(configs[0].valeur) || DEFAULT_ATTRIBUTION_WINDOW_HOURS;
    }
  } catch {}
  const windowMs = windowHours * 3600000;
  const now = Date.now();

  // ── Ne traiter que les campagnes pertinentes (lancées et dans la fenêtre) ──
  const allCampaigns = await base44.asServiceRole.entities.ReactivationCampaign.filter({
    status: "completed",
  }, "-started_at", 100);

  const relevantCampaigns = allCampaigns.filter((c: any) => {
    if (!c.started_at) return false;
    const startedMs = new Date(c.started_at).getTime();
    // Campagne encore dans la fenêtre d'attribution (started_at + window > now)
    return (now - startedMs) < windowMs;
  });

  if (relevantCampaigns.length === 0) return { attributed: 0, revenueTotal: 0, commissionTotal: 0, campaignsProcessed: 0 };

  let attributed = 0;
  let revenueTotal = 0;
  let commissionTotal = 0;
  const campaignIdsProcessed = new Set<string>();

  for (const campaign of relevantCampaigns) {
    const campaignStartedMs = new Date(campaign.started_at).getTime();
    const recipients = await base44.asServiceRole.entities.ReactivationCampaignRecipient.filter({
      campaign_id: campaign.id,
    });

    // ── Collecter les course_id déjà attribués pour éviter les doubles ──
    const alreadyAttributedCourseIds = new Set<string>();
    for (const r of recipients) {
      if (r.course_id) alreadyAttributedCourseIds.add(r.course_id);
    }

    for (const r of recipients) {
      // Skip already converted recipients (idempotence)
      if (r.course_created_at) continue;
      if (r.status === "converted") continue;
      if (!r.client_id) continue;

      // ── Référence temporelle : sent_at pour les exposés, started_at pour le contrôle ──
      const referenceTime = r.sent_at ? new Date(r.sent_at).getTime() : (r.is_control_group ? campaignStartedMs : 0);
      if (!referenceTime) continue;

      // Skip si hors fenêtre (campagne expirée)
      if ((now - referenceTime) > windowMs) continue;

      // ── Matching téléphone normalisé (prioritaire) + fallback brut ──
      let courses: any[] = [];
      const normalizedPhone = normalizePhone(r.client_telephone, r.country_code || undefined);
      if (normalizedPhone) {
        courses = await base44.asServiceRole.entities.CourseExterne.filter(
          { client_phone_normalized: normalizedPhone },
          "-created_date", 10
        ).catch(() => []);
      }
      if (courses.length === 0 && r.client_telephone) {
        courses = await base44.asServiceRole.entities.CourseExterne.filter(
          { client_telephone: r.client_telephone },
          "-created_date", 10
        ).catch(() => []);
      }

      for (const course of courses) {
        const courseCreated = course.created_date ? new Date(course.created_date).getTime() : 0;
        if (courseCreated < referenceTime) continue;
        if ((courseCreated - referenceTime) > windowMs) continue;

        // ── Anti-double attribution : ne pas attribuer une course déjà attribuée ──
        if (alreadyAttributedCourseIds.has(course.id)) continue;

        const revenue = course.prix_final || course.prix_propose_client || course.prix_propose_admin || 0;
        const commission = course.commission_silga || 0;
        const isDelivered = course.statut === "livree";

        await base44.asServiceRole.entities.ReactivationCampaignRecipient.update(r.id, {
          course_created_at: course.created_date,
          course_id: course.id,
          revenue,
          commission,
          // Le groupe contrôle garde son statut "control" mais reçoit course_created_at
          status: r.is_control_group ? "control" : (isDelivered ? "converted" : "opened"),
          course_completed_at: isDelivered ? (course.heure_livraison || course.colis_livre_at) : null,
        });

        alreadyAttributedCourseIds.add(course.id);
        attributed++;
        revenueTotal += revenue;
        commissionTotal += commission;
        break; // Only attribute first course
      }
    }

    // ── Recalculer les stats agrégées de la campagne ──
    const allRecipients = await base44.asServiceRole.entities.ReactivationCampaignRecipient.filter({ campaign_id: campaign.id });
    // sent_count = envois FCM RÉUSSIS uniquement (exclut failed, control, pending)
    const sentCount = allRecipients.filter((r: any) => ["sent", "opened", "converted"].includes(r.status)).length;
    const openedCount = allRecipients.filter((r: any) => ["opened", "converted"].includes(r.status)).length;
    const courseCreatedCount = allRecipients.filter((r: any) => r.course_created_at).length;
    const courseCompletedCount = allRecipients.filter((r: any) => r.course_completed_at).length;
    const revenue = allRecipients.reduce((sum: number, r: any) => sum + (r.revenue || 0), 0);
    const commission = allRecipients.reduce((sum: number, r: any) => sum + (r.commission || 0), 0);

    await base44.asServiceRole.entities.ReactivationCampaign.update(campaign.id, {
      sent_count: sentCount,
      opened_count: openedCount,
      course_created_count: courseCreatedCount,
      course_completed_count: courseCompletedCount,
      revenue_generated: revenue,
      commission_generated: commission,
      net_result: commission,
    });

    campaignIdsProcessed.add(campaign.id);
  }

  return { attributed, revenueTotal, commissionTotal, campaignsProcessed: campaignIdsProcessed.size };
}