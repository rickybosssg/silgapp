// ═══════════════════════════════════════════════════════════════════════════
// MOTEUR DE RAPPELS D'HABITUDE — Phase 4
// ═══════════════════════════════════════════════════════════════════════════
//
// RÈGLES FONDAMENTALES :
//   1. Maximum 1 rappel d'habitude par client sur 7 jours
//   2. Arrêt immédiat si le client a déjà commandé (course active dans les 48h)
//   3. Groupe contrôle stable : 15% des clients éligibles (aucun push)
//   4. Token FCM natif obligatoire (pas de SMS, pas de WhatsApp automatique)
//   5. Anti-spam global : respecte le cooldown de l'engine de réactivation
//   6. Mode dry-run par défaut : aucun envoi réel sans validation admin
//
// NE MODIFIE PAS : Dispatch V2, finance, tarification, Phases 1/2/3,
// moteur de réactivation existant.
// ═══════════════════════════════════════════════════════════════════════════

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  detectHabits,
  shouldSendNow,
  computeFrequencySegment,
  hashClientId,
  HABIT_THRESHOLDS,
  type DetectedHabit,
  type ClientFrequencySegment,
} from './habitDetector.ts';
import { sendReactivationPush } from './reactivationEngine.ts';
import { normalizePhone } from './phoneUtils.ts';

// ── Configuration ──────────────────────────────────────────────────────────

const CONTROL_GROUP_PCT = 15; // 15% groupe contrôle
const COOLDOWN_DAYS = 7; // 1 rappel max par 7 jours
const RECENT_COURSE_HOURS = 48; // Pas de rappel si course dans les 48h
const MAX_REMINDERS_PER_RUN = 50; // Limite anti-saturation

// ── Message par défaut (conservateur) ───────────────────────────────────────

const HABIT_REMINDER_TITLE = "Une livraison prévue aujourd'hui ? 🛵";
const HABIT_REMINDER_MESSAGE = "SILGAPP est prêt pour votre prochaine course.";

// ── Vérifier la configuration (AppConfig) ────────────────────────────────────

async function getHabitConfig(base44: any): Promise<{
  enabled: boolean;
  dryRun: boolean;
}> {
  const configs = await base44.asServiceRole.entities.AppConfig.list().catch(() => []);
  const configMap: Record<string, string> = {};
  for (const c of configs) {
    if (c.cle) configMap[c.cle] = c.valeur;
  }
  return {
    // DÉSACTIVÉ par défaut — doit être activé manuellement par l'admin
    enabled: configMap['HABIT_REMINDER_ENABLED'] === 'true',
    // Dry-run par défaut — aucun envoi réel sans validation
    dryRun: configMap['HABIT_REMINDER_DRY_RUN'] !== 'false',
  };
}

// ── Trouver les clients éligibles pour un rappel d'habitude ────────────────

