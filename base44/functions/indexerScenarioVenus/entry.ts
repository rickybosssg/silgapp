import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { indexerTexteDirect, construireIndexMotsCles } from '../../shared/venusRagEngine.ts';

/**
 * Automatisation : indexation automatique des scénarios VENUS validés dans la base RAG.
 *
 * Déclenchée par une entity automation sur VenusScenario (create/update).
 * Payload reçu : { event, data, old_data, changed_fields, payload_too_large }
 *
 * - statut='valide' → indexe le scénario dans le RAG
 * - statut='archive' → désindexe le scénario du RAG
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // ── Action manuelle : build_keyword_index ──
    // Reconstruit l'index inversé (VenusKeywordIndex) à partir de tous les chunks validés.
    // Migration one-shot à lancer après le refactor du moteur RAG.
    if (body.action === 'build_keyword_index') {
      const user = await base44.auth.me();
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
      }

      const result = await construireIndexMotsCles(base44);
      return Response.json({
        success: result.success,
        message: result.success
          ? `Index construit: ${result.chunks_traites} chunks traités, ${result.mots_cles_indexes} mots-clés indexés`
          : 'Erreur lors de la construction de l\'index',
        ...result,
      });
    }

    // ── Action manuelle : batch_index ──
    // Indexe tous les scénarios validés non encore indexés (rag_indexe=false)
    // ou un ensemble spécifique d'IDs. Permet l'indexation par lot après
    // validation administrative, au lieu d'une indexation automatique à chaque création.
    if (body.action === 'batch_index') {
      const user = await base44.auth.me();
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
      }

      const query = body.scenario_ids
        ? { statut: 'valide', id: { $in: body.scenario_ids } }
        : { statut: 'valide', rag_indexe: false };

      const scenarios = body.scenario_ids
        ? await base44.asServiceRole.entities.VenusScenario.filter({ statut: 'valide' }, '-created_date', 200).then(all =>
            all.filter(s => body.scenario_ids.includes(s.id))
          )
        : await base44.asServiceRole.entities.VenusScenario.filter({ statut: 'valide', rag_indexe: false }, '-created_date', 200);

      const results: any[] = [];
      let successCount = 0;
      let failCount = 0;

      for (const scenario of scenarios) {
        try {
          // Désindexer l'ancienne version si elle existe
          if (scenario.rag_document_id) {
            try {
              await base44.asServiceRole.entities.VenusDocument.update(scenario.rag_document_id, { statut: 'archive', is_latest_version: false });
              const oldChunks = await base44.asServiceRole.entities.VenusDocumentChunk.filter({ document_id: scenario.rag_document_id }, '-chunk_index', 500);
              for (const oc of oldChunks) await base44.asServiceRole.entities.VenusDocumentChunk.update(oc.id, { document_statut: 'archive' });
            } catch (e) { console.warn('[indexerScenarioVenus] batch: archivage ancien:', e.message); }
          }

          const triggers = (() => { try { return JSON.parse(scenario.declencheurs || '[]'); } catch { return []; } })();
          const conv = (() => { try { return JSON.parse(scenario.conversation || '[]'); } catch { return []; } })();
          const convText = conv.map((m: any) => `${m.role === 'venus' ? 'VENUS' : 'Client'}: ${m.content}`).join('\n');
          const textePourRag = `Scénario: ${scenario.nom}\nDescription: ${scenario.description || ''}\nCatégorie: ${scenario.categorie || 'N/A'}\nDéclencheurs: ${triggers.join(', ')}\n\nConversation:\n${convText}\n\nRéponse idéale:\n${scenario.reponse_ideale || ''}\n\nRésultat attendu: ${scenario.resultat_attendu || ''}`;

          const result = await indexerTexteDirect(base44, { texte: textePourRag, auteur: scenario.auteur || 'admin' });

          if (result.success && result.document?.id) {
            await base44.asServiceRole.entities.VenusScenario.update(scenario.id, {
              rag_indexe: true,
              rag_document_id: result.document.id,
              rag_indexe_at: new Date().toISOString(),
              rag_erreur: '',
            });
            results.push({ id: scenario.id, nom: scenario.nom, statut: 'succes' });
            successCount++;
          } else {
            await base44.asServiceRole.entities.VenusScenario.update(scenario.id, {
              rag_indexe: false,
              rag_erreur: result.error || 'Erreur inconnue',
            });
            results.push({ id: scenario.id, nom: scenario.nom, statut: 'echec', erreur: result.error });
            failCount++;
          }
        } catch (e: any) {
          results.push({ id: scenario.id, nom: scenario.nom, statut: 'echec', erreur: e.message });
          failCount++;
        }
      }

      return Response.json({
        success: true,
        message: `${successCount} scénario(s) indexé(s), ${failCount} échec(s)`,
        total: scenarios.length,
        succes: successCount,
        echecs: failCount,
        results,
      });
    }

    let scenario = body.data;
    const eventId = body.event?.entity_id;

    // Si payload trop volumineux, récupérer le scénario depuis la DB
    if ((!scenario || body.payload_too_large) && eventId) {
      scenario = await base44.asServiceRole.entities.VenusScenario.get(eventId);
    }

    if (!scenario) {
      return Response.json({ success: false, error: 'Aucune donnée de scénario dans le payload' });
    }

    // ── Scénario validé → indexer dans le RAG ──
    if (scenario.statut === 'valide') {
      // Désindexer l'ancienne version si elle existe
      if (scenario.rag_document_id) {
        try {
          await base44.asServiceRole.entities.VenusDocument.update(scenario.rag_document_id, { statut: 'archive', is_latest_version: false });
          const oldChunks = await base44.asServiceRole.entities.VenusDocumentChunk.filter({ document_id: scenario.rag_document_id }, '-chunk_index', 500);
          for (const oc of oldChunks) await base44.asServiceRole.entities.VenusDocumentChunk.update(oc.id, { document_statut: 'archive' });
        } catch (e) { console.warn('[indexerScenarioVenus] Erreur archivage ancien RAG:', e.message); }
      }

      // Construire le texte structuré pour le RAG
      const triggers = (() => { try { return JSON.parse(scenario.declencheurs || '[]'); } catch { return []; } })();
      const conv = (() => { try { return JSON.parse(scenario.conversation || '[]'); } catch { return []; } })();
      const convText = conv.map((m: any) => `${m.role === 'venus' ? 'VENUS' : 'Client'}: ${m.content}`).join('\n');
      const textePourRag = `Scénario: ${scenario.nom}\nDescription: ${scenario.description || ''}\nCatégorie: ${scenario.categorie || 'N/A'}\nDéclencheurs: ${triggers.join(', ')}\n\nConversation:\n${convText}\n\nRéponse idéale:\n${scenario.reponse_ideale || ''}\n\nRésultat attendu: ${scenario.resultat_attendu || ''}`;

      const result = await indexerTexteDirect(base44, { texte: textePourRag, auteur: scenario.auteur || 'admin' });

      if (result.success && result.document?.id) {
        await base44.asServiceRole.entities.VenusScenario.update(scenario.id, {
          rag_indexe: true,
          rag_document_id: result.document.id,
          rag_indexe_at: new Date().toISOString(),
          rag_erreur: '',
        });
        return Response.json({ success: true, message: `Scénario indexé dans le RAG: ${scenario.nom}`, document_id: result.document.id });
      } else {
        await base44.asServiceRole.entities.VenusScenario.update(scenario.id, {
          rag_indexe: false,
          rag_erreur: result.error || 'Erreur d\'indexation inconnue',
        });
        return Response.json({ success: false, error: result.error || 'Erreur d\'indexation' });
      }
    }

    // ── Scénario archivé → désindexer du RAG ──
    if (scenario.statut === 'archive' && scenario.rag_document_id) {
      try {
        await base44.asServiceRole.entities.VenusDocument.update(scenario.rag_document_id, { statut: 'archive', is_latest_version: false });
        const oldChunks = await base44.asServiceRole.entities.VenusDocumentChunk.filter({ document_id: scenario.rag_document_id }, '-chunk_index', 500);
        for (const oc of oldChunks) await base44.asServiceRole.entities.VenusDocumentChunk.update(oc.id, { document_statut: 'archive' });
      } catch (e) { console.warn('[indexerScenarioVenus] Erreur désindexation:', e.message); }
      await base44.asServiceRole.entities.VenusScenario.update(scenario.id, {
        rag_indexe: false,
        rag_document_id: '',
        rag_erreur: '',
      });
      return Response.json({ success: true, message: `Scénario désindexé du RAG: ${scenario.nom}` });
    }

    return Response.json({ success: true, message: 'Aucune action RAG nécessaire pour ce statut' });
  } catch (error) {
    console.error('[indexerScenarioVenus] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});