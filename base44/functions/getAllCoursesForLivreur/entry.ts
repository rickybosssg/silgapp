import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { livreur_id } = await req.json();

    if (!livreur_id) {
      return Response.json({ error: 'livreur_id requis' }, { status: 400 });
    }

    const allCourses = await base44.asServiceRole.entities.CourseExterne.list('-created_date', 100);

    const coursesPourLivreur = allCourses.filter((course) => {
      if (String(course.livreur_id || '') === String(livreur_id)) return true;

      if (course.dispatch_status === 'propose' && !course.livreur_id && course.dispatch_notified_ids) {
        try {
          const notifiedIds = JSON.parse(course.dispatch_notified_ids);
          return Array.isArray(notifiedIds) && notifiedIds.map(String).includes(String(livreur_id));
        } catch (_) {
          return false;
        }
      }

      return false;
    });

    return Response.json({
      success: true,
      courses: coursesPourLivreur,
      total: coursesPourLivreur.length,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});
