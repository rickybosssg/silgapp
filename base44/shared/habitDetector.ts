// ═══════════════════════════════════════════════════════════════════════════
// DÉTECTEUR D'HABITUDES — Phase 4
// ═══════════════════════════════════════════════════════════════════════════
//
// Détecte les habitudes de commande à partir des courses LIVRÉES.
// Utilise des règles simples, explicables, calculables depuis les données.
// Aucun machine learning — juste des compteurs et des ratios.
//
// NE MODIFIE PAS : Dispatch V2, finance, tarification, Phases 1/2/3.
// ═══════════════════════════════════════════════════════════════════════════

// ── Segmentation de fréquence (interne/admin uniquement) ────────────────────

export type ClientFrequencySegment = 'nouveau' | 'en_developpement' | 'regulier' | 'tres_regulier';

export function computeFrequencySegment(deliveredCount: number): ClientFrequencySegment {
  if (deliveredCount <= 1) return 'nouveau';
  if (deliveredCount <= 4) return 'en_developpement';
  if (deliveredCount <= 9) return 'regulier';
  return 'tres_regulier';
}

// ── Types d'habitudes détectables ────────────────────────────────────────────

export type HabitType = 'tranche_horaire' | 'jour' | 'trajet' | 'combine';

export interface DetectedHabit {
  type: HabitType;
  occurrences: number;
  ratio: number; // occurrences / totalCourses
  detail: {
    tranche?: 'matin' | 'aprem' | 'soir' | 'nuit';
    jour?: number; // 0=dimanche ... 6=samedi
    trajet?: string; // "quartier_depart→quartier_arrivee"
  };
}

// ── Seuils (audités sur données réelles SILGAPP) ────────────────────────────
// MIN_OCCURRENCES = 3 : seuil minimum pour qu'une habitude soit fiable
// MIN_RATIO_TRANCHE = 0.50 : 50% des courses dans la même tranche
// MIN_RATIO_JOUR = 0.40 : 40% des courses le même jour
// MIN_RATIO_TRAJET = 0.40 : 40% des courses le même trajet
// MIN_COURSES_TOTAL = 3 : minimum de courses livrées pour analyser

export const HABIT_THRESHOLDS = {
  MIN_OCCURRENCES: 3,
  MIN_RATIO_TRANCHE: 0.50,
  MIN_RATIO_JOUR: 0.40,
  MIN_RATIO_TRAJET: 0.40,
  MIN_COURSES_TOTAL: 3,
};

// ── Détection des habitudes à partir d'une liste de courses ──────────────────

