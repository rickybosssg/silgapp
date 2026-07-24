/**
 * ═══════════════════════════════════════════════════════════════════
 * LABORATOIRE DE TEST VENUS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Simule une conversation VENUS et retourne la trace complète :
 * intention, outils appelés, sources consultées, réponse, anti-hallucination.
 *
 * Actions :
 * - run_test : Exécute un scénario de test
 * - run_batch : Exécute tous les scénarios prédéfinis
 * - list_tools : Liste les outils disponibles
 * - list_scenarios : Liste les scénarios prédéfinis
 * ═══════════════════════════════════════════════════════════════════
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  raisonnerVenusAvecOutils,
  chargerMemoireLongue,
  trouverCourseActive,
} from '../../shared/venusReasoningEngine.ts';
import { listerOutilsDisponibles } from '../../shared/venusToolsEngine.ts';

const STANDARD_SCENARIOS = [
  {
    id: 'salutation',
    nom: 'Salutation simple',
    message: 'Bonjour',
    telephone_test: '+22670000001',
    countryCode: 'BF',
    attendu: { intention: 'salutation', pas_de_prix: true, pas_de_course: true, description: 'VENUS doit répondre chaleureusement sans mentionner de prix ni de course' },
  },
  {
    id: 'demande_prix',
    nom: 'Demande de prix',
    message: 'Combien coûte une livraison ?',
    telephone_test: '+22670000002',
    countryCode: 'BF',
    attendu: { intention: 'demander_info', utilise_tarifs_officiels: true, description: 'VENUS doit utiliser les tarifs officiels du pays' },
  },
  {
    id: 'suivi_course_sans_course',
    nom: 'Suivi de course — sans course active',
    message: 'Où en est ma course ?',
    telephone_test: '+22670000003',
    countryCode: 'BF',
    attendu: { intention: 'suivre_course', outil_rechercher_course: true, repond_aucune_course: true, description: 'VENUS doit dire qu\'aucune course n\'est trouvée' },
  },
  {
    id: 'creation_course_envoi',
    nom: 'Création de course — envoi de colis',
    message: 'Je veux envoyer un colis à Tampouy',
    telephone_test: '+22670000004',
    countryCode: 'BF',
    attendu: { intention: 'creer_course', collecte_infos: true, pas_de_creation_immediate: true, description: 'VENUS doit collecter les infos manquantes' },
  },
  {
    id: 'contacter_livreur_sans_course',
    nom: 'Contacter livreur — sans course active',
    message: 'Je veux parler au livreur',
    telephone_test: '+22670000005',
    countryCode: 'BF',
    attendu: { intention: 'contacter_livreur', outil_rechercher_livreur: true, description: 'VENUS doit chercher un livreur via l\'outil' },
  },
  {
    id: 'info_boutique',
    nom: 'Demande info boutique',
    message: 'Quelles boutiques sont disponibles ?',
    telephone_test: '+22670000006',
    countryCode: 'BF',
    attendu: { intention: 'demander_info', outil_consulter_boutique: true, description: 'VENUS doit rechercher les boutiques' },
  },
  {
    id: 'annulation_sans_course',
    nom: 'Annulation — sans course active',
    message: 'Je veux annuler ma course',
    telephone_test: '+22670000007',
    countryCode: 'BF',
    attendu: { intention: 'annuler_course', outil_rechercher_course: true, repond_aucune_course: true, description: 'VENUS doit dire qu\'aucune course n\'est trouvée' },
  },
  {
    id: 'question_hors_domaine',
    nom: 'Question hors domaine',
    message: 'Quel est le score du match d\'hier ?',
    telephone_test: '+22670000008',
    countryCode: 'BF',
    attendu: { pas_d_info_inventee: true, description: 'VENUS doit dire qu\'elle ne peut pas répondre' },
  },
  {
    id: 'gps_partage',
    nom: 'Partage de localisation GPS',
    message: 'Je suis à Ouaga 2000',
    telephone_test: '+22670000009',
    countryCode: 'BF',
    attendu: { detecte_gps: true, demande_precision: true, description: 'VENUS doit demander si c\'est le départ ou l\'arrivée' },
  },
  {
    id: 'info_pharmacie',
    nom: 'Demande info pharmacie',
    message: 'Y a-t-il une pharmacie de garde ?',
    telephone_test: '+22670000010',
    countryCode: 'BF',
    attendu: { intention: 'demander_info', outil_consulter_pharmacie: true, description: 'VENUS doit rechercher les pharmacies' },
  },
];

function getTarifs(countryCode: string) {
  const tarifsDefaut: Record<string, any> = {
    BF: { nom: 'Burkina Faso', prix_km: 100, minimum: 500, devise: 'FCFA' },
    CI: { nom: "Côte d'Ivoire", prix_km: 200, minimum: 1000, devise: 'FCFA' },
  };
  return tarifsDefaut[countryCode] || tarifsDefaut.BF;
}

function evaluerResultat(scenario: any, result: any, outilsResultats: any[], intentionRapide: string, hallucination: any) {
  const details: string[] = [];
  let score = 100;
  const attendu = scenario.attendu || {};

  if (attendu.intention && result.intention !== attendu.intention) {
    score -= 30;
    details.push(`Intention attendue: ${attendu.intention}, obtenue: ${result.intention}`);
  }
  if (attendu.pas_de_prix) {
    const r = (result.reponse || '').toLowerCase();
    if (r.match(/\d+\s*(fcfa|f cfa|franc)/)) {
      score -= 40;
      details.push('Prix mentionné alors que non attendu');
    }
  }
  if (attendu.pas_de_course) {
    const r = (result.reponse || '').toLowerCase();
    if (r.includes('course') || r.includes('livraison') || r.includes('colis')) {
      score -= 20;
      details.push('Course/livraison mentionnée alors que non attendu');
    }
  }
  if (attendu.outil_rechercher_course && !outilsResultats.find(o => o.outil === 'rechercher_course_active')) {
    score -= 30;
    details.push('Outil rechercher_course_active non appelé');
  }
  if (attendu.outil_rechercher_livreur && !outilsResultats.find(o => o.outil === 'rechercher_livreur')) {
    score -= 30;
    details.push('Outil rechercher_livreur non appelé');
  }
  if (attendu.outil_consulter_boutique && !outilsResultats.find(o => o.outil === 'consulter_boutique')) {
    score -= 30;
    details.push('Outil consulter_boutique non appelé');
  }
  if (attendu.outil_consulter_pharmacie && !outilsResultats.find(o => o.outil === 'consulter_pharmacie')) {
    score -= 30;
    details.push('Outil consulter_pharmacie non appelé');
  }
  if (attendu.utilise_tarifs_officiels && !outilsResultats.find(o => o.outil === 'obtenir_tarifs_officiels' && o.trouve)) {
    score -= 20;
    details.push('Tarifs officiels non consultés');
  }
  if (attendu.repond_aucune_course) {
    const r = (result.reponse || '').toLowerCase();
    if (!r.includes('aucune') && !r.includes('pas de course') && !r.includes("n'ai pas") && !r.includes("n'ai trouve")) {
      score -= 30;
      details.push('VENUS ne précise pas qu\'aucune course n\'est trouvée');
    }
  }
  if (hallucination.suspecte) {
    score -= 50;
    details.push(`Hallucination suspectée: ${hallucination.details}`);
  }
  if (attendu.pas_de_creation_immediate && result.action === 'creer_course') {
    score -= 40;
    details.push('VENUS a créé une course immédiatement sans collecter toutes les infos');
  }
  if (attendu.collecte_infos && result.action !== 'poser_question' && result.action !== 'clarifier') {
    score -= 20;
    details.push(`VENUS devrait poser une question, action: ${result.action}`);
  }
  if (attendu.pas_d_info_inventee) {
    const r = (result.reponse || '').toLowerCase();
    if (r.includes('score') || r.includes('match')) {
      score -= 40;
      details.push('VENUS a répondu à une question hors domaine');
    }
  }

  score = Math.max(0, score);
  let statut = 'succes';
  if (score < 50) statut = 'echec';
  else if (score < 80) statut = 'avertissement';

  if (details.length === 0) details.push('Tous les critères attendus sont satisfaits');

  return { statut, score, details };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action } = body;

    // ── list_tools ──
    if (action === 'list_tools') {
      return Response.json({ success: true, tools: listerOutilsDisponibles() });
    }

    // ── list_scenarios ──
    if (action === 'list_scenarios') {
      return Response.json({
        success: true,
        scenarios: STANDARD_SCENARIOS.map(s => ({
          id: s.id, nom: s.nom, message: s.message,
          telephone_test: s.telephone_test, countryCode: s.countryCode, attendu: s.attendu,
        })),
      });
    }

    // ── run_test ──
    if (action === 'run_test') {
      const { scenario_id, message, telephone, countryCode } = body;

      let scenario = STANDARD_SCENARIOS.find(s => s.id === scenario_id);
      if (!scenario && message) {
        scenario = {
          id: 'custom', nom: 'Test personnalisé', message,
          telephone_test: telephone || '+22670000099',
          countryCode: countryCode || 'BF',
          attendu: { description: 'Test personnalisé' },
        };
      }
      if (!scenario) {
        return Response.json({ success: false, error: 'scenario_id ou message requis' }, { status: 400 });
      }

      const tel = scenario.telephone_test;
      const cc = scenario.countryCode;
      const tarifs = getTarifs(cc);

      const memoireLongue = await chargerMemoireLongue(base44, tel, cc);
      const courseActive = await trouverCourseActive(base44, tel, cc);

      const startTime = Date.now();
      const { result, outils_resultats, intention_rapide, hallucination } = await raisonnerVenusAvecOutils(base44, {
        messageClient: scenario.message,
        memoireCourte: {},
        memoireLongue,
        historiqueRecent: [],
        courseActive,
        countryCode: cc,
        tarifs,
        telephone: tel,
        profileName: 'Client Test',
        isAudioTranscription: false,
      });
      const totalTime = Date.now() - startTime;

      const evaluation = evaluerResultat(scenario, result, outils_resultats, intention_rapide, hallucination);

      return Response.json({
        success: true,
        scenario: { id: scenario.id, nom: scenario.nom, message: scenario.message },
        trace: {
          intention_rapide,
          intention_llm: result.intention,
          contexte: result.contexte,
          action: result.action,
          confiance: result.confiance,
          outils_utilises: result.outils_utilises,
          outils_resultats: outils_resultats.map(o => ({
            outil: o.outil, trouve: o.trouve, message: o.message, temps_ms: o.temps_ms,
          })),
          business_rule_id: result.business_rule_id,
          knowledge_id: result.knowledge_id,
          document_sources: result.document_sources,
          memoire_courte_update: result.memoire_courte_update,
          hallucination,
        },
        reponse: result.reponse,
        temps_total_ms: totalTime,
        evaluation,
      });
    }

    // ── run_batch ──
    if (action === 'run_batch') {
      const results = [];

      for (const scenario of STANDARD_SCENARIOS) {
        try {
          const tel = scenario.telephone_test;
          const cc = scenario.countryCode;
          const tarifs = getTarifs(cc);

          const memoireLongue = await chargerMemoireLongue(base44, tel, cc);
          const courseActive = await trouverCourseActive(base44, tel, cc);

          const startTime = Date.now();
          const { result, outils_resultats, intention_rapide, hallucination } = await raisonnerVenusAvecOutils(base44, {
            messageClient: scenario.message,
            memoireCourte: {},
            memoireLongue,
            historiqueRecent: [],
            courseActive,
            countryCode: cc,
            tarifs,
            telephone: tel,
            profileName: 'Client Test',
            isAudioTranscription: false,
          });
          const totalTime = Date.now() - startTime;

          const evaluation = evaluerResultat(scenario, result, outils_resultats, intention_rapide, hallucination);

          results.push({
            scenario_id: scenario.id,
            scenario_nom: scenario.nom,
            message: scenario.message,
            reponse: result.reponse,
            intention_rapide,
            intention_llm: result.intention,
            action: result.action,
            confiance: result.confiance,
            outils: outils_resultats.map(o => ({ outil: o.outil, trouve: o.trouve })),
            hallucination: hallucination.suspecte,
            temps_ms: totalTime,
            evaluation,
          });
        } catch (e) {
          results.push({
            scenario_id: scenario.id, scenario_nom: scenario.nom, message: scenario.message,
            erreur: e.message, evaluation: { statut: 'erreur', score: 0 },
          });
        }
      }

      const scoreGlobal = Math.round(
        results.filter(r => r.evaluation?.statut === 'succes').length / results.length * 100
      );

      return Response.json({
        success: true,
        total: results.length,
        succes: results.filter(r => r.evaluation?.statut === 'succes').length,
        echecs: results.filter(r => r.evaluation?.statut === 'echec').length,
        erreurs: results.filter(r => r.evaluation?.statut === 'erreur').length,
        score_global: scoreGlobal,
        results,
      });
    }

    return Response.json({ success: false, error: 'Action non reconnue' }, { status: 400 });
  } catch (e) {
    console.error('[venusTestLab] Erreur:', e);
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
});