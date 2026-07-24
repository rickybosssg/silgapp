/**
 * ═══════════════════════════════════════════════════════════════════
 * PIPELINE D'APPRENTISSAGE VENUS — Génération et anonymisation
 * ═══════════════════════════════════════════════════════════════════
 *
 * Ce module gère:
 * 1. L'anonymisation des données avant stockage dans le corpus d'apprentissage
 * 2. La génération d'exemples d'apprentissage après chaque conversation GPT
 * 3. Le calcul des scores de qualité, risque et doublon
 * 4. La classification automatique du type d'apprentissage
 *
 * PRINCIPE: GPT comprend et enseigne. SILGAPP valide et exécute.
 * VENUS observe et apprend. L'administrateur valide.
 * VENUS reprend progressivement la main.
 * ═══════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════
// ANONYMISATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Anonymise un texte en remplaçant les données sensibles:
 * - Numéros de téléphone → [TÉLÉPHONE]
 * - Coordonnées GPS → [COORDONNÉES]
 * - Adresses email → [EMAIL]
 * - Références de course (SG-YYYYMMDD-XXXXXX) → [RÉFÉRENCE]
 */
export function anonymiserTexte(texte: string): string {
  if (!texte) return '';
  let result = texte;
  // Numéros de téléphone (formats internationaux et locaux BF/CI)
  result = result.replace(/\+?\d{1,3}[\s.-]?\d{2,3}[\s.-]?\d{2,3}[\s.-]?\d{2,3}/g, '[TÉLÉPHONE]');
  // Coordonnées GPS (lat, lng avec décimales)
  result = result.replace(/-?\d{1,3}\.\d{4,},\s*-?\d{1,3}\.\d{4,}/g, '[COORDONNÉES]');
  // Adresses email
  result = result.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[EMAIL]');
  // Références de course
  result = result.replace(/SG-\d{8}-\d{6}/g, '[RÉFÉRENCE]');
  return result;
}

/**
 * Hash un numéro de téléphone pour la déduplication sans stocker le vrai numéro.
 */
export function hasherTelephone(telephone: string): string {
  if (!telephone) return '';
  let hash = 0;
  const str = telephone.replace(/\D/g, '');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(36);
}

// ═══════════════════════════════════════════════════════════════════
// CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Détermine le type d'apprentissage basé sur l'intention et l'action.
 */
function classifierLearningType(intention: string, action: string, decisionMoteur: string): string {
  if (decisionMoteur === 'erreur') return 'error_case';
  if (intention === 'creer_course') return action === 'creer_course' ? 'tool_routing' : 'intent_example';
  if (intention === 'annuler_course' || intention === 'modifier_info' || intention === 'suivre_course') return 'tool_routing';
  if (intention === 'demander_info') return 'faq';
  if (intention === 'salutation') return 'response_template';
  if (intention === 'clarifier') return 'error_case';
  return 'intent_example';
}

// ═══════════════════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════════════════

/**
 * Calcule un score de qualité 0-100 basé sur des critères objectifs.
 * Pas uniquement l'auto-évaluation de GPT.
 */
function calculerQualityScore(r: any): number {
  let score = 50;
  if (r?.confiance >= 80) score += 15;
  if (r?.confiance >= 95) score += 5;
  if (r?.outils_utilises && r.outils_utilises.length > 0) score += 10;
  if (r?.confiance < 50) score -= 20;
  if (r?.decision_moteur === 'erreur') score -= 30;
  if (r?.decision_moteur === 'openai') score += 10; // GPT direct = meilleure qualité
  return Math.max(0, Math.min(100, score));
}

/**
 * Calcule un score de risque 0-100.
 */
function calculerRiskScore(r: any): number {
  let score = 0;
  if (r?.action === 'creer_course' || r?.action === 'annuler_course') score += 30;
  if (r?.confiance < 50) score += 20;
  if (r?.intention === 'suivre_course' && (!r?.outils_utilises || r.outils_utilises.length === 0)) score += 10;
  if (r?.decision_moteur === 'fallback_base44') score += 10;
  return Math.max(0, Math.min(100, score));
}

