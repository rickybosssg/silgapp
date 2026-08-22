/**
 * ═══════════════════════════════════════════════════════════════════════
 * SILGA SCORE ENGINE — Mode observation uniquement
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Calcule un score 0-100 pour chaque livreur à partir des données
 * opérationnelles existantes. Le score n'est PAS utilisé dans le dispatch
 * V2 — il est affiché aux administrateurs pour observation et analyse.
 * 
 * Après plusieurs semaines d'observation, on pourra vérifier si les
 * livreurs ayant les meilleurs scores sont réellement ceux qui assurent
 * les courses avec le moins de problèmes.
 * 
 * ═══════════════════════════════════════════════════════════════════════
 * FORMULE DU SCORE (100 points)
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * 1. Taux d'acceptation     (25 pts) — accepted / total_notified
 * 2. Taux de livraison       (25 pts) — delivered / accepted
 * 3. Taux d'annulation      (15 pts) — 1 - (annulations / accepted)
 * 4. Délai de réponse       (15 pts) — moyenne temps_reponse_sec
 * 5. Note moyenne clients   (10 pts) — note_moyenne / 5
 * 6. Fiabilité financière  (10 pts) — dette vs seuil
 * 
 * Niveaux:
 *   excellent: 80-100  (vert)
 *   bon:       60-79   (bleu)
 *   moyen:     40-59   (orange)
 *   faible:    0-39    (rouge)
 * ═══════════════════════════════════════════════════════════════════════
 */

export interface ScoreCategory {
  label: string;
  score: number;
  max: number;
  detail: string;
}

export interface ScoreResult {
  score: number;
  niveau: 'excellent' | 'bon' | 'moyen' | 'faible';
  breakdown: {
    taux_acceptation: ScoreCategory;
    taux_livraison: ScoreCategory;
    taux_annulation: ScoreCategory;
    delai_reponse: ScoreCategory;
    note_moyenne: ScoreCategory;
    fiabilite_financiere: ScoreCategory;
  };
  metrics: {
    total_notified: number;
    total_accepted: number;
    total_refused: number;
    total_expired: number;
    total_delivered: number;
    total_annulations: number;
    avg_response_sec: number;
    note_moyenne: number;
    nombre_avis: number;
    montant_du: number;
    bloque: boolean;
  };
}

export function getNiveau(score: number): ScoreResult['niveau'] {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'bon';
  if (score >= 40) return 'moyen';
  return 'faible';
}

