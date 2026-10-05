/**
 * ═══════════════════════════════════════════════════════════════════════
 * SILGA SCORE ENGINE — Mode observation uniquement
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Calcule un score 0-100 pour chaque livreur à partir des données
 * opérationnelles existantes. Le score n'est PAS utilisé dans le dispatch
 * V2 — il est affiché aux administrateurs pour observation et analyse.
 * 
 * Phase de calibration : on vérifie que les 6 critères et leurs poids
 * correspondent à la qualité terrain avant d'envisager une intégration.
 * 
 * ═══════════════════════════════════════════════════════════════════════
 * FORMULE DU SCORE (100 points) — NE PAS MODIFIER LES POIDS
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
 * 
 * Confiance (volume de données):
 *   faible:   < 5 data points (nouveau livreur, score peu fiable)
 *   moyenne:  5-19 data points
 *   elevee:   >= 20 data points (score fiable)
 * ═══════════════════════════════════════════════════════════════════════
 */

export interface ScoreCategory {
  label: string;
  score: number;
  max: number;
  detail: string;
}

export interface Anomaly {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface ScoreResult {
  score: number;
  niveau: 'excellent' | 'bon' | 'moyen' | 'faible';
  confiance: 'faible' | 'moyenne' | 'elevee';
  confiance_reason: string;
  data_points: number;
  anomalies: Anomaly[];
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
    avg_pickup_sec: number;
    note_moyenne: number;
    nombre_avis: number;
    montant_du: number;
    bloque: boolean;
  };
  comparison: {
    courses_terminees: number;
    taux_acceptation_pct: number;
    taux_livraison_pct: number;
    taux_annulation_pct: number;
    temps_reponse_moyen_sec: number;
    temps_recuperation_moyen_sec: number;
    note_client: number;
    nombre_avis: number;
    encours_financier: number;
    bloque: boolean;
  };
}

export function getNiveau(score: number): ScoreResult['niveau'] {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'bon';
  if (score >= 40) return 'moyen';
  return 'faible';
}

export function getConfiance(dataPoints: number): ScoreResult['confiance'] {
  if (dataPoints < 5) return 'faible';
  if (dataPoints < 20) return 'moyenne';
  return 'elevee';
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
  coursesLivrees: Array<{
    statut: string;
    heure_acceptation?: string;
    heure_prise_en_charge?: string;
  }>,
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

  // ── Temps moyen de récupération (acceptation → prise en charge) ──
  const coursesWithPickup = coursesLivrees.filter(c => c.heure_acceptation && c.heure_prise_en_charge);
  const avgPickupSec = coursesWithPickup.length > 0
    ? coursesWithPickup.reduce((sum, c) => {
        const diff = new Date(c.heure_prise_en_charge!).getTime() - new Date(c.heure_acceptation!).getTime();
        return sum + Math.max(0, diff / 1000);
      }, 0) / coursesWithPickup.length
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

  // ═══════════════════════════════════════════════════════════════
  // CONFIANCE (volume de données)
  // ═══════════════════════════════════════════════════════════════
  const dataPoints = totalNotified + totalDelivered + nombreAvis;
  const confiance = getConfiance(dataPoints);
  let confianceReason: string;
  if (confiance === 'faible') {
    confianceReason = `${dataPoints} point(s) de données (< 5) — score peu fiable, livreur potentiellement nouveau`;
  } else if (confiance === 'moyenne') {
    confianceReason = `${dataPoints} points de données (5-19) — fiabilité moyenne`;
  } else {
    confianceReason = `${dataPoints} points de données (>= 20) — score fiable`;
  }

  // ═══════════════════════════════════════════════════════════════
  // DÉTECTION D'ANOMALIES
  // ═══════════════════════════════════════════════════════════════
  const anomalies: Anomaly[] = [];
  const tauxAnnulPct = totalAccepted > 0 ? (totalAnnulations / totalAccepted) * 100 : 0;

  // 1. Score élevé mais beaucoup d'annulations
  if (score >= 60 && tauxAnnulPct > 30 && totalAccepted >= 3) {
    anomalies.push({
      type: 'HIGH_SCORE_HIGH_CANCELLATION',
      severity: 'warning',
      message: `Score élevé (${score}) mais ${Math.round(tauxAnnulPct)}% d'annulations sur ${totalAccepted} courses`,
    });
  }

  // 2. Score élevé mais délai de réponse lent
  if (score >= 60 && avgResponseSec > 120 && totalAccepted >= 2) {
    anomalies.push({
      type: 'HIGH_SCORE_SLOW_RESPONSE',
      severity: 'warning',
      message: `Score élevé (${score}) mais délai de réponse lent (${Math.round(avgResponseSec)}s en moyenne)`,
    });
  }

  // 3. Score faible uniquement par manque de données
  if (score < 40 && confiance === 'faible') {
    anomalies.push({
      type: 'LOW_SCORE_LOW_DATA',
      severity: 'info',
      message: `Score faible (${score}) probablement dû à un manque de données (${dataPoints} points) — ne pas pénaliser`,
    });
  }

  // 4. Score élevé sans aucune course livrée
  if (score >= 70 && totalDelivered === 0 && totalNotified > 0) {
    anomalies.push({
      type: 'HIGH_SCORE_NO_DELIVERIES',
      severity: 'warning',
      message: `Score élevé (${score}) mais aucune course livrée`,
    });
  }

  // 5. Score élevé mais note client faible
  if (score >= 70 && noteMoyenne > 0 && noteMoyenne < 3 && nombreAvis >= 2) {
    anomalies.push({
      type: 'HIGH_SCORE_LOW_RATING',
      severity: 'warning',
      message: `Score élevé (${score}) mais note client faible (${noteMoyenne.toFixed(1)}/5 sur ${nombreAvis} avis)`,
    });
  }

  // 6. Score faible mais dette élevée
  if (score < 50 && montantDu > seuilEncoursMax * 0.5) {
    anomalies.push({
      type: 'LOW_SCORE_HIGH_DEBT',
      severity: 'critical',
      message: `Score faible (${score}) avec encours élevé (${montantDu.toLocaleString()} FCFA, ${Math.round((montantDu / seuilEncoursMax) * 100)}% du seuil)`,
    });
  }

  // 7. Temps de récupération très long
  if (avgPickupSec > 1800 && coursesWithPickup.length >= 2) { // > 30 min
    anomalies.push({
      type: 'SLOW_PICKUP',
      severity: 'warning',
      message: `Temps de récupération long (${Math.round(avgPickupSec / 60)} min en moyenne sur ${coursesWithPickup.length} courses)`,
    });
  }

  return {
    score: Math.min(score, 100),
    niveau: getNiveau(score),
    confiance,
    confiance_reason: confianceReason,
    data_points: dataPoints,
    anomalies,
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
      avg_pickup_sec: Math.round(avgPickupSec),
      note_moyenne: noteMoyenne,
      nombre_avis: nombreAvis,
      montant_du: montantDu,
      bloque: bloque,
    },
    comparison: {
      courses_terminees: totalDelivered,
      taux_acceptation_pct: totalNotified > 0 ? Math.round((totalAccepted / totalNotified) * 100) : 0,
      taux_livraison_pct: totalAccepted > 0 ? Math.round((totalDelivered / totalAccepted) * 100) : 0,
      taux_annulation_pct: Math.round(tauxAnnulPct),
      temps_reponse_moyen_sec: Math.round(avgResponseSec),
      temps_recuperation_moyen_sec: Math.round(avgPickupSec),
      note_client: noteMoyenne,
      nombre_avis: nombreAvis,
      encours_financier: montantDu,
      bloque: bloque,
    },
  };
}