export async function findEligibleHabitClients(base44: any, auditMode: boolean = false): Promise<any[]> {
  const now = Date.now();
  const recentCourseMs = RECENT_COURSE_HOURS * 3600000;
  const cooldownMs = COOLDOWN_DAYS * 86400000;

  // ── Charger les courses livrées (paginé) ──
  const allCourses: any[] = [];
  let skip = 0;
  while (true) {
    const batch = await base44.asServiceRole.entities.CourseExterne.filter(
      { statut: 'livree' },
      '-created_date', 500, skip
    );
    if (!batch || batch.length === 0) break;
    allCourses.push(...batch);
    if (batch.length < 500) break;
    skip += 500;
    if (skip > 5000) break;
  }

  // ── Grouper par client ──
  const clientMap = new Map<string, any[]>();
  for (const c of allCourses) {
    const key = c.client_phone_normalized || c.client_telephone || c.client_user_email || '';
    if (!key) continue;
    if (!clientMap.has(key)) clientMap.set(key, []);
    clientMap.get(key)!.push(c);
  }

  // ── Charger les tokens FCM natifs ──
  const tokens = await base44.asServiceRole.entities.NotificationToken.filter({
    user_type: 'client', actif: true
  });
  const tokenByEmail = new Map<string, any>();
  for (const t of tokens) {
    if (t.token && !String(t.token).startsWith('web_') && t.user_email) {
      tokenByEmail.set(t.user_email, t);
    }
  }

  // ── Charger les clients ClientExterne ──
  const clients = await base44.asServiceRole.entities.ClientExterne.list();
  const clientByPhone = new Map<string, any>();
  const clientByEmail = new Map<string, any>();
  for (const c of clients) {
    if (c.telephone_normalized) clientByPhone.set(c.telephone_normalized, c);
    if (c.user_email) clientByEmail.set(c.user_email.trim().toLowerCase(), c);
  }

  // ── Charger les rappels déjà envoyés (anti-spam 7 jours) ──
  const recentReminders = await base44.asServiceRole.entities.HabitReminder.filter({
    status: ['sent', 'failed', 'converted', 'control'],
  });
  const cooldownClientIds = new Set<string>();
  const cooldownPersonKeys = new Set<string>();
  for (const r of recentReminders) {
    const sentTs = r.sent_at ? new Date(r.sent_at).getTime() : 
                   r.created_date ? new Date(r.created_date).getTime() : 0;
    if (sentTs && (now - sentTs) < cooldownMs) {
      cooldownClientIds.add(r.client_id);
      if (r.client_phone_normalized) cooldownPersonKeys.add(`phone:${r.client_phone_normalized}`);
      if (r.client_user_email) cooldownPersonKeys.add(`email:${r.client_user_email.toLowerCase()}`);
    }
  }

  // ── Pour chaque client avec ≥3 courses, vérifier l'éligibilité ──
  const eligible: any[] = [];
  const seenPersonKeys = new Set<string>();

  for (const [clientKey, courses] of clientMap) {
    if (courses.length < HABIT_THRESHOLDS.MIN_COURSES_TOTAL) continue;

    // ── Détecter l'habitude ──
    const habit = detectHabits(courses);
    if (!habit) continue;

    // ── Vérifier que c'est le bon moment pour envoyer (sauf en mode audit) ──
    if (!auditMode && !shouldSendNow(habit)) continue;

    // ── Résoudre le ClientExterne ──
    let client = null;
    const phone = clientKey;
    const email = courses.find(c => c.client_user_email)?.client_user_email?.trim().toLowerCase();
    if (phone) client = clientByPhone.get(phone);
    if (!client && email) client = clientByEmail.get(email);
    if (!client) continue;

    // ── Vérifier token FCM natif ──
    const token = email ? tokenByEmail.get(email) : null;
    if (!token || !token.token) continue;

    // ── Anti-spam : pas de rappel dans les 7 jours ──
    if (cooldownClientIds.has(client.id)) continue;

    // ── Déduplication par personne ──
    const personKey = phone ? `phone:${phone}` : (email ? `email:${email}` : null);
    if (!personKey) continue;
    if (cooldownPersonKeys.has(personKey)) continue;
    if (seenPersonKeys.has(personKey)) continue;
    seenPersonKeys.add(personKey);

    // ── Vérifier qu'aucune course active récente (48h) ──
    const clientCourses = courses;
    const hasRecentActiveCourse = clientCourses.some(c => {
      if (!c.created_date) return false;
      const age = now - new Date(c.created_date).getTime();
      return age < recentCourseMs;
    });
    // Vérifier aussi les courses non livrées (actives)
    const activeStatuses = new Set(['nouvelle', 'en_attente', 'programmee', 'recherche_livreur',
      'livreur_en_route', 'client_contacto', 'en_route_expediteur', 'arrive_prise_en_charge',
      'colis_recupere', 'passager_embarque', 'pris_en_charge', 'en_livraison', 'arrivee']);
    const hasActiveCourse = clientCourses.some(c => activeStatuses.has(c.statut));
    if (hasRecentActiveCourse || hasActiveCourse) continue;

    // ── Vérifier qu'aucun scénario de réactivation n'est actif ──
    // (respect de l'anti-spam global existant)
    const activeScenarios = await base44.asServiceRole.entities.ReactivationScenario.filter({
      client_id: client.id,
      status: 'active',
    }).catch(() => []);
    if (activeScenarios.length > 0) continue;

    // ── Groupe contrôle déterministe (15%) ──
    const isControl = (hashClientId(client.id) % 100) < CONTROL_GROUP_PCT;

    // ── Segment de fréquence ──
    const deliveredCount = clientCourses.length;
    const segment = computeFrequencySegment(deliveredCount);

    eligible.push({
      client,
      token,
      habit,
      isControl,
      segment,
      deliveredCount,
    });
  }

  return eligible.slice(0, MAX_REMINDERS_PER_RUN);
}

// ── Envoyer les rappels (ou simuler en dry-run) ─────────────────────────────

