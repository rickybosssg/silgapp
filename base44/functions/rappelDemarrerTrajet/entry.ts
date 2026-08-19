import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Rappel « Démarrer le trajet » — Envoie une notification push au livreur
 * dont la course est restée au statut `client_contacte` plus de 10 minutes
 * sans passer à `en_route_expediteur`.
 *
 * Cible UNIQUEMENT le workflow administratif (source = admin) où l'étape
 * « Client contacté » est un point de contrôle manuel avant le départ.
 *
 * Anti-doublon : vérifie qu'aucune notification 'rappel_demarrer_trajet'
 * n'existe déjà pour la même course.
 */
const DELAI_MINUTES = 10;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { statut: 'client_contacte', livreur_id: { $ne: null } },
      '-created_date',
      500
    );

    const now = Date.now();
    const seuilMs = DELAI_MINUTES * 60 * 1000;

    const coursesEnRetard = (courses || []).filter((c) => {
      const reference = c.heure_contact_client || c.heure_acceptation || c.updated_date;
      if (!reference) return false;
      return (now - new Date(reference).getTime()) >= seuilMs;
    });

    if (coursesEnRetard.length === 0) {
      console.log('[rappelDemarrerTrajet] Aucune course bloquée à client_contacté');
      return Response.json({ success: true, rappels_envoyes: 0 });
    }

    const courseIds = coursesEnRetard.map((c) => c.id);
    const notifsExistantes = await base44.asServiceRole.entities.Notification.filter(
      { type: 'rappel_demarrer_trajet' },
      '-created_date',
      500
    );
    const dejaNotifie = new Set(
      (notifsExistantes || [])
        .filter((n) => n.course_id && courseIds.includes(n.course_id))
        .map((n) => n.course_id)
    );

    const coursesARappeler = coursesEnRetard.filter((c) => !dejaNotifie.has(c.id));

    console.log(`[rappelDemarrerTrajet] ${coursesEnRetard.length} courses en retard, ${coursesARappeler.length} à rappeler`);

    const resultats = await Promise.all(
      coursesARappeler.map(async (course) => {
        try {
          const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id).catch(() => null);
          if (!livreur || !livreur.user_email) {
            console.warn(`[rappelDemarrerTrajet] Livreur ${course.livreur_id} sans email — course ${course.id}`);
            return { course_id: course.id, success: false, error: 'livreur_sans_email' };
          }

          const res = await base44.functions.invoke('envoiNotificationPush', {
            titre: '🛵 Démarrez votre trajet',
            message: 'Vous avez contacté le client. Démarrez maintenant votre trajet vers l\'expéditeur pour récupérer le colis.',
            type: 'rappel_demarrer_trajet',
            destinataire_email: livreur.user_email,
            livreur_id: course.livreur_id,
            course_id: course.id,
            category: 'rappel_demarrer_trajet',
            personalize: false,
          });

          return { course_id: course.id, success: true, notif_data: res?.data || res };
        } catch (err) {
          console.error(`[rappelDemarrerTrajet] Erreur course ${course.id}:`, err.message);
          return { course_id: course.id, success: false, error: err.message };
        }
      })
    );

    const envoyes = resultats.filter((r) => r.success).length;
    console.log(`[rappelDemarrerTrajet] ${envoyes}/${coursesARappeler.length} rappels envoyés`);

    return Response.json({
      success: true,
      courses_en_retard: coursesEnRetard.length,
      rappels_envoyes: envoyes,
      rappels_echoues: resultats.length - envoyes,
      details: resultats,
    });
  } catch (error) {
    console.error('[rappelDemarrerTrajet] Erreur fatale:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});