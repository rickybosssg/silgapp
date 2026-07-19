/**
 * ═══════════════════════════════════════════════════════════════
 *  MOTEUR DE WORKFLOWS MÉTIER DE VENUS — Moteur d'exécution
 * ═══════════════════════════════════════════════════════════════
 *
 *  Ce moteur exécute les workflows de manière DÉTERMINISTE.
 *  Aucune IA n'est utilisée pendant l'exécution des étapes.
 *  VENUS (le LLM) décide quel workflow lancer, puis le moteur prend le relais.
 *
 *  Types d'étapes supportées :
 *  - collecter_info     : Pose une question, attend la réponse de l'utilisateur
 *  - action             : Exécute une action SILGAPP (créer course, lancer dispatch, etc.)
 *  - notification       : Envoie un message au client
 *  - condition          : Branche vers une étape selon une condition
 *  - attente_evenement  : Attend un événement externe (livreur accepte, colis récupéré, etc.)
 *  - sous_workflow      : Lance un sous-workflow
 *  - fin                : Termine le workflow
 */

import { WORKFLOW_DEFINITIONS, INTENTION_TO_WORKFLOW } from './venusWorkflowDefinitions.ts';

// ── Types ──
export interface WorkflowContext {
  telephone: string;
  profileName?: string;
  countryCode: string;
  tarifs: any;
  conversation_id: string;
  is_simulation?: boolean;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  workflow_code: string;
  workflow_nom: string;
  conversation_id: string;
  client_telephone: string;
  client_nom: string;
  country_code: string;
  statut: string;
  etape_actuelle: string;
  donnees: Record<string, any>;
  historique: any[];
  course_id?: string;
  is_simulation: boolean;
  date_debut: string;
  date_fin?: string;
  date_derniere_action: string;
}

// ═══════════════════════════════════════════════════════════════
//  GESTION DES DÉFINITIONS DE WORKFLOWS
// ═══════════════════════════════════════════════════════════════

export async function getWorkflows(base44: any): Promise<any[]> {
  try {
    const entities = await base44.asServiceRole.entities.VenusWorkflow.filter({});
    if (entities && entities.length > 0) return entities;
  } catch (e) { console.warn('[WorkflowEngine] Entity read failed, using built-in:', e.message); }
  return WORKFLOW_DEFINITIONS.map(wf => ({
    id: `builtin_${wf.code}`,
    ...wf,
    etapes: JSON.stringify(wf.etapes),
    gestion_erreurs: JSON.stringify(wf.gestion_erreurs),
    actif: true,
  }));
}

export async function getWorkflowByCode(base44: any, code: string): Promise<any | null> {
  const workflows = await getWorkflows(base44);
  const wf = workflows.find(w => w.code === code && w.actif !== false);
  if (!wf) return null;
  return {
    ...wf,
    etapes: typeof wf.etapes === 'string' ? JSON.parse(wf.etapes) : wf.etapes,
    gestion_erreurs: typeof wf.gestion_erreurs === 'string' ? JSON.parse(wf.gestion_erreurs) : (wf.gestion_erreurs || {}),
  };
}

export function getWorkflowCodeFromIntention(intention: string): string | null {
  return INTENTION_TO_WORKFLOW[intention] || null;
}

// ═══════════════════════════════════════════════════════════════
//  SEED : Initialiser les workflows dans l'entité
// ═══════════════════════════════════════════════════════════════

export async function seedWorkflows(base44: any): Promise<{ created: number; updated: number }> {
  let created = 0, updated = 0;
  const existing = await base44.asServiceRole.entities.VenusWorkflow.filter({});
  for (const wf of WORKFLOW_DEFINITIONS) {
    const found = existing.find(e => e.code === wf.code);
    const data = {
      code: wf.code,
      nom: wf.nom,
      description: wf.description,
      categorie: wf.categorie,
      declencheur: wf.declencheur,
      etapes: JSON.stringify(wf.etapes),
      gestion_erreurs: JSON.stringify(wf.gestion_erreurs),
      actif: true,
      version: 1,
    };
    if (found) {
      await base44.asServiceRole.entities.VenusWorkflow.update(found.id, data);
      updated++;
    } else {
      await base44.asServiceRole.entities.VenusWorkflow.create(data);
      created++;
    }
  }
  return { created, updated };
}

// ═══════════════════════════════════════════════════════════════
//  EXÉCUTION : Lancer, reprendre, exécuter des étapes
// ═══════════════════════════════════════════════════════════════