// ═══════════════════════════════════════════════════════════════════
// GÉNÉRATION D'EXEMPLE
// ═══════════════════════════════════════════════════════════════════

/**
 * Génère un exemple d'apprentissage après une conversation traitée par GPT.
 * Fire-and-forget: n'échoue jamais silencieusement.
 *
 * PRINCIPE: Aucune réponse de GPT n'est ajoutée directement au RAG ou aux règles.
 * L'exemple est créé avec statut 'draft' et doit être validé par un administrateur.
 */
export async function genererExempleApprentissage(
  base44: any,
  data: {
    conversation_id: string;
    telephone: string;
    message_client: string;
    reponse_envoyee: string;
    reasoningResult: any;
    model_used: string;
    tokens_total: number;
    cost_usd: number;
    country_code: string;
    profileName: string;
  }
): Promise<void> {
  try {
    const r = data.reasoningResult;
    if (!r) return;

    // Ne pas créer d'exemple pour les salutations (trop simples, pas d'apprentissage utile)
    if (r.decision_moteur === 'salutation') return;

    const learningType = classifierLearningType(r.intention, r.action, r.decision_moteur);
    const qualityScore = calculerQualityScore(r);
    const riskScore = calculerRiskScore(r);

    // Anonymiser les données sensibles
    const messageAnonymise = anonymiserTexte(data.message_client);
    const reponseAnonymisee = anonymiserTexte(data.reponse_envoyee);

    // Contexte de conversation
    let contexteStr = '';
    try {
      contexteStr = JSON.stringify(r.memoire_courte_update || {}).substring(0, 2000);
    } catch { contexteStr = ''; }

    // Entités extraites
    let entitiesStr = '';
    try {
      entitiesStr = JSON.stringify({
        intention: r.intention,
        action: r.action,
        confiance: r.confiance,
        infos_manquantes: r.infos_manquantes,
        infos_connues: r.infos_connues,
      }).substring(0, 2000);
    } catch { entitiesStr = ''; }

    // Outils appelés
    let toolsStr = '';
    try {
      toolsStr = JSON.stringify(r.outils_utilises || []).substring(0, 2000);
    } catch { toolsStr = ''; }

    // Documents RAG
    let ragStr = '';
    try {
      ragStr = JSON.stringify(r.document_sources || []).substring(0, 2000);
    } catch { ragStr = ''; }

    await base44.asServiceRole.entities.VenusLearningExample.create({
      conversation_id: data.conversation_id || '',
      customer_message: messageAnonymise.substring(0, 2000),
      conversation_context: contexteStr,
      detected_intent: r.intention || 'unknown',
      extracted_entities: entitiesStr,
      rag_documents_used: ragStr,
      tools_called: toolsStr,
      gpt_response: reponseAnonymisee.substring(0, 2000),
      final_response_sent: reponseAnonymisee.substring(0, 2000),
      outcome: r.decision_moteur === 'erreur' ? 'failure' : 'unknown',
      quality_score: qualityScore,
      risk_score: riskScore,
      learning_type: learningType,
      review_status: 'pending_review',
      model_used: data.model_used || '',
      tokens_input: r._tokens_prompt || 0,
      tokens_output: r._tokens_completion || 0,
      latency_ms: r.temps_traitement_ms || 0,
      cost_usd: data.cost_usd || 0,
      country_code: data.country_code || '',
      telephone_hash: hasherTelephone(data.telephone),
      is_anonymized: true,
      decision_moteur: r.decision_moteur || '',
    });

    console.log(`[LearningPipeline] 📝 Exemple créé: ${learningType} | qualité=${qualityScore} | risque=${riskScore} | conv=${data.conversation_id}`);
  } catch (e: any) {
    console.warn(`[LearningPipeline] Erreur génération exemple: ${e.message}`);
  }
}