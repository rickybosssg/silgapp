// ═══════════════════════════════════════════════════════════════════════════
// GROWTH DECISION RULES — Règles déterministes pour l'Autopilote V1
// ═══════════════════════════════════════════════════════════════════════════
//
// RÈGLES FONDAMENTALES :
//   1. Aucun LLM — règles déterministes uniquement
//   2. Période d'observation minimale avant toute recommandation
//   3. Taille d'échantillon minimale pour juger la performance
//   4. Statut "données insuffisantes" explicite
//   5. Maximum 1 expérience ACTIVE à la fois (V1)
//
// NE MODIFIE PAS : Dispatch V2, finance livreur, tarification, paiements.
// ═══════════════════════════════════════════════════════════════════════════

// ── Catalogue V1 — dimensions testables ──
// Angles sans engagement financier ni promesse opérationnelle absolue.
export const EXPERIMENT_CATALOG = {
  targeting_geo: ['ouaga_centre', 'ouaga_periph'] as const,
  targeting_age_min: [18, 25, 35] as const,
  targeting_age_max: [25, 35, 45] as const,
  targeting_gender: ['all', 'female'] as const,
  meta_objective: ['OUTCOME_APP_PROMOTION'] as const,
  message_angle: ['rapidite', 'economie', 'sans_deplacement'] as const,
  budget_test_fcfa: 3000,
};

export const MESSAGE_ANGLE_LABELS: Record<string, string> = {
  rapidite: 'Livraison rapide',
  economie: 'Gagnez du temps',
  sans_deplacement: 'Faites livrer sans vous déplacer',
};

export const TARGETING_GEO_LABELS: Record<string, string> = {
  ouaga_centre: 'Ouagadougou centre',
  ouaga_periph: 'Ouagadougou périphérie',
};

// ── Constantes ──
export const OBSERVATION_MIN_DAYS_ZERO_CONVERSION = 7;
export const OBSERVATION_MIN_DAYS_PERFORMANCE = 14;
export const SAMPLE_MIN_FIRST_COURSES = 3;
export const CAC_UNDERPERFORMING_MULTIPLIER = 3;
export const CAC_OUTPERFORMING_MULTIPLIER = 0.5;
export const MIN_SPEND_FOR_RECOMMENDATION = 500;
export const DECISION_EXPIRY_DAYS = 7;
export const MAX_ACTIVE_EXPERIMENTS_V1 = 1;

// ── Calculer le statut de performance d'une expérience ──
export function computeExperimentStatus(experiment: any, cacTargetFcfa: number): string {
  const obsDays = experiment.observation_days || 0;
  const firstCourses = experiment.first_courses || 0;
  const spend = experiment.spend_fcfa || 0;
  const cac = experiment.cac_first_course_fcfa;

  // Données insuffisantes si période d'observation < 7 jours
  if (obsDays < OBSERVATION_MIN_DAYS_ZERO_CONVERSION) return 'donnees_insuffisantes';

  // Sous-performante si 0 conversion après 7 jours avec dépense >= 500
  if (firstCourses === 0 && spend >= MIN_SPEND_FOR_RECOMMENDATION) return 'sous_performante';

  // Données insuffisantes si < 3 conversions et < 14 jours
  if (firstCourses < SAMPLE_MIN_FIRST_COURSES && obsDays < OBSERVATION_MIN_DAYS_PERFORMANCE) {
    return 'donnees_insuffisantes';
  }

  // Évaluer le CAC si disponible
  if (cac && cacTargetFcfa > 0 && firstCourses >= 1 && obsDays >= OBSERVATION_MIN_DAYS_PERFORMANCE) {
    if (cac > cacTargetFcfa * CAC_UNDERPERFORMING_MULTIPLIER) return 'sous_performante';
    if (cac < cacTargetFcfa * CAC_OUTPERFORMING_MULTIPLIER && firstCourses >= SAMPLE_MIN_FIRST_COURSES) {
      return 'performante';
    }
  }

  return 'a_surveiller';
}