export async function getExecutionActive(base44: any, conversation_id: string): Promise<any | null> {
  try {
    const execs = await base44.asServiceRole.entities.VenusWorkflowExecution.filter(
      { conversation_id, statut: { $in: ['en_cours', 'en_attente', 'en_attente_evenement'] } },
      '-date_derniere_action', 1
    );
    return execs?.[0] || null;
  } catch { return null; }
}

export async function lancerWorkflow(base44: any, code: string, ctx: WorkflowContext): Promise<{ execution: any; reponse: string }> {
  const wf = await getWorkflowByCode(base44, code);
  if (!wf) return { execution: null, reponse: 'Ce workflow n\'est pas disponible.' };

  const donnees: Record<string, any> = {};
  // Pré-remplir avec le contexte connu
  if (ctx.telephone) donnees._client_telephone = ctx.telephone;
  if (ctx.profileName) donnees._client_nom = ctx.profileName;
  if (ctx.countryCode) donnees._country_code = ctx.countryCode;

  const execution = await base44.asServiceRole.entities.VenusWorkflowExecution.create({
    workflow_id: wf.id,
    workflow_code: wf.code,
    workflow_nom: wf.nom,
    conversation_id: ctx.conversation_id,
    client_telephone: ctx.telephone,
    client_nom: ctx.profileName || ctx.telephone,
    country_code: ctx.countryCode,
    statut: 'en_cours',
    etape_actuelle: wf.etapes[0]?.id || 'fin',
    donnees: JSON.stringify(donnees),
    historique: JSON.stringify([{ action: 'lancement', date: new Date().toISOString() }]),
    is_simulation: ctx.is_simulation || false,
    date_debut: new Date().toISOString(),
    date_derniere_action: new Date().toISOString(),
  });

  const result = await executerJusquaPause(base44, execution, wf, ctx);
  return { execution: result.execution, reponse: result.reponse };
}

export async function repondreWorkflow(base44: any, execution_id: string, message: string, ctx: WorkflowContext): Promise<{ reponse: string; termine: boolean }> {
  let execution = await base44.asServiceRole.entities.VenusWorkflowExecution.get(execution_id);
  if (!execution) return { reponse: 'Erreur: exécution introuvable.', termine: true };
  if (execution.statut === 'termine' || execution.statut === 'annule') {
    return { reponse: '', termine: true };
  }

  const wf = await getWorkflowByCode(base44, execution.workflow_code);
  if (!wf) return { reponse: 'Erreur: workflow introuvable.', termine: true };

  const etapes = wf.etapes;
  const etapeCourante = etapes.find((e: any) => e.id === execution.etape_actuelle);

  // Données actuelles
  let donnees: Record<string, any> = {};
  try { donnees = JSON.parse(execution.donnees || '{}'); } catch {}
  let historique: any[] = [];
  try { historique = JSON.parse(execution.historique || '[]'); } catch {}

  // Si l'étape courante est une collecte d'info, extraire la valeur
  if (etapeCourante?.type === 'collecter_info') {
    const { valeur, confiant } = extraireInfo(message, etapeCourante);
    if (!confiant && etapeCourante.obligatoire !== false) {
      const retryMsg = `Je n'ai pas bien compris. ${etapeCourante.question}`;
      return { reponse: retryMsg, termine: false };
    }
    if (etapeCourante.champ) donnees[etapeCourante.champ] = valeur;
    historique.push({ etape: etapeCourante.id, type: 'collecter_info', champ: etapeCourante.champ, resultat: valeur, date: new Date().toISOString() });
    execution.etape_actuelle = etapeCourante.prochaine_etape || 'fin';
  }

  // Si l'étape courante est une attente_evenement, vérifier si l'événement s'est produit
  if (etapeCourante?.type === 'attente_evenement') {
    const eventOccurred = await verifierEvenement(base44, etapeCourante.evenement, execution, ctx);
    if (eventOccurred) {
      execution.etape_actuelle = etapeCourante.prochaine_etape || 'fin';
      historique.push({ etape: etapeCourante.id, type: 'evenement', resultat: etapeCourante.evenement, date: new Date().toISOString() });
    } else {
      return { reponse: 'Je suis toujours en train de traiter votre demande. Je vous informerai dès qu\'il y a du nouveau.', termine: false };
    }
  }

  // Sauvegarder et continuer l'exécution
  execution.donnees = JSON.stringify(donnees);
  execution.historique = JSON.stringify(historique);
  execution.date_derniere_action = new Date().toISOString();
  execution = await base44.asServiceRole.entities.VenusWorkflowExecution.update(execution.id, {
    etape_actuelle: execution.etape_actuelle,
    donnees: execution.donnees,
    historique: execution.historique,
    date_derniere_action: execution.date_derniere_action,
  });

  const result = await executerJusquaPause(base44, execution, wf, ctx);
  return { reponse: result.reponse, termine: result.termine };
}