export async function sendHabitReminders(
  base44: any,
  eligibleClients: any[],
  dryRun: boolean
): Promise<{
  sent: number;
  control: number;
  skipped: number;
  errors: number;
  details: any[];
}> {
  const now = new Date().toISOString();
  const batchId = `habit_${Date.now()}`;
  let sent = 0;
  let control = 0;
  let skipped = 0;
  let errors = 0;
  const details: any[] = [];

  for (const el of eligibleClients) {
    const { client, token, habit, isControl, segment } = el;

    // ── Groupe contrôle : pas de push, mais tracer ──
    if (isControl) {
      await base44.asServiceRole.entities.HabitReminder.create({
        client_id: client.id,
        client_telephone: client.telephone || '',
        client_phone_normalized: normalizePhone(client.telephone, client.country_code || undefined) || '',
        client_user_email: client.user_email || '',
        country_code: client.country_code || '',
        segment,
        habit_type: habit.type,
        habit_detail: JSON.stringify(habit.detail),
        habit_occurrences: habit.occurrences,
        habit_ratio: habit.ratio,
        is_control_group: true,
        status: 'control',
        campaign_batch_id: batchId,
      });
      control++;
      details.push({ client_id: client.id, status: 'control', habit: habit.type });
      continue;
    }

    // ── Dry-run : simuler sans envoyer ──
    if (dryRun) {
      await base44.asServiceRole.entities.HabitReminder.create({
        client_id: client.id,
        client_telephone: client.telephone || '',
        client_phone_normalized: normalizePhone(client.telephone, client.country_code || undefined) || '',
        client_user_email: client.user_email || '',
        country_code: client.country_code || '',
        segment,
        habit_type: habit.type,
        habit_detail: JSON.stringify(habit.detail),
        habit_occurrences: habit.occurrences,
        habit_ratio: habit.ratio,
        is_control_group: false,
        status: 'pending',
        push_token: token.token,
        push_token_id: token.id || '',
        campaign_batch_id: batchId,
      });
      skipped++;
      details.push({ client_id: client.id, status: 'dry_run_pending', habit: habit.type });
      continue;
    }

    // ── Envoi réel ──
    try {
      const result = await sendReactivationPush(
        [{ token: token.token, recipient_id: client.id }],
        HABIT_REMINDER_TITLE,
        HABIT_REMINDER_MESSAGE,
        'habit_reminder'
      );

      const ok = result.results?.[0]?.ok;
      const error = result.results?.[0]?.error;

      await base44.asServiceRole.entities.HabitReminder.create({
        client_id: client.id,
        client_telephone: client.telephone || '',
        client_phone_normalized: normalizePhone(client.telephone, client.country_code || undefined) || '',
        client_user_email: client.user_email || '',
        country_code: client.country_code || '',
        segment,
        habit_type: habit.type,
        habit_detail: JSON.stringify(habit.detail),
        habit_occurrences: habit.occurrences,
        habit_ratio: habit.ratio,
        is_control_group: false,
        push_token: token.token,
        push_token_id: token.id || '',
        status: ok ? 'sent' : 'failed',
        sent_at: ok ? now : null,
        fcm_error: ok ? null : (error || 'unknown'),
        campaign_batch_id: batchId,
      });

      if (ok) sent++;
      else errors++;
      details.push({ client_id: client.id, status: ok ? 'sent' : 'failed', habit: habit.type });
    } catch (err) {
      errors++;
      details.push({ client_id: client.id, status: 'error', error: err.message });
    }
  }

  return { sent, control, skipped, errors, details };
}

// ── Vérifier les conversions (course créée après rappel) ────────────────────

export async function checkHabitConversions(base44: any): Promise<number> {
  const sentReminders = await base44.asServiceRole.entities.HabitReminder.filter({
    status: 'sent',
  });

  let converted = 0;
  const windowMs = 72 * 3600000; // 72h après envoi

  for (const r of sentReminders) {
    if (!r.sent_at) continue;
    const sentTs = new Date(r.sent_at).getTime();
    const now = Date.now();
    if ((now - sentTs) > windowMs) continue; // hors fenêtre

    // Chercher une course créée après le rappel
    let courses: any[] = [];
    if (r.client_phone_normalized) {
      courses = await base44.asServiceRole.entities.CourseExterne.filter(
        { client_phone_normalized: r.client_phone_normalized },
        '-created_date', 5
      ).catch(() => []);
    }
    if (courses.length === 0 && r.client_user_email) {
      courses = await base44.asServiceRole.entities.CourseExterne.filter(
        { client_user_email: r.client_user_email },
        '-created_date', 5
      ).catch(() => []);
    }

    for (const c of courses) {
      const created = c.created_date ? new Date(c.created_date).getTime() : 0;
      if (created < sentTs) continue;
      if ((created - sentTs) > windowMs) continue;

      const revenue = c.prix_final || c.prix_propose_client || 0;
      const commission = c.commission_silga || 0;

      await base44.asServiceRole.entities.HabitReminder.update(r.id, {
        status: 'converted',
        converted_at: c.created_date,
        course_id: c.id,
        revenue,
        commission,
      });
      converted++;
      break;
    }
  }

  return converted;
}