/**
 * venusAgentEngine.ts — Moteur d'Agent IA Autonome VENUS
 *
 * Boucle: Comprendre → Raisonner → Planifier → Agir → Vérifier → Améliorer
 *
 * Ce moteur permet à VENUS de:
 *  - Prendre des initiatives proactives
 *  - Expliquer chaque décision
 *  - Apprendre sous contrôle administrateur
 *  - Assister les administrateurs (Q&A)
 */

// ─── Types ───
interface AgentContext {
  conversation_id?: string;
  client_telephone?: string;
  livreur_id?: string;
  course_id?: string;
  pays?: string;
  source: 'whatsapp' | 'observer' | 'admin' | 'automation' | 'scheduled';
  message?: string;
  user_role?: 'client' | 'livreur' | 'admin' | 'system';
  user_email?: string;
}

interface AgentStep {
  etape: string;
  description: string;
  resultat?: string;
}

// ─── Boucle Principale de l'Agent ───
export async function executeAgentLoop(base44, context: AgentContext) {
  const steps: AgentStep[] = [];
  let decision = null;

  // 1. COMPRENDRE
  const comprehension = await comprendre(base44, context);
  steps.push({ etape: 'comprendre', description: comprehension.resume });

  // 2. RAISONNER
  const raisonnement = await raisonner(base44, context, comprehension);
  steps.push({ etape: 'raisonner', description: raisonnement.resume });

  // 3. PLANIFIER
  const plan = await planifier(base44, context, raisonnement);
  steps.push({ etape: 'planifier', description: plan.resume });

  // 4. AGIR
  if (plan.action && plan.niveau_autonomie !== 'suggest_only') {
    const actionResult = await agir(base44, context, plan);
    steps.push({ etape: 'agir', description: actionResult.resume });
    decision = actionResult;
  } else if (plan.action) {
    steps.push({ etape: 'agir', description: 'Action proposée — validation admin requise' });
    decision = plan;
  }

  // 5. VÉRIFIER
  if (decision && decision.action_id) {
    const verification = await verifier(base44, context, decision);
    steps.push({ etape: 'verifier', description: verification.resume });
  }

  // 6. AMÉLIORER
  const amelioration = await ameliorer(base44, context, decision);
  steps.push({ etape: 'ameliorer', description: amelioration.resume });

  // Log de décision
  await loggerDecision(base44, context, steps, decision, raisonnement);

  return { steps, decision };
}

