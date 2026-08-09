import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { recalculateStatsForCourseContacts } from "../../shared/crmEngine.ts";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

    const body = await req.json();
    const { course_id, course_data, country_code } = body || {};

    if (!course_data || !country_code) {
      return Response.json({ error: 'course_data et country_code requis' }, { status: 400 });
    }

    // Recalcule les stats pour les 3 contacts de la course
    const results = await recalculateStatsForCourseContacts(base44, course_data, country_code);

    // Marque la course comme synchronisée CRM
    if (course_id) {
      try {
        await base44.asServiceRole.entities.CourseExterne.update(course_id, { crm_stats_synced: true });
      } catch {}
    }

    return Response.json({
      success: true,
      clients_updated: results.length,
      results: results.map(r => ({ id: r?.id, telephone_normalized: r?.telephone_normalized, nb_courses: r?.nb_courses_total })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}