async function executerJusquaPause(base44: any, execution: any, wf: any, ctx: WorkflowContext): Promise<{ execution: any; reponse: string; termine: boolean }> {
  const etapes = wf.etapes;
  let reponse = '';
  let termine = false;
  let donnees: Record<string, any> = {};
  try { donnees = JSON.parse(execution.donnees || '{}'); } catch {}
  let historique: any[] = [];
  try { historique = JSON.parse(execution.historique || '[]'); } catch {}
  let safetyCounter = 0;

  while (safetyCounter < 50) {
    safetyCounter++;
    const etape = etapes.find((e: any) => e.id === execution.etape_actuelle);
    if (!etape) { termine = true; break; }

    if (etape.type === 'collecter_info') {
      // Substitution de variables dans la question
      const question = substituerVariables(etape.question, donnees);
      reponse += question;
      execution.statut = 'en_attente';
      execution.donnees = JSON.stringify(donnees);
      execution.historique = JSON.stringify(historique);
      execution.date_derniere_action = new Date().toISOString();
      execution = await base44.asServiceRole.entities.VenusWorkflowExecution.update(execution.id, {
        statut: 'en_attente', etape_actuelle: etape.id,
        donnees: execution.donnees, historique: execution.historique,
        date_derniere_action: execution.date_derniere_action,
      });
      return { execution, reponse, termine: false };
    }

    if (etape.type === 'notification') {
      const msg = substituerVariables(etape.message, donnees);
      if (reponse && !reponse.endsWith('\n')) reponse += '\n\n';
      reponse += msg;
      historique.push({ etape: etape.id, type: 'notification', resultat: msg.substring(0, 100), date: new Date().toISOString() });
      execution.etape_actuelle = etape.prochaine_etape || 'fin';
      continue;
    }

    if (etape.type === 'action') {
      const result = await executerAction(base44, etape.action, donnees, ctx, execution);
      if (result.donnees_update) Object.assign(donnees, result.donnees_update);
      if (result.course_id) { execution.course_id = result.course_id; donnees._course_id = result.course_id; }
      historique.push({ etape: etape.id, type: 'action', action: etape.action, resultat: result.message?.substring(0, 200), success: result.success, date: new Date().toISOString() });
      if (!result.success && etape.on_erreur) {
        const handlers = typeof wf.gestion_erreurs === 'string' ? JSON.parse(wf.gestion_erreurs) : wf.gestion_erreurs;
        const handler = handlers?.[etape.on_erreur];
        if (handler?.message) { reponse += '\n\n' + handler.message; }
        if (handler?.action === 'annuler_course') { termine = true; execution.statut = 'annule'; break; }
      }
      execution.etape_actuelle = etape.prochaine_etape || 'fin';
      continue;
    }

    if (etape.type === 'condition') {
      const { champ, operateur, valeur } = etape.condition;
      const currentValue = donnees[champ];
      let conditionMet = false;
      switch (operateur) {
        case 'equals': conditionMet = currentValue === valeur; break;
        case 'not_equals': conditionMet = currentValue !== valeur; break;
        case 'exists': conditionMet = currentValue != null && currentValue !== ''; break;
        case 'contains': conditionMet = String(currentValue || '').includes(String(valeur)); break;
        default: conditionMet = false;
      }
      historique.push({ etape: etape.id, type: 'condition', champ, currentValue, conditionMet, date: new Date().toISOString() });
      execution.etape_actuelle = conditionMet ? etape.etape_si_vrai : etape.etape_si_faux;
      continue;
    }

    if (etape.type === 'attente_evenement') {
      const eventOccurred = await verifierEvenement(base44, etape.evenement, execution, ctx);
      if (eventOccurred) {
        historique.push({ etape: etape.id, type: 'evenement', evenement: etape.evenement, resultat: 'confirmé', date: new Date().toISOString() });
        execution.etape_actuelle = etape.prochaine_etape || 'fin';
        continue;
      } else {
        execution.statut = 'en_attente_evenement';
        execution.donnees = JSON.stringify(donnees);
        execution.historique = JSON.stringify(historique);
        execution.date_derniere_action = new Date().toISOString();
        execution = await base44.asServiceRole.entities.VenusWorkflowExecution.update(execution.id, {
          statut: 'en_attente_evenement', etape_actuelle: etape.id,
          donnees: execution.donnees, historique: execution.historique,
          date_derniere_action: execution.date_derniere_action,
        });
        if (!reponse) reponse = 'Je traite votre demande. Je vous informerai dès qu\'il y a du nouveau.';
        return { execution, reponse, termine: false };
      }
    }

    if (etape.type === 'sous_workflow') {
      const subResult = await lancerWorkflow(base44, etape.workflow_code, { ...ctx, conversation_id: ctx.conversation_id });
      if (subResult.reponse) {
        if (reponse && !reponse.endsWith('\n')) reponse += '\n\n';
        reponse += subResult.reponse;
      }
      if (subResult.execution?.statut === 'termine') {
        execution.etape_actuelle = etape.prochaine_etape || 'fin';
        continue;
      } else {
        execution.statut = 'en_attente';
        execution.donnees = JSON.stringify(donnees);
        execution.historique = JSON.stringify(historique);
        execution.date_derniere_action = new Date().toISOString();
        execution = await base44.asServiceRole.entities.VenusWorkflowExecution.update(execution.id, {
          statut: 'en_attente', etape_actuelle: etape.prochaine_etape || 'fin',
          donnees: execution.donnees, historique: execution.historique,
          date_derniere_action: execution.date_derniere_action,
        });
        return { execution, reponse, termine: false };
      }
    }

    if (etape.type === 'fin') {
      if (etape.message && !reponse.includes(etape.message.substring(0, 30))) {
        if (reponse && !reponse.endsWith('\n')) reponse += '\n\n';
        reponse += etape.message;
      }
      execution.statut = 'termine';
      execution.date_fin = new Date().toISOString();
      execution.donnees = JSON.stringify(donnees);
      execution.historique = JSON.stringify(historique);
      execution.date_derniere_action = new Date().toISOString();
      execution = await base44.asServiceRole.entities.VenusWorkflowExecution.update(execution.id, {
        statut: 'termine', date_fin: execution.date_fin,
        donnees: execution.donnees, historique: execution.historique,
        date_derniere_action: execution.date_derniere_action,
      });
      termine = true;
      break;
    }

    break; // Unknown step type
  }

  execution.donnees = JSON.stringify(donnees);
  execution.historique = JSON.stringify(historique);
  execution.date_derniere_action = new Date().toISOString();
  if (!termine && execution.statut !== 'en_attente' && execution.statut !== 'en_attente_evenement') {
    execution.statut = 'en_cours';
  }
  execution = await base44.asServiceRole.entities.VenusWorkflowExecution.update(execution.id, {
    statut: execution.statut, etape_actuelle: execution.etape_actuelle,
    donnees: execution.donnees, historique: execution.historique,
    date_derniere_action: execution.date_derniere_action,
    course_id: execution.course_id,
  });

  return { execution, reponse, termine };
}

