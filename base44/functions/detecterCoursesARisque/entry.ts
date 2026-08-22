import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { computeCoursesARisque, syncAdminAlerts, loadRiskConfig } from '../../shared/coursesARisque.ts';

/**
 * DÉTECTEUR "COURSES À SAUVER" — Automation planifiée.
 *
 * Détecte les courses à risque en temps réel et synchronise les alertes admin.
 * Ne modifie jamais les courses, livreurs, ou le dispatch V2.
 * Crée/archive uniquement des AdminInboxItem.
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // Auth : autoriser les appels automation (pas de user context) + appels manuels admin
    const user = await base44.auth.me().catch(() => null);
    const isManualCall = !!user;
    if (isManualCall && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const config = await loadRiskConfig(base44);
    const { courses, total } = await computeCoursesARisque(base44);

    // Synchroniser les alertes AdminInboxItem
    await syncAdminAlerts(base44, courses, config);

    const critiqueCount = courses.filter(c => c.niveau === 'critique').length;
    const surveillerCount = courses.filter(c => c.niveau === 'a_surveiller').length;

    console.log(`[COURSES_A_RISQUE] ${total} course(s) à risque (${critiqueCount} critiques, ${surveillerCount} à surveiller)`);

    return Response.json({
      success: true,
      total,
      critiques: critiqueCount,
      a_surveiller: surveillerCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[COURSES_A_RISQUE] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}