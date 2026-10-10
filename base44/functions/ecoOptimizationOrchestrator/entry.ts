import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  acceptEcoMission,
  convertDueEcoCourses,
  createOnRouteProposal,
  expirePendingProposals,
  invalidatePendingProposals,
  processEcoCourseCreated,
  respondToOnRouteProposal,
} from '../../shared/ecoOptimizationEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action || 'health';

    if (action === 'course_created') {
      return Response.json(await processEcoCourseCreated(base44, body.course_id));
    }
    if (action === 'convert_due') {
      return Response.json(await convertDueEcoCourses(base44, body.country_code, body.limit || 50));
    }
    if (action === 'expire_proposals') {
      return Response.json(await expirePendingProposals(base44, body.country_code, body.limit || 200));
    }
    if (action === 'invalidate_pending') {
      return Response.json(await invalidatePendingProposals(base44, body.country_code, body.reason || 'engine_disabled'));
    }
    if (action === 'create_on_route_proposal') {
      return Response.json(await createOnRouteProposal(base44, body.course_id, body.livreur_id));
    }
    if (action === 'respond_proposal') {
      return Response.json(await respondToOnRouteProposal(base44, body.proposal_id, body.livreur_id, body.response));
    }
    if (action === 'accept_eco_mission') {
      return Response.json(await acceptEcoMission(base44, body.mission_id, body.livreur_id));
    }

    return Response.json({ success: true, service: 'ecoOptimizationOrchestrator', actions: ['course_created', 'convert_due', 'expire_proposals', 'invalidate_pending', 'create_on_route_proposal', 'respond_proposal', 'accept_eco_mission'] });
  } catch (error) {
    console.error('[EcoOrchestrator] Fatal:', error?.message || String(error));
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
});

