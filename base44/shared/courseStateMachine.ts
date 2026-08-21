// ═══════════════════════════════════════════════════════════════════════════
// MACHINE D'ÉTAT DES COURSES — Source unique des transitions valides
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ Phase 1 : MODE PERMISSIF (log + warn, pas de blocage)
//    Toutes les transitions sont autorisées en Phase 1, mais les transitions
//    invalides sont journalisées pour audit. L'activation stricte se fera en
//    Phase 2 après inventaire complet des transitions observées en production.
//
// Statuts de course (CourseExterne.statut) :
//   nouvelle, en_attente, programmee, recherche_livreur, livreur_en_route,
//   client_contacte, en_route_expediteur, arrive_prise_en_charge, colis_recupere,
//   passager_embarque, pris_en_charge, en_livraison, arrivee, livree, annulee
//
// Statuts terminaux : livree, annulee (aucune transition sortante autorisée)
// ═══════════════════════════════════════════════════════════════════════════

// ── Statuts terminaux (aucune transition sortante) ──
export const STATUTS_TERMINAUX = ['livree', 'annulee'];

// ── Statuts actifs (livreur engagé dans la livraison) ──
export const STATUTS_ACTIFS = [
  'livreur_en_route', 'client_contacte', 'en_route_expediteur',
  'arrive_prise_en_charge', 'colis_recupere',
  'passager_embarque', 'pris_en_charge', 'en_livraison', 'arrivee',
];

// ── Transitions autorisées (map: from → [to, ...]) ──
// Inventaire des transitions observées en production.
// Toute transition absente de cette map est journalisée en Phase 1 (permissive)
// et sera bloquée en Phase 2 (stricte).
const TRANSITIONS_AUTORISEES: Record<string, string[]> = {
  // Création et dispatch
  'nouvelle': ['en_attente', 'recherche_livreur', 'programmee', 'annulee'],
  'en_attente': ['nouvelle', 'recherche_livreur', 'annulee'],
  'programmee': ['recherche_livreur', 'annulee'],
  'recherche_livreur': ['livreur_en_route', 'en_attente', 'annulee'],

  // Workflow standard (livreur accepte et livre)
  'livreur_en_route': ['client_contacte', 'en_route_expediteur', 'arrive_prise_en_charge', 'pris_en_charge', 'en_livraison', 'arrivee', 'annulee'],
  'client_contacte': ['en_route_expediteur', 'arrive_prise_en_charge', 'pris_en_charge', 'annulee'],
  'en_route_expediteur': ['arrive_prise_en_charge', 'colis_recupere', 'pris_en_charge', 'annulee'],
  'arrive_prise_en_charge': ['colis_recupere', 'pris_en_charge', 'passager_embarque', 'annulee'],
  'colis_recupere': ['en_livraison', 'arrivee', 'annulee'],
  'passager_embarque': ['en_livraison', 'arrivee', 'annulee'],
  'pris_en_charge': ['en_livraison', 'arrivee', 'annulee'],
  'en_livraison': ['arrivee', 'livree', 'annulee'],
  'arrivee': ['livree', 'annulee'],

  // Terminaux (aucune transition sortante)
  'livree': [],
  'annulee': [],
};

// ── Règles spécifiques aux courses admin (source=admin) ──
// Les courses admin ont des étapes intermédiaires supplémentaires
// (client_contacte, en_route_expediteur) qui ne sont pas utilisées
// pour les courses client standard.
const STATUTS_SPECIFIQUES_ADMIN = ['client_contacte', 'en_route_expediteur'];

/**
 * Valide une transition de statut.
 *
 * En Phase 1 (permissive) : journalise les transitions invalides mais ne bloque pas.
 * En Phase 2 (stricte, non encore activée) : bloquera les transitions invalides.
 *
 * @param from Statut actuel
 * @param to Nouveau statut
 * @param context Contexte optionnel { source, dispatch_status, type_course }
 * @returns { valid: boolean, reason?: string }
 */
export function validerTransition(
  from: string,
  to: string,
  context?: { source?: string; dispatch_status?: string; type_course?: string }
): { valid: boolean; reason?: string } {
  // Same statut = OK (pas une transition)
  if (from === to) return { valid: true };

  // Statut terminal = aucune transition sortante
  if (STATUTS_TERMINAUX.includes(from)) {
    return {
      valid: false,
      reason: `transition_bloquee_terminal: ${from} est un statut terminal — aucune transition vers ${to} autorisée`,
    };
  }

  // Vérifier la map des transitions
  const transitions = TRANSITIONS_AUTORISEES[from];
  if (!transitions) {
    // Statut inconnu — permissif en Phase 1
    console.warn(`[STATE_MACHINE] ⚠️ Statut inconnu: "${from}" → "${to}" (permissif Phase 1)`);
    return { valid: true, reason: `statut_inconnu_permissif: ${from}` };
  }

  if (!transitions.includes(to)) {
    // Transition non listée — permissif en Phase 1 mais journalisé
    console.warn(`[STATE_MACHINE] ⚠️ Transition non listée: ${from} → ${to} (permissif Phase 1)`);
    return { valid: true, reason: `transition_non_listee_permissive: ${from} → ${to}` };
  }

  return { valid: true };
}

/**
 * Version stricte (Phase 2) — bloque les transitions invalides.
 * Non encore activée. Sera activée après inventaire complet des transitions production.
 */
export function validerTransitionStricte(
  from: string,
  to: string,
  context?: { source?: string; dispatch_status?: string; type_course?: string }
): { valid: boolean; reason?: string } {
  if (from === to) return { valid: true };

  if (STATUTS_TERMINAUX.includes(from)) {
    return {
      valid: false,
      reason: `transition_bloquee_terminal: ${from} est terminal`,
    };
  }

  const transitions = TRANSITIONS_AUTORISEES[from];
  if (!transitions || !transitions.includes(to)) {
    return {
      valid: false,
      reason: `transition_non_autorisee: ${from} → ${to}`,
    };
  }

  return { valid: true };
}

/**
 * Vérifie si un statut est terminal.
 */
export function estStatutTerminal(statut: string): boolean {
  return STATUTS_TERMINAUX.includes(statut);
}

/**
 * Vérifie si un statut est actif (livreur engagé).
 */
export function estStatutActif(statut: string): boolean {
  return STATUTS_ACTIFS.includes(statut);
}