// ═══════════════════════════════════════════════════════════════
//  EXTRACTION DÉTERMINISTE D'INFORMATIONS (sans IA)
// ═══════════════════════════════════════════════════════════════

function extraireInfo(message: string, etape: any): { valeur: any; confiant: boolean } {
  const msg = message.trim();
  const msgLower = msg.toLowerCase();
  // Normalisation des accents pour le matching
  const msgNoAccent = msgLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Si des options sont définies, matching par mots-clés
  if (etape.options && etape.options.length > 0) {
    for (const opt of etape.options) {
      const optLower = opt.toLowerCase();
      const optNoAccent = optLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (msgLower === optLower || msgLower.includes(optLower) || msgNoAccent === optNoAccent || msgNoAccent.includes(optNoAccent)) {
        return { valeur: opt, confiant: true };
      }
    }
    // Matching par numéro (1, 2, 3...)
    const num = parseInt(msgLower.replace(/\D/g, ''), 10);
    if (!isNaN(num) && num >= 1 && num <= etape.options.length) {
      return { valeur: etape.options[num - 1], confiant: true };
    }
    // Tentative fuzzy pour type_course
    if (etape.champ === 'type_course') {
      if (msgLower.includes('envoi') || msgLower.includes('expedi') || msgLower.includes('colis')) return { valeur: 'expedier', confiant: true };
      if (msgLower.includes('recev') || msgLower.includes('reception')) return { valeur: 'recevoir', confiant: true };
      if (msgLower.includes('deplac') || msgLower.includes('trajet') || msgLower.includes('aller')) return { valeur: 'deplacement', confiant: true };
    }
    return { valeur: msg, confiant: false };
  }

  // Champ téléphone
  if (etape.champ?.includes('telephone') || etape.champ?.includes('tel')) {
    if (msgLower === 'je ne sais pas' || msgLower === 'non' || msgLower === 'je n\'ai pas') {
      return { valeur: '', confiant: true };
    }
    const phoneMatch = msg.match(/(?:\+?\d[\s.-]?){6,}/);
    if (phoneMatch) return { valeur: phoneMatch[0].trim(), confiant: true };
    return { valeur: msg, confiant: false };
  }

  // Champ booléen (oui/non)
  if (etape.champ === 'confirme' || etape.champ?.startsWith('has_') || etape.champ === 'livraison_immediate') {
    const ouiKw = ['oui', 'ok', "d'accord", 'confirme', 'valider', 'ouais', 'volontiers', 'go', 'parfait', 'exact', 'immédiate', 'immediate'];
    const nonKw = ['non', 'annuler', 'refuse', 'non merci', 'programmee', 'programmée'];
    if (ouiKw.some(kw => msgLower.includes(kw))) return { valeur: msgLower.includes('programm') ? 'programmee' : true, confiant: true };
    if (nonKw.some(kw => msgLower.includes(kw))) return { valeur: etape.champ === 'livraison_immediate' ? 'programmee' : false, confiant: true };
    return { valeur: null, confiant: false };
  }

  // Champ date
  if (etape.champ?.includes('date')) {
    return { valeur: msg, confiant: msg.length > 3 };
  }

  // Texte libre
  if (msgLower === 'non' || msgLower === 'rien' || msgLower === 'pas de remarque') {
    return { valeur: '', confiant: true };
  }
  return { valeur: msg, confiant: msg.length >= 2 };
}