export function calculerScoreLivreur(
  livreur: {
    note_moyenne?: number;
    nombre_avis?: number;
    montant_du_silga?: number;
    bloque_encours?: boolean;
    country_code?: string;
  },
  dispatchNotifs: Array<{
    statut: string;
    temps_reponse_sec?: number;
  }>,
  annulations: Array<{}>,
  coursesLivrees: Array<{ statut: string }>,
  seuilEncoursMax: number = 5000
): ScoreResult {
  // ── Métriques de base ──
  const totalNotified = dispatchNotifs.length;
  const totalAccepted = dispatchNotifs.filter(n => n.statut === 'accepte').length;
  const totalRefused = dispatchNotifs.filter(n => n.statut === 'refuse').length;
  const totalExpired = dispatchNotifs.filter(n => n.statut === 'expire').length;
  const totalDelivered = coursesLivrees.filter(c => c.statut === 'livree').length;
  const totalAnnulations = annulations.length;

  const acceptedNotifs = dispatchNotifs.filter(n => n.statut === 'accepte' && n.temps_reponse_sec != null);
  const avgResponseSec = acceptedNotifs.length > 0
    ? acceptedNotifs.reduce((sum, n) => sum + (n.temps_reponse_sec || 0), 0) / acceptedNotifs.length
    : 0;

  const noteMoyenne = livreur.note_moyenne || 0;
  const nombreAvis = livreur.nombre_avis || 0;
  const montantDu = livreur.montant_du_silga || 0;
  const bloque = livreur.bloque_encours || false;

  // ═══════════════════════════════════════════════════════════════
  // 1. TAUX D'ACCEPTATION (25 pts)
  // ═══════════════════════════════════════════════════════════════
  let tauxAcceptationScore: number;
  let tauxAcceptationDetail: string;
  if (totalNotified === 0) {
    tauxAcceptationScore = 12.5; // Neutre si pas d'historique
    tauxAcceptationDetail = 'Aucune notification de dispatch';
  } else {
    const taux = totalAccepted / totalNotified;
    tauxAcceptationScore = Math.round(taux * 25);
    tauxAcceptationDetail = `${totalAccepted}/${totalNotified} courses acceptées (${Math.round(taux * 100)}%)`;
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. TAUX DE LIVRAISON (25 pts)
  // ═══════════════════════════════════════════════════════════════
  let tauxLivraisonScore: number;
  let tauxLivraisonDetail: string;
  if (totalAccepted === 0) {
    tauxLivraisonScore = 12.5;
    tauxLivraisonDetail = 'Aucune course acceptée';
  } else {
    const taux = totalDelivered / totalAccepted;
    tauxLivraisonScore = Math.round(taux * 25);
    tauxLivraisonDetail = `${totalDelivered}/${totalAccepted} courses livrées (${Math.round(taux * 100)}%)`;
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. TAUX D'ANNULATION (15 pts)
  // ═══════════════════════════════════════════════════════════════
  let tauxAnnulationScore: number;
  let tauxAnnulationDetail: string;
  if (totalAccepted === 0) {
    tauxAnnulationScore = 15; // Pas de course = pas d'annulation
    tauxAnnulationDetail = 'Aucune course acceptée';
  } else {
    const tauxAnnul = totalAnnulations / totalAccepted;
    const tauxNonAnnule = 1 - Math.min(tauxAnnul, 1);
    tauxAnnulationScore = Math.round(tauxNonAnnule * 15);
    tauxAnnulationDetail = `${totalAnnulations} annulation(s) sur ${totalAccepted} courses (${Math.round(tauxAnnul * 100)}%)`;
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. DÉLAI DE RÉPONSE (15 pts)
  // ═══════════════════════════════════════════════════════════════
  let delaiReponseScore: number;
  let delaiReponseDetail: string;
  if (avgResponseSec === 0) {
    delaiReponseScore = 7.5; // Neutre
    delaiReponseDetail = 'Aucune donnée de délai';
  } else if (avgResponseSec <= 30) {
    delaiReponseScore = 15;
    delaiReponseDetail = `${Math.round(avgResponseSec)}s en moyenne (excellent)`;
  } else if (avgResponseSec <= 60) {
    delaiReponseScore = 12;
    delaiReponseDetail = `${Math.round(avgResponseSec)}s en moyenne (bon)`;
  } else if (avgResponseSec <= 120) {
    delaiReponseScore = 8;
    delaiReponseDetail = `${Math.round(avgResponseSec)}s en moyenne (moyen)`;
  } else if (avgResponseSec <= 300) {
    delaiReponseScore = 4;
    delaiReponseDetail = `${Math.round(avgResponseSec)}s en moyenne (lent)`;
  } else {
    delaiReponseScore = 0;
    delaiReponseDetail = `${Math.round(avgResponseSec)}s en moyenne (très lent)`;
  }

  // ═══════════════════════════════════════════════════════════════
  // 5. NOTE MOYENNE (10 pts)
  // ═══════════════════════════════════════════════════════════════
  let noteScore: number;
  let noteDetail: string;
  if (nombreAvis === 0) {
    noteScore = 5; // Neutre
    noteDetail = 'Aucun avis client';
  } else {
    noteScore = Math.round((noteMoyenne / 5) * 10);
    noteDetail = `${noteMoyenne.toFixed(1)}/5 (${nombreAvis} avis)`;
  }

  // ═══════════════════════════════════════════════════════════════
  // 6. FIABILITÉ FINANCIÈRE (10 pts)
  // ═══════════════════════════════════════════════════════════════
  let fiabiliteScore: number;
  let fiabiliteDetail: string;
  if (bloque) {
    fiabiliteScore = 0;
    fiabiliteDetail = `Bloqué (encours dépassé): ${montantDu.toLocaleString()} FCFA`;
  } else if (montantDu === 0) {
    fiabiliteScore = 10;
    fiabiliteDetail = 'Aucune dette en cours';
  } else {
    const ratio = montantDu / seuilEncoursMax;
    if (ratio >= 0.8) {
      fiabiliteScore = 3;
      fiabiliteDetail = `${montantDu.toLocaleString()} FCFA dû (${Math.round(ratio * 100)}% du seuil)`;
    } else if (ratio >= 0.5) {
      fiabiliteScore = 6;
      fiabiliteDetail = `${montantDu.toLocaleString()} FCFA dû (${Math.round(ratio * 100)}% du seuil)`;
    } else {
      fiabiliteScore = 10;
      fiabiliteDetail = `${montantDu.toLocaleString()} FCFA dû (${Math.round(ratio * 100)}% du seuil)`;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SCORE FINAL
  // ═══════════════════════════════════════════════════════════════
  const score = Math.round(
    tauxAcceptationScore + tauxLivraisonScore + tauxAnnulationScore +
    delaiReponseScore + noteScore + fiabiliteScore
  );

  return {
    score: Math.min(score, 100),
    niveau: getNiveau(score),
    breakdown: {
      taux_acceptation: { label: 'Taux d\'acceptation', score: tauxAcceptationScore, max: 25, detail: tauxAcceptationDetail },
      taux_livraison: { label: 'Taux de livraison', score: tauxLivraisonScore, max: 25, detail: tauxLivraisonDetail },
      taux_annulation: { label: 'Taux d\'annulation', score: tauxAnnulationScore, max: 15, detail: tauxAnnulationDetail },
      delai_reponse: { label: 'Délai de réponse', score: delaiReponseScore, max: 15, detail: delaiReponseDetail },
      note_moyenne: { label: 'Note moyenne', score: noteScore, max: 10, detail: noteDetail },
      fiabilite_financiere: { label: 'Fiabilité financière', score: fiabiliteScore, max: 10, detail: fiabiliteDetail },
    },
    metrics: {
      total_notified: totalNotified,
      total_accepted: totalAccepted,
      total_refused: totalRefused,
      total_expired: totalExpired,
      total_delivered: totalDelivered,
      total_annulations: totalAnnulations,
      avg_response_sec: Math.round(avgResponseSec),
      note_moyenne: noteMoyenne,
      nombre_avis: nombreAvis,
      montant_du: montantDu,
      bloque: bloque,
    },
  };
}