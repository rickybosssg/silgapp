import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { course_id, nouvelle_date } = body;

    if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });
    if (!nouvelle_date) return Response.json({ error: 'nouvelle_date requis' }, { status: 400 });

    const asService = base44.asServiceRole;

    // ── Récupérer la course ──
    const course = await asService.entities.CourseExterne.get(course_id);
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

    // ── Valider que la course est programmable ──
    if (course.statut !== 'programmee') {
      return Response.json({ error: 'Seules les courses programmées peuvent être reprogrammées' }, { status: 403 });
    }

    // ── Valider l'autorisation : le client doit être le créateur ──
    const isOwner = course.client_user_email === user.email || course.created_by_id === user.id;
    if (!isOwner) {
      return Response.json({ error: 'Vous n êtes pas autorisé à modifier cette course' }, { status: 403 });
    }

    // ── Mettre à jour uniquement la date ──
    await asService.entities.CourseExterne.update(course_id, {
      date_souhaitee: nouvelle_date,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('[reprogrammerCourseClient] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}