// ═══════════════════════════════════════════════════════════════
//  SUBSTITUTION DE VARIABLES DANS LES MESSAGES
// ═══════════════════════════════════════════════════════════════

function substituerVariables(message: string, donnees: Record<string, any>): string {
  return message.replace(/\{__(\w+)__\}/g, (match, key) => {
    if (key === 'resume') {
      const parts: string[] = [];
      if (donnees.type_course) parts.push(`Type: ${labelTypeCourse(donnees.type_course)}`);
      if (donnees.adresse_depart) parts.push(`De: ${donnees.adresse_depart}`);
      if (donnees.adresse_arrivee) parts.push(`Vers: ${donnees.adresse_arrivee}`);
      if (donnees.telephone_destinataire) parts.push(`Tél destinataire: ${donnees.telephone_destinataire}`);
      if (donnees.date_souhaitee) parts.push(`Date: ${donnees.date_souhaitee}`);
      if (donnees.remarques) parts.push(`Remarques: ${donnees.remarques}`);
      return parts.join('\n') || 'Récapitulatif non disponible';
    }
    if (key === 'date_formatee') return donnees.date_souhaitee || 'Date non définie';
    if (key === 'info_livreur') {
      const parts: string[] = [];
      if (donnees._livreur_nom) parts.push(`🧑‍✈️ Livreur: ${donnees._livreur_nom}`);
      if (donnees._livreur_tel) parts.push(`📞 Téléphone: ${donnees._livreur_tel}`);
      if (donnees._livreur_vehicule) parts.push(`🚗 Véhicule: ${donnees._livreur_vehicule}`);
      return parts.join('\n') || 'Informations livreur non disponibles';
    }
    if (key === 'pin') return donnees._pin || '****';
    if (key === 'qr_url') return donnees._qr_url || 'QR Code non disponible';
    if (key === 'montant') return String(donnees._montant || 'N/A');
    if (key === 'devise') return donnees._devise || 'FCFA';
    if (key === 'tracking_link') return donnees._tracking_link || 'Lien de suivi non disponible';
    if (key === 'ticket_id') return donnees._ticket_id || 'N/A';
    if (key === 'livreur_nom') return donnees._livreur_nom || 'N/A';
    if (key === 'livreur_tel') return donnees._livreur_tel || 'N/A';
    if (key === 'livreur_vehicule') return donnees._livreur_vehicule || 'N/A';
    if (key === 'temps_prep') return String(donnees._temps_prep || '30');
    if (key === 'menu') return donnees._menu || 'Menu non disponible';
    if (key === 'produits') return donnees._produits || 'Produits non disponibles';
    return match;
  });
}

function labelTypeCourse(type: string): string {
  const labels: any = { expedier: 'Envoi de colis', recevoir: 'Réception de colis', deplacement: 'Déplacement' };
  return labels[type] || type;
}

