/**
 * ═══════════════════════════════════════════════════════════════════
 * MOTEUR DE SIMULATION VENUS — Mode dry-run / 0 crédit
 * ═══════════════════════════════════════════════════════════════════
 *
 * Réplique le pipeline VENUS sans AUCUNE action réelle :
 * - aucune course créée
 * - aucune notification envoyée
 * - aucun message WhatsApp
 * - aucune modification de DB
 * - aucun livreur recherché
 *
 * Pipeline (toutes les étapes sont 0 crédit sauf l'étape LLM) :
 * 1. Cache mémoire
 * 2. Salutation
 * 3. Raccourci fréquent
 * 4. Règle métier directe
 * 5. Connaissance directe
 * 6. RAG heuristique (keyword matching)
 * 7. Détection d'incident
 * 8. Détection de modification
 * 9. Détection d'intention (course, annulation, suivi)
 * 10. LLM (uniquement si mode='with_llm' et aucun match heuristique)
 * ═══════════════════════════════════════════════════════════════════
 */

import {
  recupererCache,
  detecterSalutation,
  detecterRaccourciFrequent,
  detecterRegleMetierDirecte,
  detecterConnaissanceDirecte,
} from './venusCache.ts';
import { getLearningMode } from './venusOpenAIEngine.ts';
import { TARIFS_PAYS } from './venusPrompt.ts';
import { rechercherConnaissancesValidees, SEUIL_CONFIANCE } from './venusLearningEngine.ts';
import { detecterIncidentDansMessage } from './venusIncidentEngine.ts';
import { detecterIntentionModification } from './venusCourseModifierEngine.ts';

export interface SimulationResult {
  reponse: string;
  llm_used: boolean;
  llm_calls: number;
  credits_estimated: number;
  temps_ms: number;
  action_would_execute: string | null;
  pipeline_steps: { step: string; matched: boolean; details: string }[];
  sources: {
    cache_hit: boolean;
    salutation: boolean;
    raccourci: string | null;
    regles: { id: string; nom: string; priorite: string }[];
    connaissances: { id: string; titre: string; categorie: string }[];
    rag_documents: { id: string; titre: string; score: number }[];
    workflow: string | null;
    incident: { type: string; gravite: string } | null;
    modification: boolean;
  };
  intention: string | null;
  confiance: number;
  mode: string;
  dry_run: true;
}

