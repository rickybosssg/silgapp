import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  indexerDocumentComplet,
  indexerTexteDirect,
  rechercherDocumentsRag,
  getStatistiquesDocuments,
  getHistoriqueVersions,
  restaurerVersion,
  extraireTexteDocument,
  decouperTexteIntelligent,
  detecterCategorieAutomatique,
  indexerMotsClesChunk,
  construireIndexMotsCles,
} from '../../shared/venusRagEngine.ts';

/**
 * Fonction backend pour l'indexation et la gestion des documents VENUS.
 *
 * Actions :
 * - index_document : Indexer un nouveau document ou mettre à jour un existant
 * - search : Rechercher dans la bibliothèque (admin/testing)
 * - stats : Récupérer les statistiques
 * - history : Récupérer l'historique des versions d'un document
 * - restore : Restaurer une ancienne version
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'index_document': {
        const result = await indexerDocumentComplet(base44, {
          fichier_url: body.fichier_url,
          fichier_nom: body.fichier_nom,
          fichier_type_mime: body.fichier_type_mime,
          fichier_taille: body.fichier_taille,
          titre: body.titre,
          description: body.description,
          categorie: body.categorie,
          type_document: body.type_document,
          auteur: body.auteur || 'admin',
          pays: body.pays || 'ALL',
          tags: body.tags || [],
          statut: body.statut || 'valide',
          document_existant_id: body.document_existant_id,
        });

        return Response.json(result);
      }

      case 'index_texte_direct': {
        const result = await indexerTexteDirect(base44, {
          texte: body.texte,
          auteur: body.auteur || 'admin',
        });
        return Response.json(result);
      }

      case 'index_from_suggestion': {
        // Transforme une suggestion validée en document RAG
        const suggestion = await base44.asServiceRole.entities.VenusSuggestion.get(body.suggestion_id);
        if (!suggestion) {
          return Response.json({ success: false, error: 'Suggestion non trouvée' }, { status: 404 });
        }

        const reponseFinale = suggestion.amelioration_reponse || suggestion.reponse_proposee || '';
        if (!reponseFinale || reponseFinale.trim().length < 20) {
          return Response.json({ success: false, error: 'Aucune réponse à indexer (vide ou trop courte)' }, { status: 400 });
        }

        const motsCles = (() => { try { return JSON.parse(suggestion.mots_cles || '[]'); } catch { return []; } })();
        const exemples = (() => { try { return JSON.parse(suggestion.conversations_exemples || '[]'); } catch { return []; } })();

        // Construire un texte structuré pour le RAG
        const texteDoc = `Q: ${suggestion.question_detectee}\n\nR: ${reponseFinale}\n\nMots-clés: ${motsCles.join(', ')}\n\nCatégorie: ${suggestion.categorie || 'questions_generales'}\nIntention: ${suggestion.intention_detectee || 'N/A'}`;

        const result = await indexerTexteDirect(base44, {
          texte: texteDoc,
          auteur: body.auteur || suggestion.validee_par || 'admin',
        });

        // Marquer la suggestion comme transformée en RAG
        if (result.success) {
          await base44.asServiceRole.entities.VenusSuggestion.update(suggestion.id, {
            document_sources: JSON.stringify([{ document_id: result.document.id, document_titre: result.document.titre, chunk_id: '', score: 100 }]),
          });
        }

        return Response.json(result);
      }

      case 'search': {
        const result = await rechercherDocumentsRag(base44, body.query, {
          pays: body.pays,
          categorie: body.categorie,
          limit: body.limit || 5,
          conversation_id: body.conversation_id,
        });
        return Response.json(result);
      }

      case 'stats': {
        const stats = await getStatistiquesDocuments(base44);
        return Response.json({ success: true, stats });
      }

      case 'history': {
        const versions = await getHistoriqueVersions(base44, body.document_id);
        return Response.json({ success: true, versions });
      }

      case 'restore': {
        const result = await restaurerVersion(base44, body.document_id, body.version_id, body.auteur || 'admin');
        return Response.json(result);
      }

      // ── Désindexer un document VenusKnowledge de la base RAG ──
      case 'desindexer_knowledge': {
        const knowledge = await base44.asServiceRole.entities.VenusKnowledge.get(body.knowledge_id);
        if (!knowledge) {
          return Response.json({ success: false, error: 'Connaissance non trouvée' }, { status: 404 });
        }
        if (!knowledge.rag_document_id) {
          await base44.asServiceRole.entities.VenusKnowledge.update(knowledge.id, {
            rag_indexe: false, rag_erreur: '', rag_document_id: '',
          });
          return Response.json({ success: true, message: 'Aucun document RAG associé — nettoyage effectué' });
        }
        // Archiver le VenusDocument et ses chunks
        try {
          await base44.asServiceRole.entities.VenusDocument.update(knowledge.rag_document_id, {
            statut: 'archive', is_latest_version: false,
          });
          const oldChunks = await base44.asServiceRole.entities.VenusDocumentChunk.filter(
            { document_id: knowledge.rag_document_id }, '-chunk_index', 500
          );
          for (const oc of oldChunks) {
            await base44.asServiceRole.entities.VenusDocumentChunk.update(oc.id, { document_statut: 'archive' });
          }
        } catch (e) { console.warn('[desindexer] Erreur archivage RAG:', e.message); }
        await base44.asServiceRole.entities.VenusKnowledge.update(knowledge.id, {
          rag_indexe: false, rag_document_id: '', rag_erreur: '',
        });
        return Response.json({ success: true, message: `Document désindexé du RAG (${knowledge.titre})` });
      }

      // ── Réindexer un document VenusKnowledge spécifique ──
      case 'reindexer_knowledge': {
        const knowledge = await base44.asServiceRole.entities.VenusKnowledge.get(body.knowledge_id);
        if (!knowledge) {
          return Response.json({ success: false, error: 'Connaissance non trouvée' }, { status: 404 });
        }
        // Désindexer l'ancienne version si elle existe
        if (knowledge.rag_document_id) {
          try {
            await base44.asServiceRole.entities.VenusDocument.update(knowledge.rag_document_id, {
              statut: 'archive', is_latest_version: false,
            });
            const oldChunks = await base44.asServiceRole.entities.VenusDocumentChunk.filter(
              { document_id: knowledge.rag_document_id }, '-chunk_index', 500
            );
            for (const oc of oldChunks) {
              await base44.asServiceRole.entities.VenusDocumentChunk.update(oc.id, { document_statut: 'archive' });
            }
          } catch (e) { console.warn('[reindexer] Erreur archivage ancien RAG:', e.message); }
        }
        // Réindexer avec le contenu actuel
        const textePourRag = `Titre: ${knowledge.titre}\nDescription: ${knowledge.description || ''}\nCatégorie: ${knowledge.categorie || 'N/A'}\nSous-catégorie: ${knowledge.sous_categorie || 'N/A'}\nQuestion: ${knowledge.question || 'N/A'}\n\nContenu:\n${knowledge.reponse_officielle}\n\nMots-clés: ${knowledge.mots_cles || ''}`;
        const result = await indexerTexteDirect(base44, {
          texte: textePourRag,
          auteur: body.auteur || knowledge.auteur || 'admin',
        });
        if (result.success && result.document?.id) {
          await base44.asServiceRole.entities.VenusKnowledge.update(knowledge.id, {
            rag_indexe: true, rag_document_id: result.document.id,
            rag_indexe_at: new Date().toISOString(), rag_erreur: '',
          });
        } else {
          await base44.asServiceRole.entities.VenusKnowledge.update(knowledge.id, {
            rag_indexe: false, rag_erreur: result.error || 'Erreur d\'indexation inconnue',
          });
        }
        return Response.json(result);
      }

      // ── Réindexer tous les documents validés ──
      case 'reindexer_tout': {
        const allKnowledge = await base44.asServiceRole.entities.VenusKnowledge.filter(
          { statut: 'valide' }, '-updated_date', 200
        );
        let success = 0, errors = 0, total = allKnowledge.length;
        for (const k of allKnowledge) {
          try {
            // Désindexer l'ancien
            if (k.rag_document_id) {
              try {
                await base44.asServiceRole.entities.VenusDocument.update(k.rag_document_id, { statut: 'archive', is_latest_version: false });
                const oldChunks = await base44.asServiceRole.entities.VenusDocumentChunk.filter({ document_id: k.rag_document_id }, '-chunk_index', 500);
                for (const oc of oldChunks) await base44.asServiceRole.entities.VenusDocumentChunk.update(oc.id, { document_statut: 'archive' });
              } catch {}
            }
            const textePourRag = `Titre: ${k.titre}\nDescription: ${k.description || ''}\nCatégorie: ${k.categorie || 'N/A'}\n\nContenu:\n${k.reponse_officielle}\n\nMots-clés: ${k.mots_cles || ''}`;
            const result = await indexerTexteDirect(base44, { texte: textePourRag, auteur: body.auteur || k.auteur || 'admin' });
            if (result.success && result.document?.id) {
              await base44.asServiceRole.entities.VenusKnowledge.update(k.id, {
                rag_indexe: true, rag_document_id: result.document.id,
                rag_indexe_at: new Date().toISOString(), rag_erreur: '',
              });
              success++;
            } else {
              await base44.asServiceRole.entities.VenusKnowledge.update(k.id, {
                rag_indexe: false, rag_erreur: result.error || 'Erreur',
              });
              errors++;
            }
          } catch (e) {
            errors++;
            console.error(`[reindexer_tout] Erreur sur ${k.titre}:`, e.message);
          }
        }
        return Response.json({ success: true, total, success_count: success, error_count: errors });
      }

      // ── Statuts de la base de connaissances RAG ──
      case 'stats_knowledge': {
        const allKnowledge = await base44.asServiceRole.entities.VenusKnowledge.list('-updated_date', 500);
        const valides = allKnowledge.filter((k: any) => k.statut === 'valide');
        const indexes = valides.filter((k: any) => k.rag_indexe === true);
        const enAttente = valides.filter((k: any) => !k.rag_indexe && !k.rag_erreur);
        const erreurs = valides.filter((k: any) => k.rag_erreur && k.rag_erreur.length > 0);
        const brouillons = allKnowledge.filter((k: any) => k.statut === 'brouillon');
        const archives = allKnowledge.filter((k: any) => k.statut === 'archive');
        const enRevision = allKnowledge.filter((k: any) => k.statut === 'en_revision');
        const tailleEstimee = allKnowledge.reduce((sum: number, k: any) => sum + (k.reponse_officielle?.length || 0), 0);
        const derniereIndexation = indexes
          .map((k: any) => k.rag_indexe_at)
          .filter(Boolean)
          .sort((a: string, b: string) => b.localeCompare(a))[0] || null;
        return Response.json({
          success: true,
          stats: {
            total_documents: allKnowledge.length,
            documents_valides: valides.length,
            documents_indexes: indexes.length,
            documents_en_attente: enAttente.length,
            documents_erreur: erreurs.length,
            documents_brouillon: brouillons.length,
            documents_archive: archives.length,
            documents_en_revision: enRevision.length,
            taille_estimee_caracteres: tailleEstimee,
            taille_estimee_mo: Math.round((tailleEstimee / 1024 / 1024) * 100) / 100,
            derniere_indexation: derniereIndexation,
          },
        });
      }

      // ── Indexer un scénario validé dans la base RAG ──
      case 'index_scenario': {
        const scenario = await base44.asServiceRole.entities.VenusScenario.get(body.scenario_id);
        if (!scenario) {
          return Response.json({ success: false, error: 'Scénario non trouvé' }, { status: 404 });
        }
        // Désindexer l'ancienne version si elle existe
        if (scenario.rag_document_id) {
          try {
            await base44.asServiceRole.entities.VenusDocument.update(scenario.rag_document_id, { statut: 'archive', is_latest_version: false });
            const oldChunks = await base44.asServiceRole.entities.VenusDocumentChunk.filter({ document_id: scenario.rag_document_id }, '-chunk_index', 500);
            for (const oc of oldChunks) await base44.asServiceRole.entities.VenusDocumentChunk.update(oc.id, { document_statut: 'archive' });
          } catch (e) { console.warn('[index_scenario] Erreur archivage ancien RAG:', e.message); }
        }
        // Construire le texte pour le RAG
        const triggersSc = (() => { try { return JSON.parse(scenario.declencheurs || '[]'); } catch { return []; } })();
        const convSc = (() => { try { return JSON.parse(scenario.conversation || '[]'); } catch { return []; } })();
        const convTextSc = convSc.map((m: any) => `${m.role === 'venus' ? 'VENUS' : 'Client'}: ${m.content}`).join('\n');
        const textePourRagSc = `Scénario: ${scenario.nom}\nDescription: ${scenario.description || ''}\nCatégorie: ${scenario.categorie || 'N/A'}\nDéclencheurs: ${triggersSc.join(', ')}\n\nConversation:\n${convTextSc}\n\nRéponse idéale:\n${scenario.reponse_ideale || ''}\n\nRésultat attendu: ${scenario.resultat_attendu || ''}`;
        const resultSc = await indexerTexteDirect(base44, { texte: textePourRagSc, auteur: body.auteur || scenario.auteur || 'admin' });
        if (resultSc.success && resultSc.document?.id) {
          await base44.asServiceRole.entities.VenusScenario.update(scenario.id, {
            rag_indexe: true, rag_document_id: resultSc.document.id,
            rag_indexe_at: new Date().toISOString(), rag_erreur: '',
          });
        } else {
          await base44.asServiceRole.entities.VenusScenario.update(scenario.id, {
            rag_indexe: false, rag_erreur: resultSc.error || 'Erreur d\'indexation inconnue',
          });
        }
        return Response.json(resultSc);
      }

      // ── Désindexer un scénario de la base RAG ──
      case 'desindexer_scenario': {
        const scenario = await base44.asServiceRole.entities.VenusScenario.get(body.scenario_id);
        if (!scenario) {
          return Response.json({ success: false, error: 'Scénario non trouvé' }, { status: 404 });
        }
        if (!scenario.rag_document_id) {
          await base44.asServiceRole.entities.VenusScenario.update(scenario.id, {
            rag_indexe: false, rag_erreur: '', rag_document_id: '',
          });
          return Response.json({ success: true, message: 'Aucun document RAG associé — nettoyage effectué' });
        }
        try {
          await base44.asServiceRole.entities.VenusDocument.update(scenario.rag_document_id, { statut: 'archive', is_latest_version: false });
          const oldChunks = await base44.asServiceRole.entities.VenusDocumentChunk.filter({ document_id: scenario.rag_document_id }, '-chunk_index', 500);
          for (const oc of oldChunks) await base44.asServiceRole.entities.VenusDocumentChunk.update(oc.id, { document_statut: 'archive' });
        } catch (e) { console.warn('[desindexer_scenario] Erreur archivage RAG:', e.message); }
        await base44.asServiceRole.entities.VenusScenario.update(scenario.id, {
          rag_indexe: false, rag_document_id: '', rag_erreur: '',
        });
        return Response.json({ success: true, message: `Scénario désindexé du RAG (${scenario.nom})` });
      }

      // ── Prévisualiser un document (extraction sans sauvegarde) ──
      case 'previsualiser_document': {
        const { fichier_url, fichier_nom, fichier_type_mime } = body;
        if (!fichier_url) {
          return Response.json({ success: false, error: 'fichier_url requis' }, { status: 400 });
        }

        const extraction = await extraireTexteDocument(base44, fichier_url, fichier_type_mime || '');
        if (!extraction.texte || extraction.texte.trim().length < 10) {
          return Response.json({ success: false, error: 'Extraction de texte impossible ou document vide' });
        }

        const chunksTexte = decouperTexteIntelligent(extraction.texte);

        let titre = '', resume = '', motsCles: string[] = [];
        try {
          const llmCombined = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `Analyse ce document et génère en UNE SEULE réponse:
1. Un titre court et descriptif (max 80 caractères)
2. Un résumé concis (max 300 caractères)
3. Les 15 mots-clés les plus importants (minuscules, sans accents)

Document:
${extraction.texte.substring(0, 4000)}`,
            response_json_schema: {
              type: 'object',
              properties: {
                titre: { type: 'string' },
                resume: { type: 'string' },
                mots_cles: { type: 'array', items: { type: 'string' } },
              },
              required: ['titre', 'resume', 'mots_cles'],
            },
            model: 'gpt_5_mini',
          });
          const combined: any = typeof llmCombined === 'string' ? JSON.parse(llmCombined) : llmCombined;
          titre = (combined.titre || '').substring(0, 100);
          resume = combined.resume || '';
          motsCles = combined.mots_cles || [];
        } catch (e: any) {
          titre = (fichier_nom || 'Document sans titre').replace(/\.[^.]+$/, '').substring(0, 80);
          resume = extraction.texte.substring(0, 300);
          motsCles = [];
        }

        const categorie = detecterCategorieAutomatique(extraction.texte);

        const problems: string[] = [];
        if (extraction.texte.length < 50) problems.push('Document très court (moins de 50 caractères)');
        if (chunksTexte.length === 0) problems.push('Aucun chunk généré — texte potentiellement vide');
        if (chunksTexte.length > 100) problems.push(`Document très long (${chunksTexte.length} chunks)`);
        if (extraction.langue !== 'fr') problems.push(`Langue détectée: ${extraction.langue}`);
        if (extraction.texte.length > 20000) problems.push('Document très long — extraction potentiellement partielle');

        const estimatedTokens = Math.ceil(extraction.texte.length / 4);

        return Response.json({
          success: true,
          preview: {
            texte: extraction.texte,
            titre, resume, mots_cles: motsCles, categorie,
            langue: extraction.langue,
            nb_pages: extraction.nb_pages,
            chunks: chunksTexte.map((c, i) => ({ index: i, contenu: c, resume: c.substring(0, 100), taille: c.length })),
            nb_chunks: chunksTexte.length,
            estimated_tokens: estimatedTokens,
            problems,
            fichier_url, fichier_nom: fichier_nom || '', fichier_type_mime: fichier_type_mime || '',
          },
        });
      }

      // ── Publier un document prévisualisé (création + indexation) ──
      case 'publier_document': {
        const { texte, titre, resume, mots_cles, categorie, langue, fichier_url, fichier_nom, fichier_type_mime, pays, auteur } = body;
        if (!texte || texte.trim().length < 10) return Response.json({ success: false, error: 'Texte requis (min 10 caractères)' }, { status: 400 });
        if (!titre || titre.trim().length < 3) return Response.json({ success: false, error: 'Titre requis (min 3 caractères)' }, { status: 400 });

        const mime = fichier_type_mime || '';
        let typeDocument = 'Texte';
        if (mime.includes('pdf')) typeDocument = 'PDF';
        else if (mime.includes('word') || mime.includes('docx')) typeDocument = 'Word';
        else if (mime.includes('sheet') || mime.includes('excel') || mime.includes('xlsx')) typeDocument = 'Excel';
        else if (mime.includes('markdown')) typeDocument = 'Markdown';

        const chunksTexte = decouperTexteIntelligent(texte);
        const motsClesArray: string[] = Array.isArray(mots_cles) ? mots_cles : [];

        const document = await base44.asServiceRole.entities.VenusDocument.create({
          titre: titre.substring(0, 200),
          description: (resume || '').substring(0, 500),
          categorie: categorie || 'SILGAPP',
          type_document: typeDocument,
          fichier_url: fichier_url || '',
          fichier_nom: fichier_nom || '',
          fichier_type_mime: mime,
          fichier_taille: texte.length,
          langue: langue || 'fr',
          mots_cles: JSON.stringify(motsClesArray),
          resume: resume || '',
          nb_chunks: chunksTexte.length,
          nb_pages: Math.ceil(texte.length / 3000),
          version: 1,
          auteur: auteur || 'admin',
          statut: 'valide',
          date_validation: new Date().toISOString(),
          valide_par: auteur || 'admin',
          historique: JSON.stringify([{ version: 1, auteur: auteur || 'admin', date: new Date().toISOString(), action: 'creation_import' }]),
          tags: JSON.stringify([]),
          pays: pays || 'ALL',
          version_precedente_id: '',
          is_latest_version: true,
          nb_consultations: 0,
          date_indexation: new Date().toISOString(),
        });

        for (let i = 0; i < chunksTexte.length; i++) {
          const chunkTexte = chunksTexte[i];
          const chunkMotsCles = chunkTexte.length > 100 ? motsClesArray.slice(0, 10) : [];
          const chunk = await base44.asServiceRole.entities.VenusDocumentChunk.create({
            document_id: document.id,
            document_titre: document.titre,
            document_version: document.version,
            document_categorie: document.categorie,
            document_statut: 'valide',
            document_pays: pays || 'ALL',
            chunk_index: i,
            contenu: chunkTexte,
            mots_cles: JSON.stringify(chunkMotsCles),
            langue: langue || 'fr',
            resume_section: chunkTexte.substring(0, 100),
            page_numero: Math.floor(i / 3) + 1,
            nb_consultations: 0,
          });
          await indexerMotsClesChunk(base44, chunk.id, chunkTexte, chunkMotsCles);
        }

        return Response.json({ success: true, document, nb_chunks: chunksTexte.length });
      }

      // ── Import massif de scénarios (traitement par lot) ──
      case 'import_massif_scenarios_batch': {
        const { scenarios, auteur } = body;
        if (!Array.isArray(scenarios) || scenarios.length === 0) {
          return Response.json({ success: false, error: 'scenarios (array) requis' }, { status: 400 });
        }

        const existingScenarios = await base44.asServiceRole.entities.VenusScenario.list('-created_date', 500);
        const existingNames = new Set<string>();
        const existingConvHashes = new Set<string>();
        for (const s of existingScenarios) {
          existingNames.add((s.nom || '').toLowerCase().trim());
          existingConvHashes.add((s.conversation || '').substring(0, 200));
        }

        const results: any[] = [];
        for (let i = 0; i < scenarios.length; i++) {
          const sc: any = scenarios[i];
          try {
            const nom = (sc.nom || `Scénario ${i + 1}`).substring(0, 200);
            const nomLower = nom.toLowerCase().trim();

            if (existingNames.has(nomLower)) {
              results.push({ index: i, status: 'ignored', reason: 'duplicate_name', nom });
              continue;
            }

            const convStr = typeof sc.conversation === 'string' ? sc.conversation : JSON.stringify(sc.conversation || []);
            const convHash = convStr.substring(0, 200);
            if (convHash && existingConvHashes.has(convHash)) {
              results.push({ index: i, status: 'ignored', reason: 'duplicate_conversation', nom });
              continue;
            }

            const created = await base44.asServiceRole.entities.VenusScenario.create({
              nom,
              description: (sc.description || '').substring(0, 500),
              categorie: sc.categorie || '',
              declencheurs: typeof sc.declencheurs === 'string' ? sc.declencheurs : JSON.stringify(sc.declencheurs || []),
              conversation: convStr,
              reponse_ideale: sc.reponse_ideale || '',
              outils_utilises: typeof sc.outils_utilises === 'string' ? sc.outils_utilises : JSON.stringify(sc.outils_utilises || []),
              resultat_attendu: sc.resultat_attendu || '',
              statut: sc.statut || 'brouillon',
              version: 1,
              auteur: auteur || 'admin',
            });

            existingNames.add(nomLower);
            if (convHash) existingConvHashes.add(convHash);
            results.push({ index: i, status: 'created', id: created.id, nom });
          } catch (e: any) {
            results.push({ index: i, status: 'error', error: e.message, nom: sc.nom || `Scénario ${i + 1}` });
          }
        }

        return Response.json({ success: true, results });
      }

      // ── Reconstruire l'index inversé complet ──
      case 'reconstruire_index': {
        const result = await construireIndexMotsCles(base44);
        return Response.json(result);
      }

      default:
        return Response.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    console.error('[indexerDocumentVenus] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});