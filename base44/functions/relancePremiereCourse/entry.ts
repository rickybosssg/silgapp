import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { normalizePhone } from '../../shared/phoneUtils.ts';
import { getRecentlySolicitedClients, isClientSolicited } from '../../shared/antiSolicitation.ts';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * relancePremiereCourse — Relance automatique après la première course livrée
 *
 * OBJECTIF : identifier les clients qui viennent de livrer leur première course
 * et préparer une relance push FCM pour provoquer une deuxième commande.
 *
 * DEUX SWITCHS SÉPARÉS :
 *   1. FIRST_COURSE_RELANCE_ANALYSIS_ENABLED (défaut: true)
 *      → Le moteur analyse les clients, applique tous les filtres, et enregistre
 *        ce qu'il aurait envoyé en DRY-RUN. Aucun push n'est envoyé.
 *   2. FIRST_COURSE_RELANCE_SEND_ENABLED (défaut: false)
 *      → Autorise l'envoi FCM réel. Tant que false, aucun push n'est envoyé.
 *
 * ANTI-SOLLICITATION CROISÉE :
 *   - Vérifie les HabitReminder 'sent' des dernières 72h (moteurRappelsHabitude + cette fonction)
 *   - Vérifie les ReactivationScenario actifs ou avec push récent (moteurReactivationAuto)
 *   - Si un client a reçu une sollicitation marketing dans les 72h, il est exclu
 *
 * CONTRAINTES :
 *   - Aucune dépense publicitaire (FCM natif uniquement)
 *   - Aucune réduction/récompense financière
 *   - Pas de doublon avec moteurReactivationAuto (first_course_delivered J+1/J+3/J+7)
 *   - Séparation par pays
 *   - Frequency cap : 1 relance par client
 *   - Idempotence : vérifie les HabitReminder existants
 *   - Consentement marketing respecté (preferences_categories)
 *
 * NE MODIFIE PAS : Dispatch V2, tarification, finance, QR/PIN, GPS, FCM natif.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const RELANCE_DELAY_HOURS = 48; // Délai minimum avant relance après livraison (48h)
const RELANCE_DELAY_MAX_HOURS = 7 * 24; // Délai maximum : 7 jours après livraison (au-delà, la relance n'est plus pertinente)
const MAX_TARGETS_PER_RUN = 50; // Limite anti-saturation
const ANTI_SOLICITATION_WINDOW_HOURS = 72; // Fenêtre anti-sollicitation croisée

