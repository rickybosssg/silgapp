/**
 * ═══════════════════════════════════════════════════════════════════
 * LABORATOIRE DE TEST AUDIO VENUS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Teste la chaîne de traitement audio :
 * 1. Transcription (simulée avec erreurs Whisper réalistes)
 * 2. Nettoyage (venusAudioEngine.nettoyerTranscription)
 * 3. Évaluation de confiance (venusAudioEngine.evaluerConfianceTranscription)
 * 4. Gating (venusAudioEngine.peutAgirSurAudio)
 *
 * Actions :
 * - run_all       : Exécute tous les scénarios audio
 * - run_scenario  : Exécute un scénario unique
 * - get_report    : Génère un rapport détaillé
 * ═══════════════════════════════════════════════════════════════════
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  nettoyerTranscription,
  evaluerConfianceTranscription,
  peutAgirSurAudio,
} from '../../shared/venusAudioEngine.ts';
import {
  AUDIO_SCENARIOS,
  type AudioTestScenario,
} from '../../shared/venusAudioTestScenarios.ts';

// ═══════════════════════════════════════════════════════════════════
// ÉVALUATION D'UN SCÉNARIO
// ═══════════════════════════════════════════════════════════════════

function evaluerScenarioAudio(
  scenario: AudioTestScenario,
  transcriptionBrute: string,
  transcriptionNettoyee: string,
  confiance: number,
  status: string,
  gating: { peutAgir: boolean; forceConfirmation: boolean; raison: string }
): { statut: string; score: number; details: string[]; erreurs: string[] } {
  const details: string[] = [];
  const erreurs: string[] = [];
  let score = 100;
  const attendu = scenario.attendu;

  // Vérifier le nettoyage
  if (attendu.nettoyage_contient) {
    const nettoyeLower = transcriptionNettoyee.toLowerCase();
    for (const mot of attendu.nettoyage_contient) {
      if (!nettoyeLower.includes(mot.toLowerCase())) {
        score -= 15;
        erreurs.push(`Nettoyage: "${mot}" non trouvé dans la transcription nettoyée`);
      } else {
        details.push(`✅ "${mot}" correctement restauré`);
      }
    }
  }

  // Vérifier la confiance
  if (attendu.confiance_min !== undefined && confiance < attendu.confiance_min) {
    score -= 15;
    erreurs.push(`Confiance trop basse: ${confiance.toFixed(2)} (min ${attendu.confiance_min})`);
  }
  if (attendu.confiance_max !== undefined && confiance > attendu.confiance_max) {
    score -= 15;
    erreurs.push(`Confiance trop haute: ${confiance.toFixed(2)} (max ${attendu.confiance_max})`);
  }

  // Vérifier le statut
  if (attendu.status && status !== attendu.status) {
    score -= 20;
    erreurs.push(`Statut attendu: ${attendu.status}, obtenu: ${status}`);
  }

  // Vérifier la confirmation
  if (attendu.doit_confirmer && !gating.forceConfirmation) {
    score -= 25;
    erreurs.push('VENUS devrait forcer une confirmation pour cet audio');
  }

  // Vérifier la demande de répétition
  if (attendu.doit_demander_repete && gating.peutAgir) {
    score -= 30;
    erreurs.push('VENUS devrait demander de répéter (confiance trop faible)');
  }

  // Vérifier pas de création immédiate
  if (attendu.pas_creation_immediate && gating.peutAgir && !gating.forceConfirmation) {
    score -= 30;
    erreurs.push('VENUS ne devrait pas permettre la création immédiate de course');
  }

  score = Math.max(0, score);
  let statut = 'succes';
  if (score < 50) statut = 'echec';
  else if (score < 80) statut = 'avertissement';

  if (details.length === 0 && erreurs.length === 0) details.push('Pipeline audio correct');
  return { statut, score, details, erreurs };
}

// ═══════════════════════════════════════════════════════════════════
// EXÉCUTION D'UN SCÉNARIO
// ═══════════════════════════════════════════════════════════════════

async function executerScenarioAudio(scenario: AudioTestScenario): Promise<any> {
  const transcriptionBrute = scenario.transcription_brute;

  // ── Étape 1 : Transcription (simulée — on utilise la brute) ──
  console.log(`[AudioTestLab] 🎤 Scénario: ${scenario.nom} | Brut: "${transcriptionBrute}"`);

  // ── Étape 2 : Nettoyage ──
  let transcriptionNettoyee = '';
  try {
    transcriptionNettoyee = nettoyerTranscription(transcriptionBrute) || '';
  } catch (e) {
    console.error(`[AudioTestLab] Erreur nettoyage: ${e.message}`);
    transcriptionNettoyee = transcriptionBrute;
  }
  console.log(`[AudioTestLab] 🎤 Nettoyé: "${transcriptionNettoyee}"`);

  // ── Étape 3 : Évaluation de la confiance ──
  let evalConfiance: any = { confidence: 0, status: 'echec', raisons: ['Erreur évaluation'] };
  try {
    evalConfiance = evaluerConfianceTranscription(transcriptionBrute, transcriptionNettoyee) || evalConfiance;
  } catch (e) {
    console.error(`[AudioTestLab] Erreur confiance: ${e.message}`);
  }
  const confianceNum = typeof evalConfiance.confidence === 'number' ? evalConfiance.confidence : 0;
  console.log(`[AudioTestLab] 🎤 Confiance: ${confianceNum.toFixed(2)} | Statut: ${evalConfiance.status} | Raisons: ${(evalConfiance.raisons || []).join('; ')}`);

  // ── Étape 4 : Gating ──
  let gating: any = { peutAgir: false, forceConfirmation: true, raison: 'Erreur gating' };
  try {
    gating = peutAgirSurAudio(confianceNum) || gating;
  } catch (e) {
    console.error(`[AudioTestLab] Erreur gating: ${e.message}`);
  }
  console.log(`[AudioTestLab] 🎤 Gating: peutAgir=${gating.peutAgir} | forceConfirmation=${gating.forceConfirmation} | ${gating.raison}`);

  // ── Évaluation ──
  const evaluation = evaluerScenarioAudio(
    scenario,
    transcriptionBrute,
    transcriptionNettoyee,
    confianceNum,
    evalConfiance.status,
    gating
  );

  return {
    scenario_id: scenario.id,
    scenario_nom: scenario.nom,
    description: scenario.description,
    texte_prononce: scenario.texte_prononce,
    transcription_brute: transcriptionBrute,
    transcription_nettoyee: transcriptionNettoyee,
    confidence: confianceNum,
    status: evalConfiance.status || 'inconnu',
    raisons: evalConfiance.raisons || [],
    gating: gating,
    evaluation,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GÉNÉRATION DE RAPPORT
// ═══════════════════════════════════════════════════════════════════

function genererRapportAudio(results: any[]): string {
  const total = results.length;
  const succes = results.filter(r => r.evaluation?.statut === 'succes').length;
  const avertissements = results.filter(r => r.evaluation?.statut === 'avertissement').length;
  const echecs = results.filter(r => r.evaluation?.statut === 'echec').length;
  const scoreGlobal = total > 0 ? Math.round(succes / total * 100) : 0;

  let rapport = `
═══════════════════════════════════════════════════════════════════
  RAPPORT DE CAMPAGNE AUDIO VENUS
═══════════════════════════════════════════════════════════════════

📊 SCORE GLOBAL: ${scoreGlobal}% (${succes}/${total} succès)

✅ Succès:         ${succes}
⚠️  Avertissements: ${avertissements}
❌ Échecs:         ${echecs}

`;

  for (const r of results) {
    const icon = r.evaluation?.statut === 'succes' ? '✅' :
                 r.evaluation?.statut === 'avertissement' ? '⚠️' : '❌';

    rapport += `${icon} [${r.scenario_id}] ${r.scenario_nom}\n`;
    rapport += `   Prononcé: "${r.texte_prononce}"\n`;
    rapport += `   Brut:     "${r.transcription_brute}"\n`;
    rapport += `   Nettoyé:  "${r.transcription_nettoyee}"\n`;
    rapport += `   Confiance: ${(typeof r.confidence === 'number' ? r.confidence : 0).toFixed(2)} (${r.status})\n`;
    rapport += `   Gating: peutAgir=${r.gating.peutAgir} | forceConf=${r.gating.forceConfirmation}\n`;

    if (r.evaluation?.erreurs && r.evaluation.erreurs.length > 0) {
      rapport += `   Erreurs:\n`;
      for (const e of r.evaluation.erreurs) {
        rapport += `     • ${e}\n`;
      }
    }
    if (r.evaluation?.details && r.evaluation.details.length > 0) {
      rapport += `   Détails:\n`;
      for (const d of r.evaluation.details) {
        rapport += `     • ${d}\n`;
      }
    }
    rapport += '\n';
  }

  // Synthèse des corrections
  const correctionsAppliquees = results.filter(r =>
    r.transcription_brute !== r.transcription_nettoyee
  );

  rapport += `═══════════════════════════════════════════════════════════════════
  SYNTHÈSE DES CORRECTIONS
═══════════════════════════════════════════════════════════════════\n\n`;
  rapport += `${correctionsAppliquees.length}/${total} transcription(s) ont été corrigées par le moteur de nettoyage.\n\n`;

  for (const r of correctionsAppliquees) {
    rapport += `📝 [${r.scenario_id}]\n`;
    rapport += `   Avant: "${r.transcription_brute}"\n`;
    rapport += `   Après: "${r.transcription_nettoyee}"\n\n`;
  }

  rapport += `═══════════════════════════════════════════════════════════════════
  VERDICT
═══════════════════════════════════════════════════════════════════\n\n`;

  if (echecs > 0) {
    rapport += `❌ Le pipeline audio a ${echecs} échec(s) à corriger avant la production.\n`;
  } else if (avertissements > 0) {
    rapport += `⚠️ Le pipeline audio fonctionne mais ${avertissements} avertissement(s) à surveiller.\n`;
  } else {
    rapport += `✅ Le pipeline audio est validé — nettoyage, confiance et confirmation fonctionnent correctement.\n`;
  }

  rapport += `\n═══════════════════════════════════════════════════════════════════\n`;

  return rapport;
}

// ═══════════════════════════════════════════════════════════════════
// HANDLER HTTP
// ═══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action } = body;

    // ── list_scenarios ──
    if (action === 'list_scenarios') {
      return Response.json({
        success: true,
        total: AUDIO_SCENARIOS.length,
        scenarios: AUDIO_SCENARIOS.map(s => ({
          id: s.id, nom: s.nom, description: s.description,
          texte_prononce: s.texte_prononce, transcription_brute: s.transcription_brute,
        })),
      });
    }

    // ── run_scenario ──
    if (action === 'run_scenario') {
      const { scenario_id } = body;
      const scenario = AUDIO_SCENARIOS.find(s => s.id === scenario_id);
      if (!scenario) {
        return Response.json({ success: false, error: `Scénario '${scenario_id}' introuvable` }, { status: 400 });
      }
      const result = await executerScenarioAudio(scenario);
      return Response.json({ success: true, result });
    }

    // ── run_all ──
    if (action === 'run_all') {
      const results = [];
      for (const scenario of AUDIO_SCENARIOS) {
        const result = await executerScenarioAudio(scenario);
        results.push(result);
      }

      const succes = results.filter(r => r.evaluation?.statut === 'succes').length;
      const scoreGlobal = Math.round(succes / results.length * 100);
      const rapport = genererRapportAudio(results);

      return Response.json({
        success: true,
        total: results.length,
        succes,
        score_global: scoreGlobal,
        results,
        rapport,
      });
    }

    // ── test_transcription — teste le nettoyage d'une transcription custom ──
    if (action === 'test_transcription') {
      const { texte_brut } = body;
      if (!texte_brut) {
        return Response.json({ success: false, error: 'texte_brut requis' }, { status: 400 });
      }
      const nettoye = nettoyerTranscription(texte_brut);
      const evalConf = evaluerConfianceTranscription(texte_brut, nettoye);
      const gating = peutAgirSurAudio(evalConf.confiance);

      return Response.json({
        success: true,
        texte_brut,
        texte_nettoyee: nettoye,
        confidence: evalConf.confiance,
        status: evalConf.status,
        raisons: evalConf.raisons,
        gating,
      });
    }

    return Response.json({ success: false, error: 'Action non reconnue. Actions: list_scenarios, run_scenario, run_all, test_transcription' }, { status: 400 });
  } catch (e) {
    console.error('[venusAudioTestLab] Erreur:', e);
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
});