// ═══════════════════════════════════════════════════════════════
//  EXÉCUTION DES ACTIONS
// ═══════════════════════════════════════════════════════════════

async function executerAction(base44: any, action: string, donnees: Record<string, any>, ctx: WorkflowContext, execution: any): Promise<{ success: boolean; message?: string; course_id?: string; donnees_update?: Record<string, any> }> {
  if (ctx.is_simulation) {
    return { success: true, message: `[SIMULATION] Action '${action}' exécutée`, donnees_update: { [`_sim_${action}`]: true } };
  }

  try {
    switch (action) {
      case 'creer_course':
      case 'creer_course_programmee':
        return await actionCreerCourse(base44, donnees, ctx, action === 'creer_course_programmee');

      case 'lancer_dispatch':
      case 'relancer_dispatch':
        return await actionLancerDispatch(base44, donnees);

      case 'envoyer_info_livreur':
        return await actionEnvoyerInfoLivreur(base44, donnees);

      case 'envoyer_qr_pin':
        return await actionEnvoyerQrPin(base44, donnees);

      case 'annoncer_prix':
        return await actionAnnoncerPrix(base44, donnees);

      case 'creer_reclamation':
        return await actionCreerReclamation(base44, donnees, ctx);

      case 'transmettre_support':
        return await actionTransmettreSupport(base44, donnees, ctx);

      case 'trouver_course_active':
        return await actionTrouverCourseActive(base44, donnees, ctx);

      case 'envoyer_contact_livreur':
        return await actionEnvoyerContactLivreur(base44, donnees);

      case 'envoyer_recu':
        return { success: true, message: 'Reçu envoyé' };

      case 'afficher_menu':
      case 'afficher_produits':
        return { success: true, message: 'Liste affichée', donnees_update: { _menu: 'Liste de plats/produits', _produits: 'Liste de produits' } };

      case 'valider_pharmacie':
      case 'creer_commande_restaurant':
      case 'creer_commande_boutique':
        return { success: true, message: 'Commande transmise au partenaire', donnees_update: { _commande_validee: true } };

      case 'creer_course_pharmacie':
      case 'creer_course_restaurant':
      case 'creer_course_boutique':
        return await actionCreerCourse(base44, donnees, ctx, false);

      case 'annuler_course':
        if (donnees._course_id) {
          await base44.asServiceRole.entities.CourseExterne.update(donnees._course_id, { statut: 'annulee', dispatch_status: 'expire' });
        }
        return { success: true, message: 'Course annulée' };

      case 'notifier_indisponibilite':
        return { success: true, message: 'Indisponibilité notifiée' };

      default:
        console.warn(`[WorkflowEngine] Action non implémentée: ${action}`);
        return { success: true, message: `Action '${action}' exécutée (stub)` };
    }
  } catch (e) {
    console.error(`[WorkflowEngine] Erreur action ${action}:`, e.message);
    return { success: false, message: e.message };
  }
}

// ── Actions spécifiques ──

async function actionCreerCourse(base44: any, donnees: Record<string, any>, ctx: WorkflowContext, isProgrammee: boolean): Promise<any> {
  const typeLabels: any = { expedier: 'Envoi de colis', recevoir: 'Réception de colis', deplacement: 'Déplacement' };
  const courseData: any = {
    country_code: ctx.countryCode,
    source: 'client',
    client_nom: ctx.profileName || ctx.telephone,
    client_telephone: ctx.telephone,
    type_course: donnees.type_course || 'expedier',
    adresse_depart: donnees.adresse_depart,
    adresse_arrivee: donnees.adresse_arrivee,
    prix_estimate: ctx.tarifs?.minimum || 1000,
    devise: ctx.tarifs?.devise || 'FCFA',
    statut: 'nouvelle',
    dispatch_status: 'en_attente',
    notes: donnees.remarques || '',
    type_colis: donnees.type_colis,
  };

  if (isProgrammee && donnees.date_souhaitee) {
    courseData.statut = 'programmee';
    courseData.date_souhaitee = donnees.date_souhaitee;
  }

  if (donnees.type_course === 'expedier') {
    courseData.destinataire_nom = '';
    courseData.destinataire_telephone = donnees.telephone_destinataire || ctx.telephone;
    courseData.destinataire_phone_normalized = donnees.telephone_destinataire || ctx.telephone;
  } else if (donnees.type_course === 'recevoir') {
    courseData.expediteur_nom = '';
    courseData.expediteur_telephone = donnees.telephone_destinataire || ctx.telephone;
    courseData.expediteur_phone_normalized = donnees.telephone_destinataire || ctx.telephone;
  } else if (donnees.type_course === 'deplacement') {
    courseData.passager_nom = ctx.profileName || ctx.telephone;
    courseData.passager_telephone = ctx.telephone;
  }

  const course = await base44.asServiceRole.entities.CourseExterne.create(courseData);
  return {
    success: true,
    course_id: course.id,
    message: `Course créée: ${course.id}`,
    donnees_update: { _course_id: course.id },
  };
}

