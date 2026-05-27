import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Accès réservé aux admins' }, { status: 403 });
    }

    // Nettoyer les courses fantômes (orphelines, sans livreur, statut incohérent)
    const body = await req.json().catch(() => ({}));
    const { dry_run = true } = body;

    // 1. Courses sans livreur depuis > 24h avec statut "recherche_livreur"
    const coursesOrphelines = await base44.asServiceRole.entities.CourseExterne.filter({});
    const now = new Date().getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    const aNettoyer = (coursesOrphelines || []).filter(c => {
      const age = now - new Date(c.created_date).getTime();
      return (
        !c.livreur_id &&
        c.statut === "recherche_livreur" &&
        age > twentyFourHours
      );
    });

    // 2. Notifications orphelines (course supprimée ou inexistante)
    const notifications = await base44.asServiceRole.entities.Notification.filter({});
    const courseIds = new Set((coursesOrphelines || []).map(c => c.id));
    
    const notificationsOrphelines = (notifications || []).filter(n => {
      return n.course_id && !courseIds.has(n.course_id);
    });

    if (dry_run) {
      return Response.json({
        success: true,
        dry_run: true,
        courses_fantomes: aNettoyer.length,
        notifications_orphelines: notificationsOrphelines.length,
        details: {
          courses: aNettoyer.map(c => ({ id: c.id, statut: c.statut, age_heures: Math.round((now - new Date(c.created_date).getTime()) / 3600000) })),
          notifications: notificationsOrphelines.map(n => ({ id: n.id, course_id: n.course_id, type: n.type })),
        },
      });
    }

    // Suppression effective
    if (aNettoyer.length > 0) {
      await Promise.all(
        aNettoyer.map(c => base44.asServiceRole.entities.CourseExterne.delete(c.id))
      );
    }

    if (notificationsOrphelines.length > 0) {
      await Promise.all(
        notificationsOrphelines.map(n => base44.asServiceRole.entities.Notification.delete(n.id))
      );
    }

    // Nettoyer localStorage (via notification aux clients)
    // Ceci sera géré par le frontend lors du prochain chargement

    return Response.json({
      success: true,
      dry_run: false,
      courses_supprimees: aNettoyer.length,
      notifications_supprimees: notificationsOrphelines.length,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});