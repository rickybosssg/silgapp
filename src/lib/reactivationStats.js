/**
 * Source de vérité unique pour les statistiques de campagne de réactivation.
 * Utilisée par : liste des campagnes, modal Résultats, comparaison A/B, groupe contrôle.
 * Aucun calcul dupliqué dans les composants frontend.
 */

/**
 * Calcule les statistiques complètes d'une campagne à partir de ses recipients.
 * @param {Array} recipients - Liste des ReactivationCampaignRecipient
 * @returns {Object} Statistiques agrégées
 */
export function computeCampaignStats(recipients = []) {
  const total = recipients.length;
  const control = recipients.filter(r => r.is_control_group).length;
  // sent = envois FCM RÉUSSIS uniquement (exclut failed, control, pending)
  const sent = recipients.filter(r => ["sent", "opened", "converted"].includes(r.status)).length;
  const failed = recipients.filter(r => r.status === "failed").length;
  const opened = recipients.filter(r => ["opened", "converted"].includes(r.status)).length;
  const courseCreated = recipients.filter(r => r.course_created_at).length;
  const courseCompleted = recipients.filter(r => r.course_completed_at).length;
  const revenue = recipients.reduce((sum, r) => sum + (r.revenue || 0), 0);
  const commission = recipients.reduce((sum, r) => sum + (r.commission || 0), 0);

  // ── Taux ──
  const sendRate = (total - control) > 0 ? Math.round((sent / (total - control)) * 100) : 0;
  const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
  const conversionRate = sent > 0 ? Math.round((courseCreated / sent) * 100) : 0;

  // ── Groupe contrôle vs campagne ──
  const controlRecipients = recipients.filter(r => r.is_control_group);
  const campaignRecipients = recipients.filter(r => !r.is_control_group);
  const controlConverted = controlRecipients.filter(r => r.course_created_at).length;
  const campaignConverted = campaignRecipients.filter(r => r.course_created_at).length;
  const controlRate = control > 0 ? (controlConverted / control * 100) : 0;
  const campaignRate = sent > 0 ? (campaignConverted / sent * 100) : 0;
  const uplift = campaignRate - controlRate;
  // Un groupe contrôle < 30 n'a pas de valeur statistique
  const controlTooSmall = control > 0 && control < 30;

  return {
    total,
    control,
    sent,
    failed,
    opened,
    courseCreated,
    courseCompleted,
    revenue,
    commission,
    promoCost: 0,
    netResult: commission,
    // Taux
    sendRate,
    openRate,
    conversionRate,
    // Groupe contrôle
    controlConverted,
    campaignConverted,
    controlRate,
    campaignRate,
    uplift,
    controlTooSmall,
  };
}

/**
 * Calcule les statistiques par variante A/B.
 * @param {Array} recipients - Liste des recipients
 * @returns {Array} Statistiques par variante
 */
export function computeABVariantStats(recipients = []) {
  const variants = Array.from(new Set(recipients.filter(r => r.ab_variant).map(r => r.ab_variant)));
  return variants.map(variant => {
    const vr = recipients.filter(r => r.ab_variant === variant);
    const stats = computeCampaignStats(vr);
    return { variant, ...stats };
  });
}

/**
 * Calcule les statistiques spécifiques au segment first_course_delivered.
 * Mesure la conversion 1re → 2e course avec comparaison groupe push vs contrôle.
 *
 * @param {Array} scenarios - Liste des ReactivationScenario avec segment='first_course_delivered'
 * @returns {Object} Statistiques first_course
 */
export function computeFirstCourseStats(scenarios = []) {
  const firstCourseScenarios = scenarios.filter(s => s.segment === 'first_course_delivered');
  const total = firstCourseScenarios.length;
  const control = firstCourseScenarios.filter(s => s.is_control_group).length;
  const pushGroup = firstCourseScenarios.filter(s => !s.is_control_group);

  const converted = firstCourseScenarios.filter(s => s.status === 'converted');
  const controlConverted = converted.filter(s => s.is_control_group).length;
  const pushConverted = converted.filter(s => !s.is_control_group).length;

  const pushCount = pushGroup.length;
  const controlCount = control;

  const conversionRate = pushCount > 0 ? Math.round((pushConverted / pushCount) * 100) : 0;
  const controlRate = controlCount > 0 ? Math.round((controlConverted / controlCount) * 100) : 0;
  const uplift = conversionRate - controlRate;

  // Délai médian entre 1re course livrée et 2e course créée
  const convertedDelays = converted
    .filter(s => s.reference_date && s.converted_at)
    .map(s => {
      const ref = new Date(s.reference_date).getTime();
      const conv = new Date(s.converted_at).getTime();
      return Math.max(0, (conv - ref) / 86400000); // en jours
    });
  const medianDelay = convertedDelays.length > 0
    ? convertedDelays.sort((a, b) => a - b)[Math.floor(convertedDelays.length / 2)]
    : null;

  // Conversion par étape (J+1, J+3, J+7)
  const j1Converted = converted.filter(s => s.j0_sent_at && (!s.j2_sent_at || s.converted_at <= s.j2_sent_at)).length;
  const j3Converted = converted.filter(s => s.j2_sent_at && (!s.j5_sent_at || s.converted_at <= s.j5_sent_at)).length;
  const j7Converted = converted.filter(s => s.j5_sent_at).length;

  return {
    total,
    control: controlCount,
    push: pushCount,
    converted: converted.length,
    controlConverted,
    pushConverted,
    conversionRate,
    controlRate,
    uplift,
    medianDelayDays: medianDelay !== null ? Math.round(medianDelay * 10) / 10 : null,
    j1Converted,
    j3Converted,
    j7Converted,
    controlTooSmall: controlCount > 0 && controlCount < 30,
  };
}