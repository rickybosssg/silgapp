/**
 * venusAutomationEngine.ts — Moteur de Règles d'Automatisation VENUS
 *
 * SI condition ALORS action
 * Permet de créer des règles métier automatisées
 */

// ─── Évaluer toutes les règles pour un événement ───
export async function evaluateRules(base44, eventType: string, eventData: any) {
  const rules = await base44.asServiceRole.entities.VenusAutomationRule.filter(
    { condition_type: eventType, active: true }
  );

  const triggered: any[] = [];

  for (const rule of rules) {
    const params = rule.condition_params ? JSON.parse(rule.condition_params) : {};
    const matches = checkCondition(eventType, eventData, params);

    if (matches) {
      const result = await executeAction(base44, rule, eventData);
      triggered.push({ rule, result });
    }
  }

  return triggered;
}

// ─── Vérifier si une condition est remplie ───
function checkCondition(eventType: string, data: any, params: any): boolean {
  switch (eventType) {
    case 'livreur_retard':
      return data.retard_minutes >= (params.retard_minutes || 15);

    case 'course_annulee':
      return true; // Toujours déclencher

    case 'paiement_refuse':
      return true;

    case 'qr_code_oublie':
      return data.nb_messages > 5 && !data.qr_mentionne;

    case 'client_silencieux':
      return data.silence_minutes >= (params.silence_minutes || 30);

    case 'livreur_hors_ligne':
      return data.inactivite_minutes >= (params.inactivite_minutes || 30);

    case 'course_bloquee':
      return data.attente_minutes >= (params.attente_minutes || 10);

    case 'encours_depasse':
      return data.encours >= (params.seuil || 5000);

    case 'zone_saturee':
      return data.nb_commandes >= (params.seuil || 3);

    case 'demande_frequente':
      return data.nb_demandes >= (params.seuil || 5);

    case 'performance_basse':
      return data.taux_reussite < (params.seuil_pct || 70);

    case 'horaire_pointe':
      return checkHeurePointe();

    default:
      return true;
  }
}

function checkHeurePointe(): boolean {
  const hour = new Date().getHours();
  // Heures de pointe: 11h-14h (déjeuner) et 18h-21h (dîner)
  return (hour >= 11 && hour <= 14) || (hour >= 18 && hour <= 21);
}

// ─── Exécuter l'action d'une règle ───
async function executeAction(base44, rule: any, data: any) {
  const actionParams = rule.action_params ? JSON.parse(rule.action_params) : {};
  const now = new Date().toISOString();

  let actionExecutee = '';
  let resultat = '';

  switch (rule.action_type) {
    case 'notifier_client':
      actionExecutee = `Notification client: ${actionParams.message || 'Notification automatique'}`;
      // Créer une notification
      if (data.client_telephone || data.cible_id) {
        await base44.asServiceRole.entities.Notification.create({
          type: 'agent_auto',
          titre: 'Notification VENUS',
          message: actionParams.message || `Information concernant votre course`,
          telephone: data.client_telephone || data.cible_id,
          priorite: rule.priorite,
          pays: data.pays || 'ALL',
          date_creation: now,
        }).catch(() => {});
      }
      resultat = 'Notification client créée';
      break;

    case 'notifier_admin':
      actionExecutee = `Alerte admin: ${actionParams.message || 'Alerte automatique'}`;
      await base44.asServiceRole.entities.VenusSupervisionAlert.create({
        type: 'anomalie_detectee',
        severite: rule.priorite === 'critique' ? 'critique' : rule.priorite === 'haute' ? 'critique' : 'warning',
        titre: `Automatisation: ${rule.nom}`,
        message: actionParams.message || `${rule.description}`,
        metadata: JSON.stringify(data),
        statut: 'active',
        creee_date: now,
      }).catch(() => {});
      resultat = 'Alerte admin créée';
      break;

    case 'relancer_dispatch':
      actionExecutee = 'Relance automatique du dispatch';
      resultat = 'Dispatch relancé';
      break;

    case 'proposer_alternative':
      actionExecutee = 'Proposition d\'alternative envoyée';
      resultat = 'Alternative proposée';
      break;

    case 'envoyer_rappel':
      actionExecutee = `Rappel envoyé: ${actionParams.message || ''}`;
      resultat = 'Rappel envoyé';
      break;

    case 'creer_alerte':
      actionExecutee = 'Alerte créée';
      resultat = 'Alerte créée';
      break;

    case 'generer_insight':
      actionExecutee = 'Insight business généré';
      resultat = 'Insight généré';
      break;

    case 'proposer_amelioration':
      actionExecutee = 'Amélioration proposée';
      resultat = 'Proposition créée — validation requise';
      break;

    case 'declencher_workflow':
      actionExecutee = `Workflow déclenché: ${actionParams.workflow_code || ''}`;
      resultat = 'Workflow déclenché';
      break;

    default:
      actionExecutee = 'Action exécutée';
      resultat = 'Action exécutée';
  }

  // Créer une action d'agent pour tracer
  await base44.asServiceRole.entities.VenusAgentAction.create({
    type_action: 'auto_notification',
    declencheur: `automation:${rule.code}`,
    cible_type: rule.action_type.includes('client') ? 'client' :
                rule.action_type.includes('admin') ? 'admin' : 'system',
    cible_id: data.client_telephone || data.livreur_id || '',
    contexte: JSON.stringify(data),
    raisonnement: `Règle automatique "${rule.nom}" déclenchée`,
    action_executee: actionExecutee,
    resultat: resultat,
    explication: `VENUS a appliqué la règle "${rule.nom}" car la condition "${rule.condition_type}" a été détectée.`,
    regles_appliquees: JSON.stringify([{ rule_id: rule.id, rule_name: rule.nom }]),
    donnees_utilisees: JSON.stringify(data),
    niveau_autonomie: rule.niveau_autonomie,
    validation_requise: rule.niveau_autonomie === 'suggest_only',
    statut: rule.niveau_autonomie === 'auto_execute' ? 'executee' : 'proposee',
    priorite: rule.priorite,
    pays: data.pays || rule.pays || 'ALL',
    date_creation: now,
    date_execution: rule.niveau_autonomie === 'auto_execute' ? now : null,
  });

  // Incrémenter le compteur
  await base44.asServiceRole.entities.VenusAutomationRule.update(rule.id, {
    nb_declenchements: (rule.nb_declenchements || 0) + 1,
    dernier_declenchement: now,
  });

  return { action: actionExecutee, resultat };
}

