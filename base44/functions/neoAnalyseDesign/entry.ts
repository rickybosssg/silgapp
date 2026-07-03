import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Accès admin requis' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const snippets = body?.snippets || [];

    if (snippets.length === 0) {
      return Response.json({ error: 'Aucun snippet de code fourni' }, { status: 400 });
    }

    // ── Construire le contexte code ──
    let codeContext = '';
    for (const s of snippets) {
      codeContext += `\n\n=== ${s.filename} ===\n${s.content.slice(0, 8000)}`;
    }

    const prompt = `Tu es NEO, le moteur d'amélioration continue de SILGAPP, une plateforme de livraison en Afrique de l'Ouest.
Tu es un expert en design UI/UX, Tailwind CSS et React.

Voici le CODE SOURCE RÉEL de plusieurs pages clés de l'application :
${codeContext}

Analyse CONCRÈTE et SPÉCIFIQUE du design. Pour chaque recommandation tu DOIS :
1. Citer le nom du fichier ET la section/composant exact concerné
2. Décrire ce qui est visuellement problématique (couleur, espacement, typographie, hiérarchie, alignment, contraste, densité)
3. Donner la solution en classes Tailwind PRÉCISES à changer (ex: "remplacer bg-gray-100 par bg-white", "ajouter shadow-sm", "augmenter py-3 à py-5")
4. Expliquer le bénéfice visuel attendu

Sois extrêmement précis et actionnable. Ne donne JAMAIS de recommandation générique comme "améliorer le design". 
Donne des recommandations qu'un développeur peut appliquer immédiatement en modifiant des classes Tailwind.

Catégories possibles: design, ux
Priorités: critique | elevee | moyenne | faible

Réponds en français avec un schema JSON.`;

    const llmRaw = await base44.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: "object",
        properties: {
          score_design: { type: "number", description: "Score design sur 100" },
          resume: { type: "string" },
          recommandations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                titre: { type: "string" },
                fichier: { type: "string", description: "Nom du fichier concerné" },
                section: { type: "string", description: "Section/composant exact" },
                priorite: { type: "string" },
                probleme: { type: "string", description: "Description visuelle précise du problème" },
                solution: { type: "string", description: "Classes Tailwind précises à changer/ajouter" },
                benefice: { type: "string" }
              }
            }
          }
        }
      }
    });

    let llmResponse = llmRaw;
    if (typeof llmRaw === "string") {
      try { llmResponse = JSON.parse(llmRaw); } catch (_) { llmResponse = {}; }
    }
    if (llmResponse?.data && typeof llmResponse.data === "object") llmResponse = llmResponse.data;
    if (llmResponse?.response && typeof llmResponse.response === "object") llmResponse = llmResponse.response;

    // ── Sauvegarder les recommandations dans NeoRecommendation ──
    const recs = Array.isArray(llmResponse?.recommandations) ? llmResponse.recommandations : [];
    const now = new Date().toISOString();

    const recsToCreate = recs.map(r => ({
      analyse_id: 'design_analysis',
      titre: r.titre || 'Recommandation design',
      categorie: 'design',
      priorite: r.priorite || 'moyenne',
      effort_estime: 'rapide',
      impact_estime: 'moyen',
      probleme: `[${r.fichier || '?'} → ${r.section || '?'}] ${r.probleme || ''}`,
      raison: '',
      impact: '',
      solution: r.solution || '',
      benefices: r.benefice || '',
      statut: 'nouvelle',
      date_creation: now,
    }));

    if (recsToCreate.length > 0) {
      await base44.asServiceRole.entities.NeoRecommendation.bulkCreate(recsToCreate);
    }

    return Response.json({
      success: true,
      score_design: llmResponse?.score_design || 0,
      resume: llmResponse?.resume || 'Analyse design terminée',
      recommandations: recs,
      nb_recommandations: recs.length,
      fichiers_analyses: snippets.map(s => s.filename),
      date_analyse: now,
      lance_par: user.email,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});