const RELANCE_TITLE = "Besoin d'un livreur ? 🛵";
const RELANCE_MESSAGE = "Votre prochaine livraison peut partir en quelques secondes avec SILGAPP. Ouvrez l'app et lancez votre course.";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // ── Auth : accepter les appels service-role (Workflow) ET admin manuels ──
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch {
      // Appel depuis un Workflow Base44 (service role)
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'run';

    // ── Deux switches séparés ──
    let analysisEnabled = true; // Analyse activée par défaut (DRY-RUN observation)
    let sendEnabled = false;    // Envoi FCM désactivé par défaut
    try {
      const configs = await base44.asServiceRole.entities.AppConfig.filter({
        cle: { $in: ['FIRST_COURSE_RELANCE_ANALYSIS_ENABLED', 'FIRST_COURSE_RELANCE_SEND_ENABLED'] },
      });
      const configMap: Record<string, string> = {};
      for (const c of configs) {
        if (c.cle) configMap[c.cle] = c.valeur;
      }
      analysisEnabled = configMap['FIRST_COURSE_RELANCE_ANALYSIS_ENABLED'] !== 'false'; // true par défaut
      sendEnabled = configMap['FIRST_COURSE_RELANCE_SEND_ENABLED'] === 'true';            // false par défaut
    } catch {}

    if (!analysisEnabled) {
      return Response.json({
        action,
        status: 'analysis_disabled',
        message: 'FIRST_COURSE_RELANCE_ANALYSIS_ENABLED is false. Motor does not run.',
      });
    }

    // ── Action : audit (analyser sans rien créer) ──
    if (action === 'audit') {
      const result = await analyzeEligibleClients(base44);
      return Response.json({
        action: 'audit',
        analysis_enabled: true,
        send_enabled: sendEnabled,
        dry_run: !sendEnabled,
        ...result,
        message_title: RELANCE_TITLE,
        message_body: RELANCE_MESSAGE,
      });
    }

    // ── Action : run (préparer les relances en DRY-RUN) ──
    if (action === 'run') {
      const result = await analyzeEligibleClients(base44);
      const effectiveDryRun = !sendEnabled; // DRY-RUN tant que sendEnabled est false

      const now = new Date().toISOString();
      const batchId = `first_course_relance_${Date.now()}`;
      let prepared = 0;
      const details: any[] = [];

      for (const el of result.retained) {
        const { client, token, deliveredAt, hoursSinceDelivery } = el;

        // ── Créer un HabitReminder (DRY-RUN = status 'pending', pas d'envoi) ──
        await base44.asServiceRole.entities.HabitReminder.create({
          client_id: client.id,
          client_telephone: client.telephone || '',
          client_phone_normalized: normalizePhone(client.telephone, client.country_code || undefined) || '',
          client_user_email: client.user_email || '',
          country_code: client.country_code || '',
          segment: 'first_course_delivered',
          habit_type: 'tranche_horaire',
          habit_detail: JSON.stringify({
            first_course_delivered_at: deliveredAt,
            hours_since_delivery: hoursSinceDelivery,
            message_title: RELANCE_TITLE,
            message_body: RELANCE_MESSAGE,
          }),
          habit_occurrences: 1,
          habit_ratio: 1.0,
          is_control_group: false,
          status: effectiveDryRun ? 'pending' : 'sent',
          push_token: token.token,
          push_token_id: token.id || '',
          campaign_batch_id: batchId,
        });
        prepared++;
        details.push({
          client_id: client.id,
          country_code: client.country_code,
          status: effectiveDryRun ? 'dry_run_pending' : 'sent',
          hours_since_delivery: hoursSinceDelivery,
          delivered_at: deliveredAt,
        });
      }

      return Response.json({
        action: 'run',
        analysis_enabled: true,
        send_enabled: sendEnabled,
        dry_run: effectiveDryRun,
        eligible_count: result.eligible_count,
        excluded_opt_out: result.excluded_opt_out,
        excluded_duplicate: result.excluded_duplicate,
        excluded_no_fcm: result.excluded_no_fcm,
        excluded_recent_solicitation: result.excluded_recent_solicitation,
        retained_count: result.retained.length,
        prepared,
        message_title: RELANCE_TITLE,
        message_body: RELANCE_MESSAGE,
        details: details.slice(0, 10),
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[relancePremiereCourse] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Analyse complète des clients éligibles avec breakdown détaillé
// ═══════════════════════════════════════════════════════════════════════════

async function analyzeEligibleClients(base44: any): Promise<any> {
  const now = Date.now();
  const delayMinMs = RELANCE_DELAY_HOURS * 3600000;       // 48h
  const delayMaxMs = RELANCE_DELAY_MAX_HOURS * 3600000;     // 7 jours

  // ── Charger les courses livrées récentes (14 derniers jours pour couvrir la fenêtre 48h-7j) ──
  const recentDelivered: any[] = [];
  let skip = 0;
  while (true) {
    const batch = await base44.asServiceRole.entities.CourseExterne.filter(
      { statut: 'livree' },
      '-heure_livraison', 500, skip
    );
    if (!batch || batch.length === 0) break;
    recentDelivered.push(...batch);
    if (batch.length < 500) break;
    skip += 500;
    if (skip > 3000) break;
  }

  // ── Grouper par client (phone_normalized ou user_email) ──
  const clientCourses = new Map<string, any[]>();
  for (const c of recentDelivered) {
    const key = c.client_phone_normalized || c.client_user_email || c.client_telephone || '';
    if (!key) continue;
    if (!clientCourses.has(key)) clientCourses.set(key, []);
    clientCourses.get(key)!.push(c);
  }

  // ── Filtrer : exactement 1 course livrée ET délai ≥ 48h ET ≤ 7 jours ──
  const firstCourseClients: any[] = [];
  let excludedTooRecent = 0;    // < 48h
  let excludedTooOld = 0;        // > 7 jours
  let excludedSecondCourse = 0;  // a déjà créé une 2ème course

  for (const [key, courses] of clientCourses) {
    // Compter les courses livrées ET les courses créées (tous statuts)
    const deliveredCourses = courses.filter(c => c.statut === 'livree');

    // Le client ne doit avoir qu'EXACTEMENT 1 course livrée
    if (deliveredCourses.length !== 1) {
      if (deliveredCourses.length > 1) excludedSecondCourse++;
      continue;
    }

    // Vérifier qu'aucune autre course (non livrée) n'a été créée après la livraison
    const course = deliveredCourses[0];
    const deliveredAt = course.heure_livraison || course.colis_livre_at || course.created_date;
    if (!deliveredAt) continue;

    const deliveredMs = new Date(deliveredAt).getTime();
    const hoursSinceDelivery = (now - deliveredMs) / 3600000;

    // Si une autre course a été créée après la livraison → le client a déjà commandé à nouveau
    const hasSecondCourse = courses.some(c => {
      if (c.id === course.id) return false;
      const createdMs = c.created_date ? new Date(c.created_date).getTime() : 0;
      return createdMs > deliveredMs;
    });
    if (hasSecondCourse) {
      excludedSecondCourse++;
      continue;
    }

    if (hoursSinceDelivery < RELANCE_DELAY_HOURS) {
      excludedTooRecent++;
      continue;
    }
    if (hoursSinceDelivery > RELANCE_DELAY_MAX_HOURS) {
      excludedTooOld++;
      continue;
    }

    firstCourseClients.push({ key, course, deliveredAt, hoursSinceDelivery });
  }

  // ── Charger les clients ClientExterne ──
  const clients = await base44.asServiceRole.entities.ClientExterne.list();
  const clientByPhone = new Map<string, any>();
  const clientByEmail = new Map<string, any>();
  for (const c of clients) {
    if (c.telephone_normalized) clientByPhone.set(c.telephone_normalized, c);
    if (c.user_email) clientByEmail.set(c.user_email.trim().toLowerCase(), c);
  }

  // ── Charger les tokens FCM natifs ──
  const tokens = await base44.asServiceRole.entities.NotificationToken.filter({
    user_type: 'client',
    actif: true,
  });
  const tokenByEmail = new Map<string, any>();
  for (const t of tokens) {
    if (t.token && !String(t.token).startsWith('web_') && t.user_email) {
      tokenByEmail.set(t.user_email, t);
    }
  }

  // ── Anti-sollicitation bidirectionnelle (module partagé) ──
  // Charge tous les clients sollicités dans les 72h par n'importe quel moteur
  const solicitationResult = await getRecentlySolicitedClients(base44);

  // ── Anti-doublon : déjà relancé par cette fonction (segment first_course_delivered) ──
  const allReminders = await base44.asServiceRole.entities.HabitReminder.list();
  const remindedClientIds = new Set<string>();
  for (const r of allReminders) {
    if (r.segment === 'first_course_delivered' && r.client_id) {
      remindedClientIds.add(r.client_id);
    }
  }

  // ── Construire la liste finale avec breakdown ──
  const eligible: any[] = [];
  const seenClientIds = new Set<string>();
  let excludedOptOut = 0;
  let excludedDuplicate = 0;
  let excludedNoFcm = 0;
  let excludedRecentSolicitation = 0;

  for (const fc of firstCourseClients) {
    let client = null;
    const phone = fc.key;
    const email = fc.course.client_user_email?.trim().toLowerCase();
    if (phone) client = clientByPhone.get(phone);
    if (!client && email) client = clientByEmail.get(email);
    if (!client) continue;

    if (seenClientIds.has(client.id)) continue;
    seenClientIds.add(client.id);

    // 1. Anti-doublon : déjà relancé par cette fonction
    if (remindedClientIds.has(client.id)) {
      excludedDuplicate++;
      continue;
    }

    // 2. Anti-sollicitation bidirectionnelle : client sollicité par un autre moteur dans les 72h
    if (isClientSolicited(
      client.id,
      client.telephone_normalized,
      client.user_email,
      solicitationResult
    )) {
      excludedRecentSolicitation++;
      continue;
    }

    // 3. Vérifier le token FCM natif
    const token = client.user_email ? tokenByEmail.get(client.user_email) : null;
    if (!token || !token.token || String(token.token).startsWith('web_')) {
      excludedNoFcm++;
      continue;
    }

    // 4. Vérifier le consentement marketing
    const prefs = parseMarketingPrefs(token.preferences_categories);
    if (prefs.includes('marketing')) {
      excludedOptOut++;
      continue;
    }

    eligible.push({
      client,
      token,
      deliveredAt: fc.deliveredAt,
      hoursSinceDelivery: fc.hoursSinceDelivery,
    });
  }

  const retained = eligible.slice(0, MAX_TARGETS_PER_RUN);

  return {
    eligible_count: firstCourseClients.length,
    total_with_exactly_one_delivered: firstCourseClients.length + excludedTooRecent + excludedTooOld,
    excluded_too_recent_lt_48h: excludedTooRecent,
    excluded_too_old_gt_7d: excludedTooOld,
    excluded_second_course_created: excludedSecondCourse,
    excluded_opt_out: excludedOptOut,
    excluded_duplicate: excludedDuplicate,
    excluded_no_fcm: excludedNoFcm,
    excluded_recent_solicitation: excludedRecentSolicitation,
    retained_count: retained.length,
    retained: retained.map(e => ({
      client_id: e.client.id,
      country_code: e.client.country_code,
      delivered_at: e.deliveredAt,
      hours_since_delivery: Math.round(e.hoursSinceDelivery * 10) / 10,
      has_fcm: !!e.token?.token,
    })),
  };
}

function parseMarketingPrefs(prefsStr: string | null | undefined): string[] {
  if (!prefsStr) return [];
  try {
    const arr = JSON.parse(prefsStr);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}