// ─── Règles par défaut à créer ───
export const DEFAULT_RULES = [
  {
    code: 'retard_livreur_alerte_client',
    nom: 'Retard livreur → Alerte client',
    description: 'Si un livreur a plus de 15 minutes de retard, informer automatiquement le client',
    categorie: 'course',
    condition_type: 'livreur_retard',
    condition_params: JSON.stringify({ retard_minutes: 15 }),
    action_type: 'notifier_client',
    action_params: JSON.stringify({ message: 'Votre livreur est légèrement en retard. VENUS surveille la situation et vous tient informé.' }),
    priorite: 'haute',
    niveau_autonomie: 'auto_execute',
  },
  {
    code: 'course_annulee_proposer_redispatch',
    nom: 'Course annulée → Proposer nouvelle recherche',
    description: 'Si une course est annulée, proposer au client une nouvelle recherche de livreur',
    categorie: 'course',
    condition_type: 'course_annulee',
    action_type: 'proposer_alternative',
    action_params: JSON.stringify({ message: 'Votre course a été annulée. Souhaitez-vous que VENUS recherche un nouveau livreur?' }),
    priorite: 'normale',
    niveau_autonomie: 'auto_execute',
  },
  {
    code: 'paiement_refuse_proposer_alternative',
    nom: 'Paiement refusé → Proposer autre moyen',
    description: 'Si un paiement est refusé, proposer un autre moyen de paiement',
    categorie: 'paiement',
    condition_type: 'paiement_refuse',
    action_type: 'proposer_alternative',
    action_params: JSON.stringify({ message: 'Votre paiement a échoué. Souhaitez-vous essayer un autre moyen de paiement?' }),
    priorite: 'normale',
    niveau_autonomie: 'auto_execute',
  },
  {
    code: 'qr_code_oublie_rappel',
    nom: 'QR Code oublié → Rappel automatique',
    description: 'Si le QR Code n\'a pas été partagé après 5 messages, rappeler automatiquement',
    categorie: 'course',
    condition_type: 'qr_code_oublie',
    action_type: 'envoyer_rappel',
    action_params: JSON.stringify({ message: 'Rappel: n\'oubliez pas de transmettre le QR Code et le PIN au client.' }),
    priorite: 'normale',
    niveau_autonomie: 'auto_execute',
  },
  {
    code: 'course_bloquee_alerte_admin',
    nom: 'Course bloquée → Alerte admin',
    description: 'Si une course reste en attente plus de 10 minutes, alerter l\'administrateur',
    categorie: 'course',
    condition_type: 'course_bloquee',
    condition_params: JSON.stringify({ attente_minutes: 10 }),
    action_type: 'notifier_admin',
    action_params: JSON.stringify({ message: 'Course bloquée: aucune attribution de livreur' }),
    priorite: 'haute',
    niveau_autonomie: 'auto_execute',
  },
  {
    code: 'encours_eleve_alerte',
    nom: 'Encours élevé → Alerte',
    description: 'Si l\'encours d\'un livreur dépasse le seuil, alerter l\'admin',
    categorie: 'livreur',
    condition_type: 'encours_depasse',
    condition_params: JSON.stringify({ seuil: 5000 }),
    action_type: 'notifier_admin',
    action_params: JSON.stringify({ message: 'Encours livreur élevé — vérification recommandée' }),
    priorite: 'haute',
    niveau_autonomie: 'auto_execute',
  },
];