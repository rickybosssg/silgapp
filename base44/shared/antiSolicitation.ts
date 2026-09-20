// ═══════════════════════════════════════════════════════════════════════════
// ANTI-SOLLICITATION BIDIRECTIONNELLE — Module partagé
// ═══════════════════════════════════════════════════════════════════════════
//
// RÈGLE : un client ne doit jamais recevoir deux types de relances marketing
// pendant la même fenêtre de 72h.
//
// PRIORITÉ : réactivation active > relance première course > rappel d'habitude
//
// Chaque moteur doit appeler getRecentlySolicitedClients() avant tout envoi
// et exclure les clients retournés.
//
// NE MODIFIE PAS : Dispatch V2, tarification, finance, QR/PIN, GPS, FCM natif.
// ═══════════════════════════════════════════════════════════════════════════

export const ANTI_SOLICITATION_WINDOW_HOURS = 72;
export const ANTI_SOLICITATION_WINDOW_MS = ANTI_SOLICITATION_WINDOW_HOURS * 3600000;

export interface SolicitationCheckResult {
  /** client_ids sollicités dans les 72h (tous moteurs confondus) */
  solicitedClientIds: Set<string>;
  /** person keys (phone:XXX / email:XXX) sollicités dans les 72h */
  solicitedPersonKeys: Set<string>;
}

/**
 * Charge tous les clients ayant reçu une sollicitation marketing dans les 72h,
 * tous moteurs confondus (HabitReminder sent + ReactivationScenario avec push récent).
 *
 * Un client est considéré "sollicité" si :
 * - Un HabitReminder avec status='sent' a été envoyé dans les 72h (moteurRappelsHabitude OU relancePremiereCourse)
 * - Un ReactivationScenario a un push envoyé (j0_sent_at, j2_sent_at, j5_sent_at) dans les 72h
 * - Un ReactivationScenario est actif (status='active')
 */
export async function getRecentlySolicitedClients(base44: any): Promise<SolicitationCheckResult> {
  const now = Date.now();
  const windowMs = ANTI_SOLICITATION_WINDOW_MS;

  const solicitedClientIds = new Set<string>();
  const solicitedPersonKeys = new Set<string>();

  // ── 1. HabitReminder avec status='sent' dans les 72h ──
  // Couvre : moteurRappelsHabitude (segment non first_course_delivered) ET relancePremiereCourse (segment first_course_delivered)
  const sentReminders = await base44.asServiceRole.entities.HabitReminder.filter({
    status: 'sent',
  }).catch(() => []);

  for (const r of sentReminders) {
    const sentTs = r.sent_at ? new Date(r.sent_at).getTime() : 0;
    if (!sentTs) continue;
    if ((now - sentTs) >= windowMs) continue; // hors fenêtre

    if (r.client_id) solicitedClientIds.add(r.client_id);
    if (r.client_phone_normalized) solicitedPersonKeys.add(`phone:${r.client_phone_normalized}`);
    if (r.client_user_email) solicitedPersonKeys.add(`email:${r.client_user_email.toLowerCase()}`);
  }

  // ── 2. ReactivationScenario actifs OU avec push envoyé dans les 72h ──
  const allScenarios = await base44.asServiceRole.entities.ReactivationScenario.list().catch(() => []);

  for (const s of allScenarios) {
    let isSolicited = false;

    // Scénario actif = client en cours de réactivation
    if (s.status === 'active') {
      isSolicited = true;
    }

    // Push envoyé dans les 72h (J0, J+2, J+5 ou J+1, J+3, J+7)
    if (!isSolicited) {
      const pushDates = [s.j0_sent_at, s.j2_sent_at, s.j5_sent_at].filter(Boolean);
      for (const d of pushDates) {
        const ts = new Date(d).getTime();
        if (ts && (now - ts) < windowMs) {
          isSolicited = true;
          break;
        }
      }
    }

    if (isSolicited) {
      if (s.client_id) solicitedClientIds.add(s.client_id);
      if (s.client_phone_normalized) solicitedPersonKeys.add(`phone:${s.client_phone_normalized}`);
      if (s.client_user_email) solicitedPersonKeys.add(`email:${s.client_user_email.toLowerCase()}`);
    }
  }

  return { solicitedClientIds, solicitedPersonKeys };
}

/**
 * Vérifie si un client spécifique a été sollicité dans les 72h.
 * Utilise les sets préchargés pour éviter les N+1.
 */
export function isClientSolicited(
  clientId: string,
  clientPhoneNormalized: string | null | undefined,
  clientUserEmail: string | null | undefined,
  result: SolicitationCheckResult
): boolean {
  if (result.solicitedClientIds.has(clientId)) return true;

  const phone = (clientPhoneNormalized || '').trim();
  if (phone && result.solicitedPersonKeys.has(`phone:${phone}`)) return true;

  const email = (clientUserEmail || '').trim().toLowerCase();
  if (email && result.solicitedPersonKeys.has(`email:${email}`)) return true;

  return false;
}