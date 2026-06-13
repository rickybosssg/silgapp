import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Statuts de course considérés comme "active"
const STATUTS_ACTIFS = ["livreur_en_route", "colis_recupere", "en_livraison", "recherche_livreur"];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Accès réservé aux admins' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { livreur_id } = body;

    if (livreur_id) {
      // Resync un livreur spécifique
      const [livreurs, courses] = await Promise.all([
        base44.asServiceRole.entities.Livreur.filter({ id: livreur_id }),
        base44.asServiceRole.entities.CourseExterne.filter({ livreur_id }),
      ]);

      const livreur = livreurs?.[0];
      if (!livreur) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });

      const courseActive = (courses || []).find(c => STATUTS_ACTIFS.includes(c.statut));

      if (!courseActive && livreur.statut === "en_course") {
        const heartbeatAge = livreur.last_seen_at
          ? (Date.now() - new Date(livreur.last_seen_at).getTime()) / 60000
          : 999;
        const nouveauStatut = heartbeatAge < 10 ? "disponible" : "hors_ligne";
        await base44.asServiceRole.entities.Livreur.update(livreur.id, { statut: nouveauStatut });
        return Response.json({ success: true, action: "resync", livreur_id, nouveau_statut: nouveauStatut });
      }

      return Response.json({ success: true, action: "aucune_action", statut_actuel: livreur.statut, course_active: courseActive?.id || null });
    }

    // Resync global : tous les livreurs externes en_course sans course active
    const [tousLivreurs, toutesCoursesActives] = await Promise.all([
      base44.asServiceRole.entities.Livreur.filter({ reseau: "externe", statut: "en_course" }),
      base44.asServiceRole.entities.CourseExterne.filter({}, "-created_date", 200),
    ]);

    const coursesActives = (toutesCoursesActives || []).filter(c => STATUTS_ACTIFS.includes(c.statut));
    const livreurIdsAvecCourse = new Set(coursesActives.map(c => c.livreur_id).filter(Boolean));

    const aResynchroniser = (tousLivreurs || []).filter(l => !livreurIdsAvecCourse.has(l.id));

    if (aResynchroniser.length === 0) {
      return Response.json({ success: true, resynchronises: 0, message: "Tous les statuts sont corrects." });
    }

    // Appliquer la logique heartbeat : app active → disponible, sinon → hors_ligne
    await Promise.all(
      aResynchroniser.map(l => {
        const heartbeatAge = l.last_seen_at
          ? (Date.now() - new Date(l.last_seen_at).getTime()) / 60000
          : 999;
        const nouveauStatut = heartbeatAge < 10 ? "disponible" : "hors_ligne";
        console.log(`[resyncLivreurStatut] ${l.prenom} ${l.nom} → "${nouveauStatut}" (heartbeat: ${Math.round(heartbeatAge)}min)`);
        return base44.asServiceRole.entities.Livreur.update(l.id, { statut: nouveauStatut });
      })
    );

    return Response.json({
      success: true,
      resynchronises: aResynchroniser.length,
      livreurs: aResynchroniser.map(l => ({ id: l.id, nom: l.nom, prenom: l.prenom })),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});