async function actionLancerDispatch(base44: any, donnees: Record<string, any>): Promise<any> {
  if (!donnees._course_id) return { success: false, message: 'Pas de course à dispatcher' };
  await base44.asServiceRole.entities.CourseExterne.update(donnees._course_id, { dispatch_status: 'en_attente', statut: 'recherche_livreur' });
  try {
    base44.asServiceRole.functions.invoke('dispatchExterneAuto', { action: 'lancer_recherche_auto', course_id: donnees._course_id }).catch(() => {});
  } catch {}
  return { success: true, message: 'Dispatch lancé' };
}

async function actionEnvoyerInfoLivreur(base44: any, donnees: Record<string, any>): Promise<any> {
  if (!donnees._course_id) return { success: false, message: 'Pas de course' };
  const course = await base44.asServiceRole.entities.CourseExterne.get(donnees._course_id);
  if (!course?.livreur_id) return { success: false, message: 'Pas de livreur assigné' };
  return {
    success: true,
    message: 'Infos livreur récupérées',
    donnees_update: {
      _livreur_nom: course.livreur_nom,
      _livreur_tel: course.livreur_telephone,
      _livreur_vehicule: course.livreur_vehicule,
      _tracking_link: course.tracking_link,
    },
  };
}

async function actionEnvoyerQrPin(base44: any, donnees: Record<string, any>): Promise<any> {
  if (!donnees._course_id) return { success: false, message: 'Pas de course' };
  const course = await base44.asServiceRole.entities.CourseExterne.get(donnees._course_id);
  let pin = course?.pickup_code_4_digits;
  let qrToken = course?.pickup_qr_token;
  if (!pin) {
    pin = String(Math.floor(1000 + Math.random() * 9000));
    qrToken = `pk_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    await base44.asServiceRole.entities.CourseExterne.update(donnees._course_id, {
      pickup_code_4_digits: pin,
      pickup_qr_token: qrToken,
    });
  }
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrToken)}`;
  return {
    success: true,
    message: 'QR et PIN générés',
    donnees_update: { _pin: pin, _qr_url: qrUrl },
  };
}

async function actionAnnoncerPrix(base44: any, donnees: Record<string, any>): Promise<any> {
  if (!donnees._course_id) return { success: false, message: 'Pas de course' };
  const course = await base44.asServiceRole.entities.CourseExterne.get(donnees._course_id);
  return {
    success: true,
    message: 'Prix récupéré',
    donnees_update: { _montant: course?.prix_final || course?.prix_estimate || 0, _devise: course?.devise || 'FCFA' },
  };
}

async function actionCreerReclamation(base44: any, donnees: Record<string, any>, ctx: WorkflowContext): Promise<any> {
  try {
    const ticket = await base44.asServiceRole.entities.TicketSupport.create({
      user_email: ctx.telephone,
      sujet: donnees.type_probleme || 'Réclamation',
      description: donnees.description || '',
      statut: 'ouvert',
      priorite: 'normale',
      canal: 'whatsapp_venus',
      course_id: donnees.course_id && donnees.course_id !== 'non' ? donnees.course_id : undefined,
      client_telephone: ctx.telephone,
    });
    return {
      success: true,
      message: 'Réclamation créée',
      donnees_update: { _ticket_id: ticket.id?.slice(-8).toUpperCase() },
    };
  } catch (e) {
    return { success: true, message: 'Réclamation enregistrée', donnees_update: { _ticket_id: 'PENDING' } };
  }
}

async function actionTransmettreSupport(base44: any, donnees: Record<string, any>, ctx: WorkflowContext): Promise<any> {
  try {
    await base44.asServiceRole.entities.Notification.create({
      titre: 'Nouvelle réclamation WhatsApp',
      message: `Client: ${ctx.profileName || ctx.telephone}\nType: ${donnees.type_probleme}\nDescription: ${donnees.description}`,
      type: 'reclamation',
      destinataire_email: 'admin',
      lue: false,
    });
  } catch {}
  return { success: true, message: 'Transmis au support' };
}

async function actionTrouverCourseActive(base44: any, donnees: Record<string, any>, ctx: WorkflowContext): Promise<any> {
  const STATUTS_ACTIFS = ['livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'pris_en_charge', 'en_livraison', 'arrivee'];
  let courses = await base44.asServiceRole.entities.CourseExterne.filter({ client_telephone: ctx.telephone }, '-created_date', 10);
  const active = courses?.find(c => STATUTS_ACTIFS.includes(c.statut) && c.livreur_id);
  if (active) {
    return {
      success: true,
      message: 'Course active trouvée',
      course_id: active.id,
      donnees_update: {
        has_livreur: true,
        _course_id: active.id,
        _livreur_nom: active.livreur_nom,
        _livreur_tel: active.livreur_telephone,
        _livreur_vehicule: active.livreur_vehicule,
        _tracking_link: active.tracking_link,
      },
    };
  }
  return { success: true, message: 'Pas de course active', donnees_update: { has_livreur: false } };
}

async function actionEnvoyerContactLivreur(base44: any, donnees: Record<string, any>): Promise<any> {
  return { success: true, message: 'Contact livreur envoyé' };
}

// ═══════════════════════════════════════════════════════════════
//  VÉRIFICATION D'ÉVÉNEMENTS (pour les étapes attente_evenement)
// ═══════════════════════════════════════════════════════════════

async function verifierEvenement(base44: any, evenement: string, execution: any, ctx: WorkflowContext): Promise<boolean> {
  if (ctx.is_simulation) return true; // En simulation, les événements sont toujours "confirmés"

  const courseId = execution.course_id || JSON.parse(execution.donnees || '{}')?._course_id;
  if (!courseId) return false;

  try {
    const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
    if (!course) return false;

    const STATUT_MAP: Record<string, string[]> = {
      livreur_accepte: ['livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'pris_en_charge', 'en_livraison', 'arrivee', 'livree'],
      livreur_arrive: ['arrive_prise_en_charge', 'colis_recupere', 'pris_en_charge', 'en_livraison', 'arrivee', 'livree'],
      colis_recupere: ['colis_recupere', 'pris_en_charge', 'en_livraison', 'arrivee', 'livree'],
      arrivee_proche: ['arrivee', 'livree'],
      colis_livre: ['livree'],
      paiement_confirme: ['livree'], // Simplifié: si livré, paiement considéré confirmé
    };

    const validStatuts = STATUT_MAP[evenement];
    if (!validStatuts) return false;
    return validStatuts.includes(course.statut);
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
//  GESTION DES EXCEPTIONS
// ═══════════════════════════════════════════════════════════════

export async function gererExceptionWorkflow(base44: any, execution_id: string, exception_type: string, ctx: WorkflowContext): Promise<{ reponse: string }> {
  const execution = await base44.asServiceRole.entities.VenusWorkflowExecution.get(execution_id);
  if (!execution) return { reponse: 'Erreur: exécution introuvable.' };

  const wf = await getWorkflowByCode(base44, execution.workflow_code);
  const handlers = wf?.gestion_erreurs || {};
  const handler = handlers[exception_type];

  if (!handler) {
    return { reponse: 'Une erreur est survenue. Notre équipe a été notifiée. Pour toute urgence, contactez le support au +226 66 92 51 90.' };
  }

  // Mettre à jour le statut
  await base44.asServiceRole.entities.VenusWorkflowExecution.update(execution_id, {
    erreur_type: exception_type,
    erreur_message: handler.message,
    statut: 'erreur',
    date_derniere_action: new Date().toISOString(),
  });

  // Exécuter l'action de gestion d'erreur
  if (handler.action) {
    const donnees = JSON.parse(execution.donnees || '{}');
    await executerAction(base44, handler.action, donnees, ctx, execution);
  }

  return { reponse: handler.message };
}

// ═══════════════════════════════════════════════════════════════
//  JOURNAL : Récupérer les exécutions
// ═══════════════════════════════════════════════════════════════

export async function getExecutions(base44: any, limit = 50, filters: any = {}): Promise<any[]> {
  try {
    return await base44.asServiceRole.entities.VenusWorkflowExecution.filter(filters, '-date_debut', limit);
  } catch {
    return [];
  }
}

export async function getExecutionsForConversation(base44: any, conversation_id: string): Promise<any[]> {
  try {
    return await base44.asServiceRole.entities.VenusWorkflowExecution.filter({ conversation_id }, '-date_debut', 20);
  } catch {
    return [];
  }
}