// ── Détecter les goulots à partir des expériences actives ──
export function detectBottlenecks(experiments: any[], cacTargetFcfa: number): any[] {
  const bottlenecks: any[] = [];

  for (const exp of experiments) {
    if (exp.status !== 'active') continue;

    const obsDays = exp.observation_days || 0;
    const firstCourses = exp.first_courses || 0;
    const secondCourses = exp.second_courses || 0;
    const spend = exp.spend_fcfa || 0;
    const cac = exp.cac_first_course_fcfa;
    const expName = exp.name || 'Expérience sans nom';

    // Règle 1 : 0 conversion après 7 jours avec dépense >= 500
    if (spend >= MIN_SPEND_FOR_RECOMMENDATION && firstCourses === 0 && obsDays >= OBSERVATION_MIN_DAYS_ZERO_CONVERSION) {
      bottlenecks.push({
        rule: 'experiment_zero_conversions_after_7_days',
        experiment_id: exp.id,
        experiment_name: expName,
        metrics: { spend_fcfa: spend, first_courses: firstCourses, observation_days: obsDays },
        recommendation: 'pause_experiment',
        action_payload: JSON.stringify({ experiment_id: exp.id, meta_campaign_id: exp.meta_campaign_id }),
        budget_impact: -(Math.round(spend / 30)),
        rationale: `${expName} a dépensé ${spend} FCFA avec 0 première course après ${obsDays} jour(s). Recommandation : pause.`,
      });
    }

    // Règle 2 : CAC sous-performant (CAC > 3 × objectif)
    if (cac && cacTargetFcfa > 0 && firstCourses >= 1 && obsDays >= OBSERVATION_MIN_DAYS_PERFORMANCE) {
      if (cac > cacTargetFcfa * CAC_UNDERPERFORMING_MULTIPLIER) {
        bottlenecks.push({
          rule: 'experiment_underperforming_cac',
          experiment_id: exp.id,
          experiment_name: expName,
          metrics: { cac_first_course_fcfa: cac, cac_target_fcfa: cacTargetFcfa, first_courses: firstCourses, observation_days: obsDays },
          recommendation: 'pause_experiment',
          action_payload: JSON.stringify({ experiment_id: exp.id, meta_campaign_id: exp.meta_campaign_id }),
          budget_impact: -(Math.round(spend / 30)),
          rationale: `${expName} a un CAC de ${cac} FCFA (objectif: ${cacTargetFcfa}), soit ${CAC_UNDERPERFORMING_MULTIPLIER}x l'objectif.`,
        });
      }
    }

    // Règle 4 : Pas de 2ème course après 14 jours
    if (firstCourses >= 1 && secondCourses === 0 && obsDays >= OBSERVATION_MIN_DAYS_PERFORMANCE) {
      bottlenecks.push({
        rule: 'experiment_no_second_course',
        experiment_id: exp.id,
        experiment_name: expName,
        metrics: { first_courses: firstCourses, second_courses: 0, observation_days: obsDays },
        recommendation: 'monitor',
        action_payload: JSON.stringify({ experiment_id: exp.id }),
        budget_impact: 0,
        rationale: `${expName} a ${firstCourses} première(s) course(s) mais 0 deuxième course après ${obsDays} jour(s).`,
      });
    }
  }

  return bottlenecks;
}

