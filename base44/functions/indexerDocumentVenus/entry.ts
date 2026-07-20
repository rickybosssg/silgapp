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