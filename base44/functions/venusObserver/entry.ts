/**
 * venusObserver — Backend function for VENUS Observer Engine
 *
 * Runs observation cycles to monitor courses, drivers, partners, payments
 * and triggers automated actions based on automation rules.
 *
 * Actions:
 *  - run_cycle: Run a full observation cycle
 *  - get_observations: Get recent observations
 *  - get_active_alerts: Get active alerts from observations
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { runObservationCycle } from '../../shared/venusObserverEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Accès admin requis' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    switch (action) {
      case 'run_cycle': {
        const observations = await runObservationCycle(base44);
        return Response.json({
          success: true,
          observations,
          count: observations.length,
          critical: observations.filter(o => o.severity === 'critique').length,
          high: observations.filter(o => o.severity === 'haute').length,
        });
      }

      case 'get_observations': {
        const actions = await base44.asServiceRole.entities.VenusAgentAction.filter(
          { type_action: 'auto_notification' }, '-date_creation', 50
        );
        return Response.json({ success: true, observations: actions });
      }

      case 'get_active_alerts': {
        const alerts = await base44.asServiceRole.entities.VenusSupervisionAlert.filter(
          { statut: 'active' }, '-creee_date', 30
        );
        return Response.json({ success: true, alerts });
      }

      default: {
        // Default: run observation cycle
        const observations = await runObservationCycle(base44);
        return Response.json({
          success: true,
          observations,
          count: observations.length,
        });
      }
    }
  } catch (error) {
    console.error('[venusObserver] Error:', error.message);
    return Response.json({ success: false, error: error.message });
  }
});