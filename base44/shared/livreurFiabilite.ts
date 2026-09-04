/**
 * ═══════════════════════════════════════════════════════════════════════
 * LIVREUR FIABILITÉ ENGINE — Source de vérité unique
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Calcule le Score SILGAPP (0-100) et le taux d'annulation d'un livreur
 * sur 30 jours glissants. Utilisé par l'Admin ET le livreur — jamais
 * de formule différente.
 *
 * ⚠️ DIAGNOSTIQUE UNIQUEMENT — ne modifie ni Dispatch V2, ni priorité,
 *    ni éligibilité, ni commission, ni rémunération, ni blocage.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * MOTIFS D'ANNULATION — IMPUTABILITÉ
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Motifs NON imputables au livreur (ne pénalisent PAS le score):
 *   - client_injoignable
 *   - client_change_avis
 *   - mauvaise_adresse
 *   - colis_inexistant
 *   - colis_pas_pret
 *
 * Motifs IMPUTABLES au livreur (pénalisent le score):
 *   - panne_vehicule
 *   - batterie_dechargee
 *   - course_trop_loin
 *   - autre_course_conflit_planning
 *   - probleme_personnel
 *   - acceptation_erreur
 *   - accident
 *
 * Motif NEUTRE (ne pénalise pas sans motif_detail exploitable):
 *   - autre
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FORMULE DU SCORE (100 points)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 1. Courses terminées sans annulation imputable (50 pts)
 *    = livrées / (livrées + annulations_imputables) × 50
 *
 * 2. Respect de l'engagement après acceptation (20 pts)
 *    = (acceptées - annulations_imputables) / acceptées × 20
 *
 * 3. Bonne exécution des courses prises en charge (15 pts)
 *    = livrées / acceptées × 15
 *
 * 4. Activité récente / représentativité (15 pts)
 *    = min(1, courses_analysées / 20) × 15
 *    (20 courses = score complet; moins de 5 = "Score provisoire")
 *
 * Niveaux:
 *   90-100: Excellent
 *   75-89:  Fiable
 *   60-74:  À améliorer
 *   0-59:   À surveiller
 *
 * Si courses_analysées < 5: "Score provisoire" (affiché mais non définitif)
 * ═══════════════════════════════════════════════════════════════════════
 */

// ── Motifs imputables au livreur ──
export const MOTIFS_IMPUTABLES = new Set([
  "panne_vehicule",
  "batterie_dechargee",
  "course_trop_loin",
  "autre_course_conflit_planning",
  "probleme_personnel",
  "acceptation_erreur",
  "accident",
]);

// ── Motifs non imputables (problème client/externe) ──
export const MOTIFS_NON_IMPUTABLES = new Set([
  "client_injoignable",
  "client_change_avis",
  "mauvaise_adresse",
  "colis_inexistant",
  "colis_pas_pret",
]);

// ── Anciens motifs compatibilité (mappés vers nouveaux) ──
const MOTIF_COMPAT_MAP: Record<string, string> = {
  "désaccord_prix": "prix_insuffisant",
  "colis_interdit": "colis_inexistant",
};

export function normalizeMotif(motif: string): string {
  if (!motif) return "autre";
  return MOTIF_COMPAT_MAP[motif] || motif;
}

export function isMotifImputable(motif: string, motifDetail?: string): boolean {
  const m = normalizeMotif(motif);
  if (MOTIFS_IMPUTABLES.has(m)) return true;
  // "autre" n'est imputable que si motif_detail est exploitable
  if (m === "autre" && motifDetail && motifDetail.trim().length >= 5) return false; // Neutre par défaut
  return false;
}

export function isMotifNonImputable(motif: string): boolean {
  return MOTIFS_NON_IMPUTABLES.has(normalizeMotif(motif));
}

export interface FiabiliteResult {
  score: number;
  niveau: "excellent" | "fiable" | "a_ameliorer" | "a_surveiller";
  niveau_label: string;
  is_provisoire: boolean;
  provisoire_reason: string;
  courses_analysees: number;
  courses_livrees: number;
  courses_acceptees: number;
  annulations_imputables: number;
  annulations_non_imputables: number;
  annulations_neutres: number;
  taux_annulation_pct: number;
  breakdown: {
    courses_terminees: { score: number; max: number; detail: string };
    respect_engagement: { score: number; max: number; detail: string };
    bonne_execution: { score: number; max: number; detail: string };
    activite_recente: { score: number; max: number; detail: string };
  };
}

export function getNiveau(score: number): FiabiliteResult["niveau"] {
  if (score >= 90) return "excellent";
  if (score >= 75) return "fiable";
  if (score >= 60) return "a_ameliorer";
  return "a_surveiller";
}

export function getNiveauLabel(niveau: FiabiliteResult["niveau"]): string {
  switch (niveau) {
    case "excellent": return "Excellent";
    case "fiable": return "Fiable";
    case "a_ameliorer": return "À améliorer";
    case "a_surveiller": return "À surveiller";
  }
}

/**
 * Calcule le score de fiabilité d'un livreur sur 30 jours glissants.
 *
 * @param annulations - AnnulationLivreur records des 30 derniers jours pour ce livreur
 * @param coursesAcceptees - Courses où livreur_id = ce livreur ET heure_acceptation présente (30j)
 * @param coursesLivrees - Courses livrées par ce livreur (30j)
 */