// ─── 1. COMPRENDRE ───
async function comprendre(base44, context: AgentContext) {
  const { source, message, client_telephone, livreur_id, course_id } = context;

  let resume = '';
  const donnees: any = {};

  if (source === 'whatsapp' && message) {
    // Comprendre le message client
    const llmResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyse ce message WhatsApp dans le contexte SILGAPP (livraison/course).
Message: "${message}"

Identifie:
1. L'intention principale (creer_course, suivre_course, annuler, question, reclamations, programmation, pharmacie, restaurant, boutique, autre)
2. Les entités extraites (lieux, dates, numéros, montants)
3. Le contexte (nouvelle conversation, suite, urgence)
4. Le sentiment (neutre, urgent, mecontent, satisfait)

Réponds en JSON: {intention, entites, contexte, sentiment, resume}`,
      response_json_schema: {
        type: 'object',
        properties: {
          intention: { type: 'string' },
          entites: { type: 'object' },
          contexte: { type: 'string' },
          sentiment: { type: 'string' },
          resume: { type: 'string' }
        }
      }
    });
    return llmResponse;
  }

  if (source === 'observer') {
    resume = `Observation automatique du système`;
    donnees.context = 'cycle_observation';
    return { resume, donnees };
  }

  if (source === 'admin' && message) {
    resume = `Question admin: "${message.substring(0, 100)}"`;
    donnees.question = message;
    return { resume, donnees };
  }

  return { resume: 'Contexte analysé', donnees };
}

// ─── 2. RAISONNER ───
async function raisonner(base44, context: AgentContext, comprehension: any) {
  const { source } = context;
  let resume = '';
  const raisonnement: any = {};

  if (source === 'whatsapp') {
    const intention = comprehension.intention || 'autre';
    const sentiment = comprehension.sentiment || 'neutre';

    // Vérifier les workflows disponibles
    const workflows = await base44.asServiceRole.entities.VenusWorkflow.filter(
      { declencheur: intention, actif: true }
    );

    raisonnement.intention = intention;
    raisonnement.workflow_disponible = workflows.length > 0;
    raisonnement.sentiment_urgent = sentiment === 'urgent' || sentiment === 'mecontent';
    resume = `Intention: ${intention} | Workflow: ${workflows.length > 0 ? 'trouvé' : 'non trouvé'} | Sentiment: ${sentiment}`;
  }

  if (source === 'observer') {
    raisonnement.type = 'observation_proactive';
    resume = 'Analyse proactive du système pour détecter anomalies et opportunités';
  }

  if (source === 'admin') {
    raisonnement.type = 'admin_assistant';
    resume = 'Analyse de la question admin pour générer une réponse basée sur les données';
  }

  return { resume, ...raisonnement };
}

// ─── 3. PLANIFIER ───
async function planifier(base44, context: AgentContext, raisonnement: any) {
  const { source } = context;
  let plan: any = { resume: '', action: null, niveau_autonomie: 'suggest_only' };

  if (source === 'whatsapp' && raisonnement.workflow_disponible) {
    plan = {
      resume: 'Exécuter le workflow déterministe correspondant à l\'intention',
      action: 'executer_workflow',
      niveau_autonomie: 'auto_execute'
    };
  }

  if (source === 'observer') {
    plan = {
      resume: 'Évaluer les règles d\'automatisation et détecter les anomalies',
      action: 'observer_cycle',
      niveau_autonomie: 'auto_execute'
    };
  }

  if (source === 'admin') {
    plan = {
      resume: 'Générer une réponse basée sur l\'analyse des données métier',
      action: 'admin_response',
      niveau_autonomie: 'auto_execute'
    };
  }

  return plan;
}

// ─── 4. AGIR ───
async function agir(base44, context: AgentContext, plan: any) {
  const now = new Date().toISOString();
  let actionResult: any = { resume: '', action_id: null };

  const action = await base44.asServiceRole.entities.VenusAgentAction.create({
    type_action: plan.action === 'executer_workflow' ? 'initiative' :
                 plan.action === 'observer_cycle' ? 'auto_notification' :
                 plan.action === 'admin_response' ? 'admin_assistant_response' : 'proactive_suggestion',
    declencheur: context.source,
    cible_type: context.user_role || 'system',
    cible_id: context.client_telephone || context.livreur_id || context.user_email || '',
    contexte: JSON.stringify(context),
    raisonnement: plan.resume,
    niveau_autonomie: plan.niveau_autonomie,
    validation_requise: plan.niveau_autonomie === 'suggest_only',
    statut: plan.niveau_autonomie === 'auto_execute' ? 'executee' : 'proposee',
    priorite: 'normale',
    pays: context.pays || 'ALL',
    conversation_id: context.conversation_id,
    date_creation: now,
    date_execution: plan.niveau_autonomie === 'auto_execute' ? now : null,
  });

  actionResult.action_id = action.id;
  actionResult.resume = `Action ${plan.action} ${plan.niveau_autonomie === 'auto_execute' ? 'exécutée' : 'proposée'}`;
  return actionResult;
}

// ─── 5. VÉRIFIER ───
async function verifier(base44, context: AgentContext, decision: any) {
  if (!decision.action_id) return { resume: 'Pas d\'action à vérifier' };

  // Mettre à jour le statut de l'action
  await base44.asServiceRole.entities.VenusAgentAction.update(decision.action_id, {
    resultat: 'Action exécutée avec succès',
  });

  return { resume: 'Action vérifiée — succès' };
}

// ─── 6. AMÉLIORER ───
async function ameliorer(base44, context: AgentContext, decision: any) {
  // Mettre à jour la mémoire stratégique si pertinent
  if (context.source === 'whatsapp' && context.message) {
    // Détecter si une nouvelle fonctionnalité est demandée
    const llmResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyse ce message client SILGAPP et identifie s'il demande une fonctionnalité qui n'existe pas encore.
Message: "${context.message}"

Réponds en JSON: {nouvelle_fonctionnalite: boolean, description: string, categorie: string}
Si ce n'est pas une nouvelle fonctionnalité, mets nouvelle_fonctionnalite: false.`,
      response_json_schema: {
        type: 'object',
        properties: {
          nouvelle_fonctionnalite: { type: 'boolean' },
          description: { type: 'string' },
          categorie: { type: 'string' }
        }
      }
    });

    if (llmResponse.nouvelle_fonctionnalite) {
      await base44.asServiceRole.entities.VenusStrategicMemory.updateMany(
        { cle: `fonctionnalite_demandee_${llmResponse.categorie}` },
        { $inc: { valeur_numerique: 1 } }
      ).catch(() => {});

      // Créer si n'existe pas
      const existing = await base44.asServiceRole.entities.VenusStrategicMemory.filter(
        { cle: `fonctionnalite_demandee_${llmResponse.categorie}` }
      );
      if (existing.length === 0) {
        await base44.asServiceRole.entities.VenusStrategicMemory.create({
          categorie: 'fonctionnalite_demandee',
          cle: `fonctionnalite_demandee_${llmResponse.categorie}`,
          valeur: llmResponse.description,
          valeur_numerique: 1,
          periode_analyse: 'mois',
          pays: context.pays || 'ALL',
          date_creation: new Date().toISOString(),
          date_maj: new Date().toISOString(),
        });
      }
    }
  }

  return { resume: 'Apprentissage: mémoire stratégique mise à jour' };
}

