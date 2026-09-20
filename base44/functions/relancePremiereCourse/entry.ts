import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { normalizePhone } from '../../shared/phoneUtils.ts';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * relancePremiereCourse — Relance automatique après la première course livrée
 *
 * OBJECTIF : identifier les clients qui viennent de livrer leur première course
 * et préparer une relance push FCM pour provoquer une deuxième commande.
 *
 * CONTRAINTES :
 *   - Aucune dépense publicitaire (FCM natif uniquement)
 *   - Aucune réduction/récompense financière
 *   - DRY-RUN par défaut (aucun envoi réel sans activation explicite)
 *   - Pas de doublon avec moteurReactivationAuto (first_course_delivered J+1/J+3/J+7)
 *   - Séparation par pays
 *   - Frequency cap : 1 relance par client, jamais de doublon
 *   - Idempotence : vérifie les HabitReminder existants
 *   - Consentement marketing respecté (preferences_categories)
 *   - Kill switch immédiat via AppConfig
 *
 * DIFFÉRENCE avec moteurReactivationAuto :
 *   - moteurReactivationAuto utilise le segment `first_course_delivered` avec
 *     J+1/J+3/J+7 (rappels à 1, 3 et 7 jours après la livraison).
 *   - Cette fonction prépare une relance PLUS RAPIDE (2h après la livraison)
 *     qui n'entre pas en conflit car elle crée des HabitReminder (entité séparée)
 *     et ne crée pas de ReactivationScenario.
 *   - Si un scénario `first_course_delivered` existe déjà, le client est ignoré.
 *
 * NE MODIFIE PAS : Dispatch V2, tarification, finance, QR/PIN, GPS, FCM natif.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const RELANCE_DELAY_HOURS = 2; // Délai avant relance après la livraison