export function calculerFiabiliteLivreur(
  annulations: Array<{ motif?: string; motif_detail?: string }>,
  coursesAcceptees: Array<{ statut: string }>,
  coursesLivrees: Array<{ statut: string }>
): FiabiliteResult {
  const coursesAccepteesCount = coursesAcceptees.length;
  const coursesLivreesCount = coursesLivrees.length;

  let imputables = 0;
  let nonImputables = 0;
  let neutres = 0;

  for (const a of annulations) {
    const motif = a.motif || "autre";
    const detail = a.motif_detail || "";
    if (isMotifNonImputable(motif)) {
      nonImputables++;
    } else if (isMotifImputable(motif, detail)) {
      imputables++;
    } else {
      neutres++;
    }
  }

  const coursesAnalysees = coursesLivreesCount + imputables + nonImputables + neutres;

  // ═══════════════════════════════════════════════════════════════
  // 1. COURSES TERMINÉES SANS ANNULATION IMPUTABLE (50 pts)
  // ═══════════════════════════════════════════════════════════════
  const denom1 = coursesLivreesCount + imputables;
  let score1: number;
  let detail1: string;
  if (denom1 === 0) {
    score1 = 25; // Neutre
    detail1 = "Aucune course terminée ou annulation imputable";
  } else {
    const taux = coursesLivreesCount / denom1;
    score1 = Math.round(taux * 50);
    detail1 = `${coursesLivreesCount} livrées / ${denom1} (livrées + imputables)`;
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. RESPECT DE L'ENGAGEMENT APRÈS ACCEPTATION (20 pts)
  // ═══════════════════════════════════════════════════════════════
  let score2: number;
  let detail2: string;
  if (coursesAccepteesCount === 0) {
    score2 = 10; // Neutre
    detail2 = "Aucune course acceptée";
  } else {
    const tauxRespect = Math.max(0, (coursesAccepteesCount - imputables) / coursesAccepteesCount);
    score2 = Math.round(tauxRespect * 20);
    detail2 = `${coursesAccepteesCount - imputables}/${coursesAccepteesCount} courses honorées`;
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. BONNE EXÉCUTION DES COURSES PRISES EN CHARGE (15 pts)
  // ═══════════════════════════════════════════════════════════════
  let score3: number;
  let detail3: string;
  if (coursesAccepteesCount === 0) {
    score3 = 7.5; // Neutre
    detail3 = "Aucune course acceptée";
  } else {
    const tauxExec = coursesLivreesCount / coursesAccepteesCount;
    score3 = Math.round(tauxExec * 15);
    detail3 = `${coursesLivreesCount}/${coursesAccepteesCount} courses livrées`;
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. ACTIVITÉ RÉCENTE / REPRÉSENTATIVITÉ (15 pts)
  // ═══════════════════════════════════════════════════════════════
  let score4: number;
  let detail4: string;
  if (coursesAnalysees === 0) {
    score4 = 0;
    detail4 = "Aucune activité récente";
  } else {
    const ratio = Math.min(1, coursesAnalysees / 20);
    score4 = Math.round(ratio * 15);
    detail4 = `${coursesAnalysees} courses analysées (max 20 pour score complet)`;
  }

  // ═══════════════════════════════════════════════════════════════
  // SCORE FINAL
  // ═══════════════════════════════════════════════════════════════
  const score = Math.min(100, Math.round(score1 + score2 + score3 + score4));
  const niveau = getNiveau(score);
  const isProvisoire = coursesAnalysees < 5;
  const provisoireReason = isProvisoire
    ? `${coursesAnalysees} course(s) analysée(s) sur 30 jours — échantillon insuffisant (min 5)`
    : "";

  const tauxAnnulation = coursesAccepteesCount > 0
    ? Math.round((imputables / coursesAccepteesCount) * 100)
    : 0;

  return {
    score,
    niveau,
    niveau_label: getNiveauLabel(niveau),
    is_provisoire: isProvisoire,
    provisoire_reason: provisoireReason,
    courses_analysees: coursesAnalysees,
    courses_livrees: coursesLivreesCount,
    courses_acceptees: coursesAccepteesCount,
    annulations_imputables: imputables,
    annulations_non_imputables: nonImputables,
    annulations_neutres: neutres,
    taux_annulation_pct: tauxAnnulation,
    breakdown: {
      courses_terminees: { score: score1, max: 50, detail: detail1 },
      respect_engagement: { score: score2, max: 20, detail: detail2 },
      bonne_execution: { score: score3, max: 15, detail: detail3 },
      activite_recente: { score: score4, max: 15, detail: detail4 },
    },
  };
}

/**
 * Badge de fiabilité pour affichage admin.
 * 🟢 <10% | 🟠 10-20% | 🔴 >20%
 */
export function getFiabiliteBadge(tauxAnnulationPct: number): {
  color: string;
  bg: string;
  label: string;
  emoji: string;
} {
  if (tauxAnnulationPct < 10) {
    return { color: "text-green-700", bg: "bg-green-50 border-green-200", label: "Fiable", emoji: "🟢" };
  }
  if (tauxAnnulationPct <= 20) {
    return { color: "text-amber-700", bg: "bg-amber-50 border-amber-200", label: "Moyen", emoji: "🟠" };
  }
  return { color: "text-red-700", bg: "bg-red-50 border-red-200", label: "À surveiller", emoji: "🔴" };
}