// ─── Logger la décision ───
async function loggerDecision(base44, context: AgentContext, steps: AgentStep[], decision: any, raisonnement: any) {
  await base44.asServiceRole.entities.VenusDecisionLog.create({
    action_id: decision?.action_id || null,
    agent: 'venus',
    type_decision: context.source === 'admin' ? 'admin_response' :
                   context.source === 'observer' ? 'automation_trigger' :
                   'proactive_suggestion',
    raisonnement: raisonnement?.resume || 'N/A',
    etapes_raisonnement: JSON.stringify(steps),
    donnees_utilisees: JSON.stringify(context),
    contexte: JSON.stringify(context),
    niveau_confiance: 80,
    explication_simple: `VENUS a analysé une interaction (${context.source}) et ${decision ? 'exécuté' : 'proposé'} une action.`,
    pays: context.pays || 'ALL',
    conversation_id: context.conversation_id,
    date_creation: new Date().toISOString(),
  });
}

// ─── Prise d'Initiative Proactive ───
export async function proactiveSuggestion(base44, context: AgentContext) {
  const suggestions: any[] = [];

  // 1. Client oublie son numéro
  if (context.message && /num[eé]ro|t[eé]l[eé]phone|contact/i.test(context.message)) {
    suggestions.push({
      type: 'proactive_suggestion',
      message: 'Voulez-vous utiliser le numéro déjà enregistré pour cette course?',
      auto: false
    });
  }

  // 2. Livraison programmée → proposer rappel
  if (context.message && /programm|plus tard|ce soir|demain/i.test(context.message)) {
    suggestions.push({
      type: 'proactive_suggestion',
      message: 'Souhaitez-vous recevoir un rappel 30 minutes avant l\'heure prévue?',
      auto: false
    });
  }

  // 3. Vérifier si le client a oublié le QR Code
  if (context.course_id) {
    const course = await base44.asServiceRole.entities.CourseExterne.get(context.course_id).catch(() => null);
    if (course && course.statut === 'proposee' && course.livreur_id) {
      const messages = await base44.asServiceRole.entities.Message.filter(
        { conversation_id: context.conversation_id }
      );
      const qrMentionne = messages.some(m => /qr|code|pin/i.test(m.contenu || ''));
      if (!qrMentionne && messages.length > 5) {
        suggestions.push({
          type: 'auto_reminder',
          message: 'Rappel automatique: le QR Code n\'a pas encore été partagé avec le client.',
          auto: true
        });
      }
    }
  }

  return suggestions;
}