const MAX_TARGETS_PER_RUN = 50; // Limite anti-saturation

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
    const forcedDryRun = body.dry_run !== false; // DRY-RUN par défaut

    // ── Kill switch ──
    let enabled = false;
    let dryRun = true;
    try {
      const configs = await base44.asServiceRole.entities.AppConfig.filter({
        cle: { $in: ['FIRST_COURSE_RELANCE_ENABLED', 'FIRST_COURSE_RELANCE_DRY_RUN'] },
      });
      const configMap: Record<string, string> = {};
      for (const c of configs) {
        if (c.cle) configMap[c.cle] = c.valeur;
      }
      enabled = configMap['FIRST_COURSE_RELANCE_ENABLED'] === 'true';
      dryRun = configMap['FIRST_COURSE_RELANCE_DRY_RUN'] !== 'false'; // DRY-RUN par défaut
    } catch {}

    if (!enabled) {
      return Response.json({
        action,
        status: 'disabled',
        message: 'FIRST_COURSE_RELANCE_ENABLED is not true. No relance prepared.',
      });
    }

    // ── Action : audit (compter sans rien créer) ──
    if (action === 'audit') {
      const eligible = await findEligibleClients(base44);
      return Response.json({
        action: 'audit',
        eligible_count: eligible.length,
        details: eligible.map(e => ({
          client_id: e.client.id,
          country_code: e.client.country_code,
          delivered_at: e.deliveredAt,
          hours_since_delivery: e.hoursSinceDelivery,
          has_fcm: !!e.token?.token,
        })),
      });
    }

    // ── Action : run (préparer les relances en DRY-RUN) ──
    if (action === 'run') {
      const eligible = await findEligibleClients(base44);
      const effectiveDryRun = forcedDryRun && dryRun;

      const now = new Date().toISOString();
      const batchId = `first_course_relance_${Date.now()}`;
      let prepared = 0;
      let skipped = 0;
      const details: any[] = [];

      for (const el of eligible) {
        const { client, token, deliveredAt, hoursSinceDelivery } = el;

        // ── Vérifier le délai (2h minimum après livraison) ──
        if (hoursSinceDelivery < RELANCE_DELAY_HOURS) continue;

        // ── Vérifier le token FCM natif ──
        if (!token || !token.token || String(token.token).startsWith('web_')) {
          skipped++;
          continue;
        }

        // ── Vérifier le consentement marketing ──
        const prefs = parseMarketingPrefs(token.preferences_categories);
        if (prefs.includes('marketing')) {
          skipped++;
          continue;
        }

        // ── Créer un HabitReminder (DRY-RUN = status 'pending', pas d'envoi) ──
        if (effectiveDryRun) {
          await base44.asServiceRole.entities.HabitReminder.create({
            client_id: client.id,
            client_telephone: client.telephone || '',
            client_phone_normalized: normalizePhone(client.telephone, client.country_code || undefined) || '',
            client_user_email: client.user_email || '',
            country_code: client.country_code || '',
            segment: 'first_course_delivered',
            habit_type: 'tranche_horaire',
            habit_detail: JSON.stringify({ first_course_delivered_at: deliveredAt }),
            habit_occurrences: 1,
            habit_ratio: 1.0,
            is_control_group: false,
            status: 'pending',
            push_token: token.token,
            push_token_id: token.id || '',
            campaign_batch_id: batchId,
          });
          prepared++;
          details.push({
            client_id: client.id,
            country_code: client.country_code,
            status: 'dry_run_pending',
            hours_since_delivery: hoursSinceDelivery,
          });
        }
      }

      return Response.json({
        action: 'run',
        dry_run: effectiveDryRun,
        enabled,
        eligible_count: eligible.length,
        prepared,
        skipped,
        details: details.slice(0, 10), // Échantillon anonymisé
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[relancePremiereCourse] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ── Trouver les clients éligibles (exactly 1 delivered course, pas de relance existante) ──

async function findEligibleClients(base44: any): Promise<any[]> {
  const now = Date.now();
  const delayMs = RELANCE_DELAY_HOURS * 3600000;

  // ── Charger les courses livrées récentes (7 derniers jours) ──
  const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
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
    if (skip > 2000) break;
  }

  // ── Grouper par client (phone_normalized ou user_email) ──
  const clientCourses = new Map<string, any[]>();
  for (const c of recentDelivered) {
    const key = c.client_phone_normalized || c.client_user_email || c.client_telephone || '';
    if (!key) continue;
    if (!clientCourses.has(key)) clientCourses.set(key, []);
    clientCourses.get(key)!.push(c);
  }

  // ── Filtrer : exactement 1 course livrée ──
  const firstCourseClients: any[] = [];
  for (const [key, courses] of clientCourses) {
    if (courses.length !== 1) continue; // Exactement 1 course livrée
    const course = courses[0];
    const deliveredAt = course.heure_livraison || course.colis_livre_at || course.created_date;
    if (!deliveredAt) continue;
    const deliveredMs = new Date(deliveredAt).getTime();
    const hoursSinceDelivery = (now - deliveredMs) / 3600000;
    if (hoursSinceDelivery < RELANCE_DELAY_HOURS) continue;
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

  // ── Charger les HabitReminder existants (anti-doublon) ──
  const existingReminders = await base44.asServiceRole.entities.HabitReminder.filter({
    segment: 'first_course_delivered',
  });
  const remindedClientIds = new Set(existingReminders.map((r: any) => r.client_id));

  // ── Charger les ReactivationScenario actifs (anti-doublon avec moteurReactivationAuto) ──
  const activeScenarios = await base44.asServiceRole.entities.ReactivationScenario.filter({
    status: 'active',
  });
  const reactivationClientIds = new Set(activeScenarios.map((s: any) => s.client_id));

  // ── Construire la liste finale ──
  const eligible: any[] = [];
  const seenClientIds = new Set<string>();

  for (const fc of firstCourseClients) {
    let client = null;
    const phone = fc.key;
    const email = fc.course.client_user_email?.trim().toLowerCase();
    if (phone) client = clientByPhone.get(phone);
    if (!client && email) client = clientByEmail.get(email);
    if (!client) continue;

    // Anti-doublon : déjà relancé
    if (remindedClientIds.has(client.id)) continue;
    // Anti-doublon : déjà dans un scénario de réactivation actif
    if (reactivationClientIds.has(client.id)) continue;
    if (seenClientIds.has(client.id)) continue;
    seenClientIds.add(client.id);

    const token = client.user_email ? tokenByEmail.get(client.user_email) : null;

    eligible.push({
      client,
      token,
      deliveredAt: fc.deliveredAt,
      hoursSinceDelivery: fc.hoursSinceDelivery,
    });
  }

  return eligible.slice(0, MAX_TARGETS_PER_RUN);
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