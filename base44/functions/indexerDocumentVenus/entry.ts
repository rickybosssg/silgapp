import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  indexerDocumentComplet,
  indexerTexteDirect,
  rechercherDocumentsRag,
  getStatistiquesDocuments,
  getHistoriqueVersions,
  restaurerVersion,
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

      default:
        return Response.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    console.error('[indexerDocumentVenus] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});