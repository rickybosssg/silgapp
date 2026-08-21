/**
 * Moteur de réactivation clients SILGAPP.
 * - Calcul des segments (push actif, récupérables, externe)
 * - Sélection des cibles avec anti-spam + groupe contrôle + A/B
 * - Envoi FCM (réutilise l'infrastructure existante)
 * - Attribution des conversions
 *
 * RÈGLE FONDAMENTALE : aucune dépense automatique (pas de WhatsApp/SMS payant).
 * Le canal est exclusivement FCM push gratuit.
 */

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const APP_URL = "https://silga-dispatch-go.base44.app";
const ANDROID_CHANNEL_ID = "silgapp_default";
const DEFAULT_ATTRIBUTION_WINDOW_HOURS = 72;
const DEFAULT_ANTI_SPAM_HOURS = 48;
const DEFAULT_CONTROL_GROUP_PCT = 15;

// ── Firebase FCM (extrait de sendPushCampagne, réutilisé) ─────────────────────

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, "\n");
  const base64 = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwt(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iss: clientEmail, scope: FCM_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToArrayBuffer(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

function getFirebaseConfig() {
  const json = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!json) return { projectId: null as string | null, clientEmail: null as string | null, privateKey: null as string | null };
  const sa = JSON.parse(json);
  return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key };
}

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const assertion = await signJwt(clientEmail, privateKey);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error_description || result.error || "Unable to get Firebase access token");
  return result.access_token;
}

export async function sendOneFcm(projectId: string, accessToken: string, token: string, payload: any): Promise<{ ok: boolean; status: number; result: any }> {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { token, ...payload } }),
  });
  const result = await response.json();
  return { ok: response.ok, status: response.status, result };
}

export async function sendReactivationPush(tokens: string[], title: string, message: string, campaignId: string): Promise<{ success: number; failed: number; invalid: string[] }> {
  const { projectId, clientEmail, privateKey } = getFirebaseConfig();
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase non configuré — FIREBASE_SERVICE_ACCOUNT_JSON manquant");
  }

  const accessToken = await getAccessToken(clientEmail, privateKey);
  const fcmPayload = {
    notification: { title, body: message },
    data: {
      type: "reactivation_campaign",
      campaign_id: String(campaignId),
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

  let success = 0;
  let failed = 0;
  const invalid: string[] = [];
  const BATCH_SIZE = 100;

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (token) => {
      const r = await sendOneFcm(projectId, accessToken, token, fcmPayload);
      if (!r.ok) {
        const errorCode = r.result?.error?.details?.[0]?.errorCode || r.result?.error?.status;
        if (["UNREGISTERED", "INVALID_ARGUMENT"].includes(errorCode)) {
          invalid.push(token);
        }
        return false;
      }
      return true;
    }));
    success += results.filter(Boolean).length;
    failed += results.filter((r) => !r).length;
    if (i + BATCH_SIZE < tokens.length) await new Promise((r) => setTimeout(r, 200));
  }

  return { success, failed, invalid };
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
  inactive_days_min?: number;
  control_group_pct?: number;
  ab_variants?: any[];
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
      if (!token) continue;
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
  const recentRecipients = await base44.asServiceRole.entities.ReactivationCampaignRecipient.filter({
    client_telephone: "",
  }, "-sent_at", 10000);

  // Better approach: fetch recent recipients and build a set
  const antiSpamMs = DEFAULT_ANTI_SPAM_HOURS * 3600000;
  const recentSet = new Set<string>();
  for (const r of recentRecipients) {
    if (r.sent_at && (now - new Date(r.sent_at).getTime()) < antiSpamMs) {
      if (r.client_id) recentSet.add(r.client_id);
    }
  }
  eligible = eligible.filter((t) => !recentSet.has(t.client.id));

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

export async function attributeConversions(base44: any): Promise<{ attributed: number; revenueTotal: number; commissionTotal: number }> {
  const windowHours = DEFAULT_ATTRIBUTION_WINDOW_HOURS;
  const windowMs = windowHours * 3600000;
  const now = Date.now();

  // Récupérer les recipients envoyés mais pas encore convertis
  const recipients = await base44.asServiceRole.entities.ReactivationCampaignRecipient.filter(
    { status: "sent" },
    "-sent_at",
    500
  );

  let attributed = 0;
  let revenueTotal = 0;
  let commissionTotal = 0;

  for (const r of recipients) {
    if (!r.sent_at) continue;
    const sentTime = new Date(r.sent_at).getTime();
    if ((now - sentTime) > windowMs * 2) continue; // Skip if beyond 2x window

    // Chercher les courses créées par ce client après l'envoi
    if (!r.client_id) continue;
    const courses = await base44.asServiceRole.entities.CourseExterne.filter({
      client_telephone: r.client_telephone,
    }, "-created_date", 10);

    for (const course of courses) {
      const courseCreated = course.created_date ? new Date(course.created_date).getTime() : 0;
      if (courseCreated < sentTime) continue;
      if ((courseCreated - sentTime) > windowMs) continue;

      // Course attribuée !
      const revenue = course.prix_final || course.prix_propose_client || course.prix_propose_admin || 0;
      const commission = course.commission_silga || 0;

      await base44.asServiceRole.entities.ReactivationCampaignRecipient.update(r.id, {
        course_created_at: course.created_date,
        course_id: course.id,
        revenue,
        commission,
        status: course.statut === "livree" ? "converted" : "opened",
        course_completed_at: course.statut === "livree" ? (course.heure_livraison || course.colis_livre_at) : null,
      });

      attributed++;
      revenueTotal += revenue;
      commissionTotal += commission;
      break; // Only attribute first course
    }
  }

  // Mettre à jour les stats agrégées des campagnes
  const campaignIds = new Set(recipients.map((r) => r.campaign_id));
  for (const cid of campaignIds) {
    if (!cid) continue;
    const allRecipients = await base44.asServiceRole.entities.ReactivationCampaignRecipient.filter({ campaign_id: cid });
    const sentCount = allRecipients.filter((r) => r.status !== "control" && r.status !== "pending").length;
    const deliveredCount = allRecipients.filter((r) => ["delivered", "opened", "converted"].includes(r.status)).length;
    const openedCount = allRecipients.filter((r) => ["opened", "converted"].includes(r.status)).length;
    const courseCreatedCount = allRecipients.filter((r) => r.course_created_at).length;
    const courseCompletedCount = allRecipients.filter((r) => r.course_completed_at).length;
    const revenue = allRecipients.reduce((sum, r) => sum + (r.revenue || 0), 0);
    const commission = allRecipients.reduce((sum, r) => sum + (r.commission || 0), 0);

    await base44.asServiceRole.entities.ReactivationCampaign.update(cid, {
      sent_count: sentCount,
      delivered_count: deliveredCount,
      opened_count: openedCount,
      course_created_count: courseCreatedCount,
      course_completed_count: courseCompletedCount,
      revenue_generated: revenue,
      commission_generated: commission,
      net_result: commission, // promo_cost is always 0
    });
  }

  return { attributed, revenueTotal, commissionTotal };
}