/**
 * Version client (frontend) du livreurFiabilite engine.
 * Importée par LivreurFiabiliteCard.jsx.
 *
 * ⚠️ DIAGNOSTIQUE UNIQUEMENT — ne modifie ni Dispatch V2, ni priorité,
 *    ni éligibilité, ni commission, ni rémunération, ni blocage.
 *
 * Formule du score (100 points):
 * 1. Courses terminées sans annulation imputable (50 pts)
 * 2. Respect de l'engagement après acceptation (20 pts)
 * 3. Bonne exécution des courses prises en charge (15 pts)
 * 4. Activité récente / représentativité (15 pts)
 */

const MOTIFS_IMPUTABLES = new Set([
  "panne_vehicule",
  "batterie_dechargee",
  "course_trop_loin",
  "autre_course_conflit_planning",
  "probleme_personnel",
  "acceptation_erreur",
  "accident",
]);

const MOTIFS_NON_IMPUTABLES = new Set([
  "client_injoignable",
  "client_change_avis",
  "mauvaise_adresse",
  "colis_inexistant",
  "colis_pas_pret",
]);

const MOTIF_COMPAT_MAP = {
  "désaccord_prix": "prix_insuffisant",
  "colis_interdit": "colis_inexistant",
};

export function normalizeMotif(motif) {
  if (!motif) return "autre";
  return MOTIF_COMPAT_MAP[motif] || motif;
}

export function isMotifImputable(motif, motifDetail) {
  const m = normalizeMotif(motif);
  if (MOTIFS_IMPUTABLES.has(m)) return true;
  if (m === "autre" && motifDetail && motifDetail.trim().length >= 5) return false;
  return false;
}

export function isMotifNonImputable(motif) {
  return MOTIFS_NON_IMPUTABLES.has(normalizeMotif(motif));
}

export function getNiveau(score) {
  if (score >= 90) return "excellent";
  if (score >= 75) return "fiable";
  if (score >= 60) return "a_ameliorer";
  return "a_surveiller";
}

export function getNiveauLabel(niveau) {
  switch (niveau) {
    case "excellent": return "Excellent";
    case "fiable": return "Fiable";
    case "a_ameliorer": return "À améliorer";
    case "a_surveiller": return "À surveiller";
    default: return "—";
  }
}

export function calculerFiabiliteLivreur(annulations, coursesAcceptees, coursesLivrees) {
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

  // 1. Courses terminées sans annulation imputable (50 pts)
  const denom1 = coursesLivreesCount + imputables;
  let score1;
  if (denom1 === 0) {
    score1 = 25;
  } else {
    score1 = Math.round((coursesLivreesCount / denom1) * 50);
  }

  // 2. Respect de l'engagement après acceptation (20 pts)
  let score2;
  if (coursesAccepteesCount === 0) {
    score2 = 10;
  } else {
    const tauxRespect = Math.max(0, (coursesAccepteesCount - imputables) / coursesAccepteesCount);
    score2 = Math.round(tauxRespect * 20);
  }

  // 3. Bonne exécution des courses prises en charge (15 pts)
  let score3;
  if (coursesAccepteesCount === 0) {
    score3 = 7.5;
  } else {
    score3 = Math.round((coursesLivreesCount / coursesAccepteesCount) * 15);
  }

  // 4. Activité récente / représentativité (15 pts)
  let score4;
  if (coursesAnalysees === 0) {
    score4 = 0;
  } else {
    score4 = Math.round(Math.min(1, coursesAnalysees / 20) * 15);
  }

  const score = Math.min(100, Math.round(score1 + score2 + score3 + score4));
  const niveau = getNiveau(score);
  const isProvisoire = coursesAnalysees < 5;

  const tauxAnnulation = coursesAccepteesCount > 0
    ? Math.round((imputables / coursesAccepteesCount) * 100)
    : 0;

  return {
    score,
    niveau,
    niveau_label: getNiveauLabel(niveau),
    is_provisoire: isProvisoire,
    provisoire_reason: isProvisoire
      ? `${coursesAnalysees} course(s) analysée(s) sur 30 jours — échantillon insuffisant (min 5)`
      : "",
    courses_analysees: coursesAnalysees,
    courses_livrees: coursesLivreesCount,
    courses_acceptees: coursesAccepteesCount,
    annulations_imputables: imputables,
    annulations_non_imputables: nonImputables,
    annulations_neutres: neutres,
    taux_annulation_pct: tauxAnnulation,
    breakdown: {
      courses_terminees: { score: score1, max: 50 },
      respect_engagement: { score: score2, max: 20 },
      bonne_execution: { score: score3, max: 15 },
      activite_recente: { score: score4, max: 15 },
    },
  };
}

export function getFiabiliteBadge(tauxAnnulationPct) {
  if (tauxAnnulationPct < 10) {
    return { color: "text-green-700", bg: "bg-green-50 border-green-200", label: "Fiable", emoji: "🟢" };
  }
  if (tauxAnnulationPct <= 20) {
    return { color: "text-amber-700", bg: "bg-amber-50 border-amber-200", label: "Moyen", emoji: "🟠" };
  }
  return { color: "text-red-700", bg: "bg-red-50 border-red-200", label: "À surveiller", emoji: "🔴" };
}