export async function simulerMessage(base44: any, opts: {
  message: string;
  telephone: string;
  country_code: string;
  memoire_courte?: any;
  mode?: 'zero_credit' | 'with_llm';
  contenu_prompt?: string;
}): Promise<SimulationResult> {
  const startTime = Date.now();
  const mode = opts.mode || 'zero_credit';
  const message = opts.message || '';
  const telephone = opts.telephone || '+22670000000';
  const countryCode = opts.country_code || 'BF';
  const memoireCourte = opts.memoire_courte || {};

  const pipeline_steps: { step: string; matched: boolean; details: string }[] = [];
  let llm_calls = 0;
  let credits = 0;
  let reponse = '';
  let action: string | null = null;
  let intention: string | null = null;
  let confiance = 0;

  const sources = {
    cache_hit: false,
    salutation: false,
    raccourci: null as string | null,
    regles: [] as any[],
    connaissances: [] as any[],
    rag_documents: [] as any[],
    workflow: null as string | null,
    incident: null as any,
    modification: false,
  };

  function finalize(): SimulationResult {
    if (!reponse) {
      reponse = "Je n'ai pas compris votre demande. Pouvez-vous reformuler ?";
      action = 'clarifier';
      intention = 'message_hors_contexte';
      confiance = 30;
    }
    return {
      reponse,
      llm_used: llm_calls > 0,
      llm_calls,
      credits_estimated: credits,
      temps_ms: Date.now() - startTime,
      action_would_execute: action,
      pipeline_steps,
      sources,
      intention,
      confiance,
      mode,
      dry_run: true,
    };
  }

  // ── Step 1: Cache mémoire (0 crédit) ──
  const cached = recupererCache(telephone, message, memoireCourte);
  pipeline_steps.push({
    step: 'Cache mémoire',
    matched: !!cached,
    details: cached ? 'Réponse trouvée en cache' : 'Pas de cache',
  });
  if (cached) {
    sources.cache_hit = true;
    reponse = cached.reponse || '';
    action = cached.action || 'repondre_info';
    intention = cached.intention || null;
    confiance = cached.confiance || 100;
    return finalize();
  }

  // ── Step 2: Salutation (0 crédit) ──
  const salut = detecterSalutation(message);
  pipeline_steps.push({
    step: 'Salutation',
    matched: !!salut,
    details: salut ? 'Salutation détectée' : 'Pas une salutation',
  });
  if (salut) {
    sources.salutation = true;
    reponse = salut.reponse;
    action = 'saluer';
    intention = 'salutation';
    confiance = 100;
    return finalize();
  }

  // ── Step 3: Raccourci fréquent (0 crédit) ──
  const raccourci = detecterRaccourciFrequent(message);
  pipeline_steps.push({
    step: 'Raccourci fréquent',
    matched: !!raccourci,
    details: raccourci ? (raccourci.outils_utilises?.[0] || 'match') : 'Aucun raccourci',
  });
  if (raccourci) {
    sources.raccourci = raccourci.outils_utilises?.[0] || 'heuristic';
    reponse = raccourci.reponse;
    action = raccourci.action;
    intention = raccourci.intention;
    confiance = raccourci.confiance;
    return finalize();
  }

  // ── Step 4: Charger règles & connaissances depuis la DB (0 crédit) ──
  const [regles, connaissances] = await Promise.all([
    base44.asServiceRole.entities.VenusBusinessRule.filter({ statut: 'valide' }, '-created_date', 50).catch(() => []),
    base44.asServiceRole.entities.VenusKnowledge.filter({ statut: 'valide' }, '-updated_date', 100).catch(() => []),
  ]);
  const reglesFiltered = (regles || []).filter((r: any) => r.pays === 'ALL' || r.pays === countryCode);
  const connaissancesFiltered = (connaissances || []).filter((k: any) => !k.pays || k.pays === 'ALL' || k.pays === countryCode);

  // ── MODE APPRENTISSAGE: En mode gpt_principal, GPT analyse TOUS les messages ──
  // Les bypass agressifs (règle métier directe, connaissance directe) sont désactivés
  // car ils interceptent des messages complexes contenant des mots-clés de connaissance.
  const learningMode = await getLearningMode(base44);
  const skipBypassesAgressifs = learningMode === 'gpt_principal' || learningMode === 'observation';

  // ── Step 5: Règle métier directe (0 crédit) ──
  let regleMatch: any = null;
  if (!skipBypassesAgressifs) {
    regleMatch = detecterRegleMetierDirecte(message, reglesFiltered);
  }
  pipeline_steps.push({
    step: 'Règle métier directe',
    matched: !!regleMatch,
    details: skipBypassesAgressifs ? `Désactivé (mode ${learningMode})` : (regleMatch ? `Règle: ${regleMatch.business_rule_id}` : 'Aucune règle matchée'),
  });
  if (regleMatch) {
    const regle = reglesFiltered.find((r: any) => r.id === regleMatch.business_rule_id);
    sources.regles = [{ id: regleMatch.business_rule_id, nom: regle?.nom || 'Règle', priorite: regle?.priorite || 'haute' }];
    reponse = regleMatch.reponse;
    action = 'repondre_info';
    intention = 'demander_info';
    confiance = 95;
    return finalize();
  }

  // ── Step 6: Connaissance directe (0 crédit) ──
  let connMatch: any = null;
  if (!skipBypassesAgressifs) {
    connMatch = detecterConnaissanceDirecte(message, connaissancesFiltered);
  }
  pipeline_steps.push({
    step: 'Connaissance directe',
    matched: !!connMatch,
    details: skipBypassesAgressifs ? `Désactivé (mode ${learningMode})` : (connMatch ? `Connaissance: ${connMatch.knowledge_id}` : 'Aucune connaissance directe'),
  });
  if (connMatch) {
    const conn = connaissancesFiltered.find((k: any) => k.id === connMatch.knowledge_id);
    sources.connaissances = [{ id: connMatch.knowledge_id, titre: conn?.titre || 'Connaissance', categorie: conn?.categorie || 'faq' }];
    reponse = connMatch.reponse;
    action = 'repondre_info';
    intention = 'demander_info';
    confiance = 95;
    return finalize();
  }

  // ── Step 7: RAG heuristique — keyword matching (0 crédit) ──
  const msgLower = message.toLowerCase();
  const ragMatches = connaissancesFiltered.filter((k: any) => {
    const text = ((k.titre || '') + ' ' + (k.question || '') + ' ' + (k.mots_cles || '') + ' ' + (k.reponse_officielle || '')).toLowerCase();
    return msgLower.split(' ').some((w: string) => w.length > 3 && text.includes(w));
  }).slice(0, 5);
  pipeline_steps.push({
    step: 'RAG heuristique',
    matched: ragMatches.length > 0,
    details: `${ragMatches.length} document(s) matché(s)`,
  });
  if (ragMatches.length > 0) {
    sources.rag_documents = ragMatches.map((k: any) => ({ id: k.id, titre: k.titre, score: 80 }));
    if (!reponse && !skipBypassesAgressifs) {
      reponse = ragMatches[0].reponse_officielle;
      action = 'repondre_info';
      intention = 'demander_info';
      confiance = 80;
    }
  }

  // ── Step 8: Détection d'incident (0 crédit) ──
  const incident = detecterIncidentDansMessage(message);
  pipeline_steps.push({
    step: 'Détection incident',
    matched: !!incident,
    details: incident ? `${incident.type_incident} (${incident.niveau_gravite})` : 'Aucun incident',
  });
  if (incident) {
    sources.incident = { type: incident.type_incident, gravite: incident.niveau_gravite };
    action = 'escalader_incident';
    intention = 'signalement_livreur';
    confiance = 100;
    reponse = `[SIMULATION] Incident détecté: ${incident.type_incident} (gravité: ${incident.niveau_gravite}). En mode réel, l'administrateur serait notifié immédiatement et un message rassurant serait envoyé au client.`;
    return finalize();
  }

  // ── Step 9: Détection modification (0 crédit) ──
  const isModif = detecterIntentionModification(message);
  pipeline_steps.push({
    step: 'Détection modification',
    matched: isModif,
    details: isModif ? 'Intention de modification détectée' : 'Pas de modification',
  });
  if (isModif) {
    sources.modification = true;
    action = 'modifier_course';
    intention = 'modifier_info';
    confiance = 90;
    if (!reponse && !skipBypassesAgressifs) {
      reponse = "[SIMULATION] VENUS détecte une demande de modification de course. En mode réel, elle demanderait quel champ modifier et procéderait avec vérification DB.";
    }
    return finalize();
  }

  // ── Step 10: Détection d'intention de course (0 crédit) ──
  const COURSE_KW = ['envoyer', 'expedier', 'colis', 'livrer', 'recevoir', 'deplacement', 'course'];
  const ANNUL_KW = ['annuler', 'annule', 'stoppe', 'annulation'];
  const SUIVI_KW = ['ou est', 'suivi', 'statut', 'mon livreur', 'ma course', 'ou en est'];
  const isCourse = COURSE_KW.some(kw => msgLower.includes(kw));
  const isAnnul = ANNUL_KW.some(kw => msgLower.includes(kw));
  const isSuivi = SUIVI_KW.some(kw => msgLower.includes(kw));

  pipeline_steps.push({
    step: 'Détection intention',
    matched: isCourse || isAnnul || isSuivi,
    details: isAnnul ? 'annuler_course' : isSuivi ? 'suivre_course' : isCourse ? 'creer_course' : 'aucune intention claire',
  });

  if (isAnnul && !reponse && !skipBypassesAgressifs) {
    action = 'annuler_course';
    intention = 'annuler_course';
    confiance = 90;
    reponse = "[SIMULATION] VENUS détecte une demande d'annulation. En mode réel, elle annulerait la course avec vérification DB obligatoire avant confirmation.";
  } else if (isSuivi && !reponse && !skipBypassesAgressifs) {
    action = 'suivre_course';
    intention = 'suivre_course';
    confiance = 85;
    reponse = "[SIMULATION] VENUS détecte une demande de suivi. En mode réel, elle rechercherait votre course active et afficherait le statut.";
  } else if (isCourse && !reponse && !skipBypassesAgressifs) {
    action = 'creer_course';
    intention = 'creer_course';
    confiance = 70;
    reponse = "[SIMULATION] VENUS détecte une demande de création de course. En mode réel, elle collecterait les informations (départ, arrivée, type) et créerait la course après confirmation du client.";
  }

  // ── Step 11: LLM (uniquement si mode='with_llm' et aucun match heuristique) ──
  if (mode === 'with_llm' && !reponse) {
    pipeline_steps.push({
      step: 'LLM',
      matched: true,
      details: 'Appel LLM effectué (~3 crédits)',
    });
    try {
      const systemPrompt = opts.contenu_prompt || "Tu es VENUS, l'assistante SILGAPP.";
      const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `${systemPrompt}\n\n═══ MESSAGE CLIENT (SIMULATION DRY-RUN) ═══\nTéléphone: ${telephone}\nPays: ${countryCode}\nMessage: "${message}"\n\nRéponds comme VENUS. AUCUNE action réelle ne sera exécutée. Réponds en texte plain, sans markdown.`,
        model: 'automatic',
      });
      reponse = typeof llmResult === 'string' ? llmResult : (llmResult?.response || llmResult?.text || '');
      llm_calls = 1;
      credits = 3;
      action = action || 'repondre_info';
      intention = intention || 'autre';
      confiance = 75;
    } catch (e: any) {
      reponse = `Erreur LLM: ${e.message}`;
      credits = 0;
    }
  } else {
    pipeline_steps.push({
      step: 'LLM',
      matched: false,
      details: mode === 'zero_credit' ? 'Mode 0 crédit — LLM non appelé' : 'Non nécessaire (match heuristique)',
    });
  }

  return finalize();
}