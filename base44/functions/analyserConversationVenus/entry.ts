import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { analyserConversation } from '../../shared/venusImprovementEngine.ts';

/**
 * Analyse automatiquement une conversation VENUS après chaque interaction.
 * Déclenché par:
 * 1. Entity automation sur VenusInteraction create
 * 2. Appel manuel depuis l'admin
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // ── Mode 1: Entity automation (payload avec event) ──
    if (body.event && body.event.type === 'create' && body.event.entity_name === 'VenusInteraction') {
      const interaction = body.data;
      if (!interaction) {
        return Response.json({ error: 'Données interaction manquantes' }, { status: 400 });
      }
      console.log(`[analyserConversationVenus] Analyse de l'interaction ${interaction.id}`);
      const analysis = await analyserConversation(base44, interaction);
      return Response.json({ success: true, analysis_id: analysis?.id });
    }

    // ── Mode 2: Analyse rétroactive de toutes les interactions non analysées ──
    if (body.action === 'analyser_toutes_recentes') {
      const limit = body.limit || 50;
      const interactions = await base44.asServiceRole.entities.VenusInteraction.filter(
        {}, '-created_date', limit
      );

      let analysed = 0;
      for (const interaction of interactions) {
        // Vérifier si déjà analysée
        const existing = await base44.asServiceRole.entities.VenusConversationAnalysis.filter(
          { interaction_id: interaction.id }
        );
        if (existing && existing.length > 0) continue;

        await analyserConversation(base44, interaction);
        analysed++;
      }

      return Response.json({ success: true, analysed, total: interactions.length });
    }

    // ── Mode 3: Analyse d'une interaction spécifique ──
    if (body.action === 'analyser' && body.interaction_id) {
      const interaction = await base44.asServiceRole.entities.VenusInteraction.get(body.interaction_id);
      if (!interaction) {
        return Response.json({ error: 'Interaction non trouvée' }, { status: 404 });
      }
      const analysis = await analyserConversation(base44, interaction);
      return Response.json({ success: true, analysis_id: analysis?.id });
    }

    return Response.json({ error: 'Action non reconnue' }, { status: 400 });
  } catch (error) {
    console.error(`[analyserConversationVenus] Erreur: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});