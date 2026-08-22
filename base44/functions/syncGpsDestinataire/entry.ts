import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { course_ids, latitude, longitude } = body;

    if (!Array.isArray(course_ids) || course_ids.length === 0) {
      return Response.json({ error: 'course_ids (array) requis' }, { status: 400 });
    }
    if (latitude == null || longitude == null) {
      return Response.json({ error: 'latitude et longitude requis' }, { status: 400 });
    }

    const asService = base44.asServiceRole;

    // ── Récupérer le profil client du user ──
    const clients = await asService.entities.ClientExterne.filter({ user_email: user.email });
    const clientId = clients?.[0]?.id;

    // ── Filtrer les courses autorisées ──
    const authorizedIds = [];
    for (const cid of course_ids) {
      const course = await asService.entities.CourseExterne.get(cid);
      if (!course) continue;
      const isAuthorized =
        course.client_user_email === user.email ||
        course.created_by_id === user.id ||
        (clientId && course.destinataire_client_id === clientId);
      if (isAuthorized && !['livree', 'annulee'].includes(course.statut)) {
        authorizedIds.push(cid);
      }
    }

    if (authorizedIds.length === 0) {
      return Response.json({ success: true, updated: 0, message: 'Aucune course autorisée à mettre à jour' });
    }

    // ── Bulk update GPS arrivée ──
    const updates = authorizedIds.map(id => ({
      id,
      gps_arrivee_lat: latitude,
      gps_arrivee_lng: longitude,
    }));
    await asService.entities.CourseExterne.bulkUpdate(updates);

    return Response.json({ success: true, updated: authorizedIds.length });
  } catch (error) {
    console.error('[syncGpsDestinataire] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}