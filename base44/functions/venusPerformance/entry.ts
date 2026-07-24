/**
 * venusPerformance — Backend function for VENUS performance monitoring & load testing
 *
 * Actions:
 *  - get_dashboard: returns cache stats, queue stats, recent metrics, active suggestions
 *  - get_metrics: returns filtered metrics (by type, composant, period)
 *  - flush_metrics: forces metric buffer flush to DB
 *  - detect_optimizations: runs optimization detection
 *  - launch_load_test: triggers a load test simulation
 *  - get_load_tests: returns load test history
 *  - get_queue_stats: returns queue statistics
 *  - clear_cache: clears cache by pattern or all
 *  - record_metric: records a single metric (for external callers)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  getCacheStats,
  cacheInvalidateByPattern,
  flushMetrics,
  detecterOptimisations,
  lancerTestDeCharge,
  getQueueStats,
  recordMetric,
} from '../../shared/venusPerformanceEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Accès admin requis' }, { status: 403 });

    const body = await req.json();
    const { action, ...params } = body;

    switch (action) {
      case 'get_dashboard': {
        const [cacheStats, queueStats] = await Promise.all([
          Promise.resolve(getCacheStats()),
          getQueueStats(base44),
        ]);

        const recentMetrics = await base44.asServiceRole.entities.VenusMetric.list('-timestamp', 100);

        const latences = recentMetrics.filter(m => m.type_metric === 'latence');
        const avgLatency = latences.length > 0
          ? Math.round(latences.reduce((a, m) => a + m.valeur, 0) / latences.length)
          : 0;
        const maxLatency = latences.length > 0 ? Math.max(...latences.map(m => m.valeur)) : 0;
        const errors = recentMetrics.filter(m => m.type_metric === 'erreur').length;

        const suggestions = await base44.asServiceRole.entities.VenusOptimizationSuggestion.filter(
          { statut: 'active' }, '-creee_date', 20
        );

        const loadTests = await base44.asServiceRole.entities.VenusLoadTest.list('-date_debut', 5);

        return Response.json({
          success: true,
          cache: cacheStats,
          queue: queueStats,
          metrics: {
            avg_latency_ms: avgLatency,
            max_latency_ms: maxLatency,
            errors_24h: errors,
            total_metrics: recentMetrics.length,
          },
          suggestions: suggestions.slice(0, 10),
          loadTests: loadTests.slice(0, 5),
        });
      }

      case 'get_metrics': {
        const { type_metric, composant, limit } = params;
        const filter = {};
        if (type_metric) filter.type_metric = type_metric;
        if (composant) filter.composant = composant;
        const metrics = await base44.asServiceRole.entities.VenusMetric.filter(
          filter, '-timestamp', limit || 100
        );
        return Response.json({ success: true, metrics });
      }

      case 'flush_metrics': {
        await flushMetrics(base44);
        return Response.json({ success: true, message: 'Metrics flushed' });
      }

      case 'detect_optimizations': {
        const suggestions = await detecterOptimisations(base44);
        return Response.json({ success: true, suggestions, count: suggestions.length });
      }

      case 'launch_load_test': {
        const { nb_users, duration_seconds } = params;
        const nbUsers = Number(nb_users) || 100;
        const duration = Number(duration_seconds) || 60;
        const testId = await lancerTestDeCharge(base44, nbUsers, duration, user.email || 'admin');
        return Response.json({ success: true, test_id: testId, nb_users: nbUsers, duration_seconds: duration });
      }

      case 'get_load_tests': {
        const tests = await base44.asServiceRole.entities.VenusLoadTest.list('-date_debut', 20);
        return Response.json({ success: true, tests });
      }

      case 'get_queue_stats': {
        const stats = await getQueueStats(base44);
        return Response.json({ success: true, stats });
      }

      case 'clear_cache': {
        const { pattern } = params;
        const cleared = pattern
          ? cacheInvalidateByPattern(pattern)
          : cacheInvalidateByPattern('');
        return Response.json({ success: true, cleared });
      }

      case 'record_metric': {
        const { type_metric, composant, valeur, unite, metadata } = params;
        recordMetric(type_metric, composant, Number(valeur), unite, metadata);
        return Response.json({ success: true });
      }

      default:
        return Response.json({ success: false, error: 'Action non reconnue' });
    }
  } catch (error) {
    console.error('[venusPerformance] Error:', error.message);
    return Response.json({ success: false, error: error.message });
  }
});