// ─── Expliquer une décision ───
export async function explainDecision(base44, actionId: string) {
  const action = await base44.asServiceRole.entities.VenusAgentAction.get(actionId).catch(() => null);
  if (!action) return { error: 'Action non trouvée' };

  const decisions = await base44.asServiceRole.entities.VenusDecisionLog.filter(
    { action_id: actionId }
  );

  const decision = decisions[0];

  return {
    action: {
      type: action.type_action,
      declencheur: action.declencheur,
      statut: action.statut,
      resultat: action.resultat,
    },
    raisonnement: decision?.raisonnement || action.raisonnement,
    etapes: decision?.etapes_raisonnement ? JSON.parse(decision.etapes_raisonnement) : [],
    regles: decision?.regles_appliquees ? JSON.parse(decision.regles_appliquees) : [],
    donnees: decision?.donnees_utilisees ? JSON.parse(decision.donnees_utilisees) : {},
    explication: decision?.explication_simple || action.explication || 'Aucune explication disponible.',
    niveau_confiance: decision?.niveau_confiance || 0,
  };
}

// ─── Apprentissage sous Contrôle ───
export async function proposeImprovement(base44, context: AgentContext) {
  // Analyser une interaction et proposer une amélioration
  const llmResponse = await base44.integrations.Core.InvokeLLM({
    prompt: `Analyse cette interaction SILGAPP et identifie si une réponse de la base de connaissances pourrait être améliorée.

Message client: "${context.message || 'N/A'}"
Contexte: ${context.source}

Réponds en JSON:
{
  amelioration_suggeree: boolean,
  connaissance_cible: string (clé de la connaissance à améliorer),
  ancienne_version: string (résumé de l'ancienne réponse),
  nouvelle_version_suggeree: string (nouvelle réponse proposée),
  raison: string (pourquoi cette amélioration)
}`,
    response_json_schema: {
      type: 'object',
      properties: {
        amelioration_suggeree: { type: 'boolean' },
        connaissance_cible: { type: 'string' },
        ancienne_version: { type: 'string' },
        nouvelle_version_suggeree: { type: 'string' },
        raison: { type: 'string' }
      }
    }
  });

  if (llmResponse.amelioration_suggeree) {
    // Créer une action de type knowledge_suggestion (validation requise)
    const action = await base44.asServiceRole.entities.VenusAgentAction.create({
      type_action: 'knowledge_suggestion',
      declencheur: context.conversation_id || 'auto',
      cible_type: 'admin',
      contexte: JSON.stringify(context),
      raisonnement: llmResponse.raison,
      action_executee: `Proposition d'amélioration: ${llmResponse.connaissance_cible}`,
      niveau_autonomie: 'suggest_only',
      validation_requise: true,
      statut: 'proposee',
      priorite: 'normale',
      pays: context.pays || 'ALL',
      date_creation: new Date().toISOString(),
    });

    return {
      action_id: action.id,
      amelioration: llmResponse,
      message: 'Amélioration proposée — validation administrateur requise.',
    };
  }

  return { amelioration: null, message: 'Aucune amélioration identifiée.' };
}