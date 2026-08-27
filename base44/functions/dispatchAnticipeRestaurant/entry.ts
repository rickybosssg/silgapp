import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ═══════════════════════════════════════════════════════════════════════════
// DISPATCH ANTICIPÉ RESTAURANT — Automation programmée
// ═══════════════════════════════════════════════════════════════════════════
//
// Surveille les courses restaurant créées en avance (dispatch_status = en_attente)
// et déclenche le dispatch V2 quand now >= dispatch_at.
//
// Ne modifie PAS dispatchV2.ts — utilise dispatchExterneAuto(lancer_recherche_auto)
// qui appelle publierCourseDansFil (moteur V2 figé intact).
//
// Idempotence garantie par la garde atomique dans publierCourseDansFil :
//   updateMany({ dispatch_status: { $nin: ['disponible_push', 'accepte', 'propose', 'redispatch'] } })
//   → si la course est déjà publiée, le updateMany ne modifie rien.
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const asService = base44.asServiceRole;

    // ── Trouver les courses en attente (dispatch_status = en_attente) ──
    const courses = await asService.entities.CourseExterne.filter({
      dispatch_status: 'en_attente',
    }, '-created_date', 50).catch(() => []);

    if (!courses || courses.length === 0) {
      return Response.json({ success: true, processed: 0, reason: 'no_courses' });
    }

    // ── Filtrer : commande_restaurant_id défini + dispatch_at défini + now >= dispatch_at ──
    const now = Date.now();
    const toDispatch = courses.filter(c => {
      if (!c.commande_restaurant_id || c.commande_restaurant_id === '') return false;
      if (!c.dispatch_at) return false;
      return now >= new Date(c.dispatch_at).getTime();
    });

    if (toDispatch.length === 0) {
      return Response.json({ success: true, processed: 0, reason: 'no_courses_ready', total_pending: courses.length });
    }

    // ── Limiter à 10 courses par tick (anti rate-limit) ──
    const MAX_PER_TICK = 10;
    const coursesToProcess = toDispatch.slice(0, MAX_PER_TICK);

    const results = [];
    for (const course of coursesToProcess) {
      try {
        const result = await asService.functions.invoke('dispatchExterneAuto', {
          action: 'lancer_recherche_auto',
          course_id: course.id,
        });
        results.push({ course_id: course.id, success: true, result });
        console.log(`[dispatchAnticipeRestaurant] ✅ Course ${course.id} dispatchée (dispatch_at atteint)`);
      } catch (err) {
        results.push({ course_id: course.id, success: false, error: err?.message || String(err) });
        console.error(`[dispatchAnticipeRestaurant] ❌ Erreur course ${course.id}: ${err?.message}`);
      }
      // Délai minimal entre courses
      await new Promise(r => setTimeout(r, 200));
    }

    return Response.json({
      success: true,
      processed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      total_pending: toDispatch.length,
      results,
    });
  } catch (error) {
    console.error('[dispatchAnticipeRestaurant] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});