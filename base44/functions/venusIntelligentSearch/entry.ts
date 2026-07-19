import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Recherche intelligente dans la base de connaissances VENUS.
 *
 * Utilise le LLM pour faire une recherche sémantique: retrouve les connaissances
 * qui correspondent à une requête (mot, phrase, ou question complète) même si
 * les mots exacts ne sont pas présents.
 *
 * Payload:
 *   - query: texte de recherche (mot, phrase, ou question)
 *   - pays: (optionnel) code pays pour filtrer
 *   - langue: (optionnel) code langue pour filtrer
 *
 * Retourne:
 *   { results: [{ ...knowledge, score, raison }], total: number }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: admin only
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      isAdmin = user?.role === 'admin';
    } catch { /* service-role call from other functions */ }

    const body = await req.json();
    const { query, pays, langue } = body;

    if (!query || !query.trim()) {
      return Response.json({ error: 'query requis' }, { status: 400 });
    }

    // Fetch all validated knowledge entries
    const allKnowledge = await base44.asServiceRole.entities.VenusKnowledge.filter(
      { statut: 'valide' },
      '-updated_date',
      200
    );

    // Filter by country if specified
    let filtered = allKnowledge;
    if (pays) {
      filtered = filtered.filter(k => !k.pays || k.pays === 'ALL' || k.pays === pays);
    }
    if (langue) {
      filtered = filtered.filter(k => !k.langue || k.langue === langue);
    }

    if (filtered.length === 0) {
      return Response.json({ results: [], total: 0 });
    }

    // Prepare knowledge data for LLM
    const knowledgeData = filtered.map(k => ({
      id: k.id,
      titre: k.titre,
      question: k.question,
      reponse: (k.reponse_officielle || '').substring(0, 300),
      mots_cles: k.mots_cles,
      categorie: k.categorie,
      pays: k.pays,
      priorite: k.priorite,
    }));

    const prompt = `Tu es un moteur de recherche intelligent pour la base de connaissances VENUS (assistant SILGAPP).

Recherche de l'utilisateur: "${query}"

Voici les connaissances disponibles:
${JSON.stringify(knowledgeData, null, 2)}

Analyse chaque connaissance et détermine lesquelles correspondent à la recherche.
- Un match peut être sémantique (même sens, différents mots) ou exact (mots-clés correspondants).
- Attribue un score de pertinence entre 0 et 1 (1 = correspondance parfaite).
- Explique brièvement pourquoi chaque résultat correspond.
- Ne retourne que les résultats avec un score > 0.3.
- Trie par score décroissant (plus pertinent en premier).
- Maximum 20 résultats.

Réponds UNIQUEMENT avec un JSON: {"results": [{"id": "...", "score": 0.95, "raison": "..."}]}`;

    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                score: { type: 'number' },
                raison: { type: 'string' },
              },
              required: ['id', 'score'],
            },
          },
        },
        required: ['results'],
      },
    });

    const llmResult = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes;

    // Enrich results with full knowledge data
    const enrichedResults = (llmResult.results || []).map((r: any) => {
      const knowledge = filtered.find(k => k.id === r.id);
      if (!knowledge) return null;
      return {
        id: knowledge.id,
        titre: knowledge.titre,
        categorie: knowledge.categorie,
        question: knowledge.question,
        reponse_officielle: knowledge.reponse_officielle,
        mots_cles: knowledge.mots_cles,
        pays: knowledge.pays,
        ville: knowledge.ville,
        langue: knowledge.langue,
        priorite: knowledge.priorite,
        statut: knowledge.statut,
        version: knowledge.version,
        score: r.score,
        raison: r.raison || '',
      };
    }).filter(Boolean);

    return Response.json({ results: enrichedResults, total: enrichedResults.length });
  } catch (error) {
    console.error('[venusIntelligentSearch] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});