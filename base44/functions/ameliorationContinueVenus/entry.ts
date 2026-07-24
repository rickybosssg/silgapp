import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  detecterQuestionsRecurrentes,
  calculerFaiblesses,
  verifierAlertesAmelioration,
  genererRapportAmelioration,
  detecterNouvellesIntentions,
} from '../../shared/venusImprovementEngine.ts';

/**
 * Moteur d'amélioration continue VENUS.
 * Exécuté quotidiennement par une automation planifiée.
 *
 * Actions:
 * - full: Exécute toutes les analyses
 * - questions: Détecte les questions récurrentes
 * - faiblesses: Calcule les faiblesses par domaine
 * - alertes: Vérifie les conditions d'alerte
 * - rapport_quotidien: Génère le rapport quotidien
 * - rapport_hebdomadaire: Génère le rapport hebdomadaire
 * - rapport_mensuel: Génère le rapport mensuel
 * - intentions: Détecte les nouvelles intentions
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'full';
    const periodeJours = body.periode_jours || 7;

    const results: any = { action, timestamp: new Date().toISOString() };

    if (action === 'full' || action === 'questions') {
      results.questions_recurrentes = await detecterQuestionsRecurrentes(base44, periodeJours);
    }

    if (action === 'full' || action === 'faiblesses') {
      results.faiblesses = await calculerFaiblesses(base44, periodeJours);
    }

    if (action === 'full' || action === 'intentions') {
      results.nouvelles_intentions = await detecterNouvellesIntentions(base44, periodeJours);
    }

    if (action === 'full' || action === 'alertes') {
      results.alertes = await verifierAlertesAmelioration(base44);
    }

    if (action === 'full' || action === 'rapport_quotidien') {
      results.rapport_quotidien = await genererRapportAmelioration(base44, 'quotidien');
    }

    if (action === 'rapport_hebdomadaire') {
      results.rapport_hebdomadaire = await genererRapportAmelioration(base44, 'hebdomadaire');
    }

    if (action === 'rapport_mensuel') {
      results.rapport_mensuel = await genererRapportAmelioration(base44, 'mensuel');
    }

    console.log(`[ameliorationContinueVenus] ✅ Action "${action}" terminée`);
    return Response.json({ success: true, ...results });
  } catch (error) {
    console.error(`[ameliorationContinueVenus] ❌ Erreur: ${error.message}`);
    console.error(`Stack: ${error.stack?.substring(0, 300)}`);

    // Alerte admin en cas d'échec
    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.VenusImprovementAlert.create({
        type: 'outil_indisponible',
        severite: 'critique',
        titre: 'Échec du moteur d\'amélioration continue',
        message: `Erreur: ${error.message}`,
        metadata: JSON.stringify({ error: error.message, stack: error.stack?.substring(0, 500) }),
        creee_date: new Date().toISOString(),
      });
    } catch {}

    return Response.json({ error: error.message }, { status: 500 });
  }
});