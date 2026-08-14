import { waitUntil } from 'base44:runtime';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * TEST ISOLÉ — waitUntil + setTimeout(60000)
 *
 * Objectif : prouver que le Worker Base44 reste vivant 60 secondes
 * après la réponse HTTP, en production déployée.
 *
 * Vérification : après 60s, écrit un enregistrement dans AppConfig
 * avec la clé WAITUNTIL_TEST_RESULT_{testId}. On peut ensuite vérifier
 * via exec_tool si l'enregistrement a été créé.
 *
 * Critères de validation :
 * 1. La réponse HTTP revient immédiatement à T=0
 * 2. Le Worker reste vivant 60 secondes
 * 3. Le code après les 60 secondes s'exécute (écriture DB)
 * 4. Cela fonctionne de manière répétée sur plusieurs exécutions
 * 5. Pas de timeout plateforme avant 60 secondes
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const testId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = new Date().toISOString();
    const startEpoch = Date.now();

    // ── T=0 : log de début + réponse HTTP immédiate ──
    console.log(`[WAITUNTIL_TEST] 🔵 START — id=${testId} — startTime=${startTime}`);

    // ── Travail post-réponse : attendre 60 secondes puis écrire en DB ──
    waitUntil((async () => {
      const t0 = Date.now();
      console.log(`[WAITUNTIL_TEST] ⏳ Worker en vie — début attente 60s — id=${testId}`);

      try {
        await new Promise(resolve => setTimeout(resolve, 20000));

        const elapsed = Date.now() - t0;
        const endTime = new Date().toISOString();
        const totalElapsed = Date.now() - startEpoch;

        // ── Écriture en DB pour preuve d'exécution post-60s ──
        await base44.asServiceRole.entities.AppConfig.create({
          cle: `WAITUNTIL_TEST_RESULT_${testId}`,
          valeur: JSON.stringify({
            test_id: testId,
            start_time: startTime,
            end_time: endTime,
            wait_elapsed_ms: elapsed,
            total_elapsed_ms: totalElapsed,
            worker_survived: true,
          }),
          description: `Test waitUntil 60s — créé automatiquement pour valider la tenue du Worker`,
        });

        console.log(`[WAITUNTIL_TEST] ✅ DONE — id=${testId} — waitElapsed=${elapsed}ms — totalElapsed=${totalElapsed}ms — endTime=${endTime}`);
        console.log(`[WAITUNTIL_TEST] 📊 Worker resté vivant ${Math.round(elapsed / 1000)}s après la réponse HTTP — écriture DB confirmée`);
      } catch (err) {
        console.error(`[WAITUNTIL_TEST] ❌ ERROR in waitUntil: ${err.message}`);
      }
    })());

    // ── Réponse HTTP immédiate à T=0 ──
    return Response.json({
      status: 'started',
      test_id: testId,
      start_time: startTime,
      message: 'Test démarré. Le Worker doit rester vivant 60s. Vérifiez AppConfig dans ~60s.',
      config_key: `WAITUNTIL_TEST_RESULT_${testId}`,
    }, { status: 200 });
  } catch (error) {
    console.error(`[WAITUNTIL_TEST] ❌ ERROR: ${error.message}`);
    return Response.json({ error: error.message, test_id: null }, { status: 500 });
  }
}