export function detectHabits(courses: any[]): DetectedHabit | null {
  if (!courses || courses.length < HABIT_THRESHOLDS.MIN_COURSES_TOTAL) return null;

  const total = courses.length;
  let bestHabit: DetectedHabit | null = null;

  // ── 1. Tranche horaire récurrente ──
  const trancheCounts: Record<string, number> = { matin: 0, aprem: 0, soir: 0, nuit: 0 };
  for (const c of courses) {
    if (!c.created_date) continue;
    const h = new Date(c.created_date).getHours();
    if (h >= 6 && h < 12) trancheCounts.matin++;
    else if (h >= 12 && h < 18) trancheCounts.aprem++;
    else if (h >= 18 && h < 23) trancheCounts.soir++;
    else trancheCounts.nuit++;
  }
  let maxTranche = '';
  let maxTrancheCount = 0;
  for (const [t, n] of Object.entries(trancheCounts)) {
    if (n > maxTrancheCount) { maxTranche = t; maxTrancheCount = n; }
  }
  const trancheRatio = maxTrancheCount / total;
  const trancheHabit: DetectedHabit | null =
    maxTrancheCount >= HABIT_THRESHOLDS.MIN_OCCURRENCES && trancheRatio >= HABIT_THRESHOLDS.MIN_RATIO_TRANCHE
      ? { type: 'tranche_horaire', occurrences: maxTrancheCount, ratio: trancheRatio, detail: { tranche: maxTranche as any } }
      : null;

  // ── 2. Jour de la semaine récurrent ──
  const dayCounts: Record<number, number> = {};
  for (const c of courses) {
    if (!c.created_date) continue;
    const d = new Date(c.created_date).getDay();
    dayCounts[d] = (dayCounts[d] || 0) + 1;
  }
  let maxDay = -1;
  let maxDayCount = 0;
  for (const [d, n] of Object.entries(dayCounts)) {
    if (n > maxDayCount) { maxDay = Number(d); maxDayCount = n; }
  }
  const dayRatio = maxDayCount / total;
  const dayHabit: DetectedHabit | null =
    maxDayCount >= HABIT_THRESHOLDS.MIN_OCCURRENCES && dayRatio >= HABIT_THRESHOLDS.MIN_RATIO_JOUR
      ? { type: 'jour', occurrences: maxDayCount, ratio: dayRatio, detail: { jour: maxDay } }
      : null;

  // ── 3. Trajet récurrent ──
  const tripCounts: Record<string, number> = {};
  for (const c of courses) {
    const dep = (c.quartier_depart || '').trim().toLowerCase();
    const arr = (c.quartier_arrivee || '').trim().toLowerCase();
    if (!dep && !arr) continue;
    const trip = `${dep}→${arr}`;
    tripCounts[trip] = (tripCounts[trip] || 0) + 1;
  }
  let maxTrip = '';
  let maxTripCount = 0;
  for (const [t, n] of Object.entries(tripCounts)) {
    if (n > maxTripCount) { maxTrip = t; maxTripCount = n; }
  }
  const tripRatio = maxTripCount / total;
  const tripHabit: DetectedHabit | null =
    maxTripCount >= HABIT_THRESHOLDS.MIN_OCCURRENCES && tripRatio >= HABIT_THRESHOLDS.MIN_RATIO_TRAJET
      ? { type: 'trajet', occurrences: maxTripCount, ratio: tripRatio, detail: { trajet: maxTrip } }
      : null;

  // ── Sélection de la meilleure habitude ──
  // Priorité : trajet > tranche horaire > jour (le trajet est le plus actionnable)
  if (tripHabit) bestHabit = tripHabit;
  else if (trancheHabit) bestHabit = trancheHabit;
  else if (dayHabit) bestHabit = dayHabit;

  // ── Habitude combinée : tranche + jour ──
  if (trancheHabit && dayHabit && trancheHabit.detail.tranche && dayHabit.detail.jour !== undefined) {
    // Vérifier si les courses correspondent aux deux critères
    let combinedCount = 0;
    for (const c of courses) {
      if (!c.created_date) continue;
      const d = new Date(c.created_date);
      const h = d.getHours();
      const day = d.getDay();
      const tranche = h >= 6 && h < 12 ? 'matin' : h >= 12 && h < 18 ? 'aprem' : h >= 18 && h < 23 ? 'soir' : 'nuit';
      if (tranche === trancheHabit.detail.tranche && day === dayHabit.detail.jour) combinedCount++;
    }
    if (combinedCount >= HABIT_THRESHOLDS.MIN_OCCURRENCES) {
      bestHabit = {
        type: 'combine',
        occurrences: combinedCount,
        ratio: combinedCount / total,
        detail: { tranche: trancheHabit.detail.tranche, jour: dayHabit.detail.jour },
      };
    }
  }

  return bestHabit;
}

// ── Déterminer si un rappel doit être envoyé maintenant ──────────────────────
// Vérifie que la période habituelle approche (dans les 2 heures qui viennent).

export function shouldSendNow(habit: DetectedHabit, now: Date = new Date()): boolean {
  if (habit.type === 'tranche_horaire' || habit.type === 'combine') {
    const tranche = habit.detail.tranche;
    if (!tranche) return false;
    const h = now.getHours();
    // Envoyer 1h avant le début de la tranche habituelle
    // matin (6-12) → envoyer à 5h
    // aprem (12-18) → envoyer à 11h
    // soir (18-23) → envoyer à 17h
    // nuit (0-6) → ne pas envoyer (trop tôt/tard)
    if (tranche === 'matin') return h >= 5 && h < 6;
    if (tranche === 'aprem') return h >= 11 && h < 12;
    if (tranche === 'soir') return h >= 17 && h < 18;
    return false;
  }
  // Pour les habitudes de jour uniquement : envoyer le matin à 9h
  if (habit.type === 'jour') {
    const h = now.getHours();
    return h >= 9 && h < 10;
  }
  // Pour les habitudes de trajet uniquement : envoyer le matin à 9h
  if (habit.type === 'trajet') {
    const h = now.getHours();
    return h >= 9 && h < 10;
  }
  return false;
}

// ── Hash déterministe pour groupe contrôle (réutilise le même algorithme) ───

export function hashClientId(clientId: string): number {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = ((hash << 5) - hash) + clientId.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}