// ── Proposer la prochaine expérience (exploration → exploitation) ──
export function proposeNextExperiment(
  allExperiments: any[],
  cacTargetFcfa: number
): any | null {
  // Vérifier le nombre maximum d'expériences actives
  const activeCount = allExperiments.filter(e => e.status === 'active' || e.status === 'approved').length;
  if (activeCount >= MAX_ACTIVE_EXPERIMENTS_V1) return null;

  // Trouver les expériences avec sample suffisant
  const sufficientExperiments = allExperiments.filter(e => e.sample_sufficient === true);

  // Trouver la meilleure expérience (CAC le plus bas, < objectif)
  const bestExperiment = sufficientExperiments
    .filter(e => e.cac_first_course_fcfa && e.cac_first_course_fcfa < cacTargetFcfa)
    .sort((a, b) => (a.cac_first_course_fcfa || Infinity) - (b.cac_first_course_fcfa || Infinity))[0];

  if (bestExperiment) {
    // ── Phase EXPLOITATION — variante de l'expérience gagnante ──
    const currentAngle = bestExperiment.message_angle;
    const otherAngles = EXPERIMENT_CATALOG.message_angle.filter(a => a !== currentAngle);
    const nextAngle = otherAngles[0] || currentAngle;

    const genderLabel = bestExperiment.targeting_gender === 'female' ? 'Femmes' : 'Tous';
    const geoLabel = TARGETING_GEO_LABELS[bestExperiment.targeting_geo] || bestExperiment.targeting_geo;
    const letter = String.fromCharCode(65 + allExperiments.length);

    return {
      name: `Test ${letter} — ${geoLabel} ${bestExperiment.targeting_age_min}-${bestExperiment.targeting_age_max} ${genderLabel}`,
      targeting_geo: bestExperiment.targeting_geo,
      targeting_age_min: bestExperiment.targeting_age_min,
      targeting_age_max: bestExperiment.targeting_age_max,
      targeting_gender: bestExperiment.targeting_gender,
      meta_objective: bestExperiment.meta_objective || EXPERIMENT_CATALOG.meta_objective[0],
      message_angle: nextAngle,
      budget_test_fcfa: EXPERIMENT_CATALOG.budget_test_fcfa,
      rationale: `Test ${bestExperiment.name} est conforme à l'objectif (CAC ${bestExperiment.cac_first_course_fcfa} FCFA < objectif ${cacTargetFcfa}). Variante : même ciblage, angle "${MESSAGE_ANGLE_LABELS[nextAngle]}".`,
      phase: 'exploitation',
      source_experiment_id: bestExperiment.id,
    };
  }

  // ── Phase EXPLORATION — prochaine combinaison non testée ──
  const testedKeys = new Set(
    allExperiments.map(e =>
      `${e.targeting_geo}_${e.targeting_age_min}_${e.targeting_age_max}_${e.targeting_gender}_${e.message_angle}`
    )
  );

  // Ordre de priorité : ouaga_centre d'abord, 25-35 d'abord, all d'abord
  for (const geo of EXPERIMENT_CATALOG.targeting_geo) {
    for (const angle of EXPERIMENT_CATALOG.message_angle) {
      for (const gender of EXPERIMENT_CATALOG.targeting_gender) {
        const key = `${geo}_25_35_${gender}_${angle}`;
        if (!testedKeys.has(key)) {
          const letter = String.fromCharCode(65 + allExperiments.length);
          const genderLabel = gender === 'female' ? 'Femmes' : 'Tous';
          return {
            name: `Test ${letter} — ${TARGETING_GEO_LABELS[geo]} 25-35 ${genderLabel}`,
            targeting_geo: geo,
            targeting_age_min: 25,
            targeting_age_max: 35,
            targeting_gender: gender,
            meta_objective: EXPERIMENT_CATALOG.meta_objective[0],
            message_angle: angle,
            budget_test_fcfa: EXPERIMENT_CATALOG.budget_test_fcfa,
            rationale: `Phase d'exploration. Aucune expérience conforme à l'objectif. Profil client moyen SILGAPP : Ouagadougou centre 25-35 ans. Angle : "${MESSAGE_ANGLE_LABELS[angle]}".`,
            phase: 'exploration',
            source_experiment_id: null,
          };
        }
      }
    }
  }

  return null; // Toutes les combinaisons du catalogue ont été testées
}