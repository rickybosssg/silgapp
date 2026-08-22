import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { computeCoursesARisque, computeRiskStats } from '../../shared/coursesARisque.ts';

/**
 * getCoursesARisque — Retourne la liste des courses à risque + statistiques.
 * Appelé par le frontend admin (page Courses à sauver).
 * Calcule le risque en TEMPS RÉEL — pas de persistance.
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { courses, total } = await computeCoursesARisque(base44);
    const stats = await computeRiskStats(base44);

    return Response.json({
      success: true,
      courses,
      total,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[GET_COURSES_A_RISQUE] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}