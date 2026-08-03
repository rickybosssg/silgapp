import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Rappel de prise en charge — Envoie une notification push aux livreurs
 * qui ont accepté une course il y a plus de 30 minutes sans récupérer le colis.
 *
 * Statuts concernés (course acceptée mais colis non récupéré) :
 * - livreur_en_route
 * - client_contacte (workflow admin)
 * - en_route_expediteur (workflow admin)
 * - arrive_prise_en_charge
 *
 * Évite les doublons : vérifie qu'aucune notification 'rappel_prise_en_charge'
 * n'existe déjà pour la même course.
 */
const DELAI_MINUTES = 30;
const STATUTS_CONCERNES = [
  'livreur_en_route',
  'client_contacte',
  'en_route_expediteur',
  'arrive_prise_en_charge',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Récupérer toutes les courses avec un livreur assigné et un statut concerné
    const courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { livreur_id: { $ne: null } },
      '-created_date',
      500
    );

    const now = Date.now();
    const seuilMs = DELAI_MINUTES * 60 * 1000;

    // Filtrer : acceptation > 30 min, pas de récupération, statut concerné
    const coursesEnRetard = (courses || []).filter((c) => {
      if (!c.heure_acceptation) return false;
      if (c.heure_recuperation) return false;
      if (!STATUTS_CONCERNES.includes(c.statut)) return false;
      const tempsEcoule = now - new Date(c.heure_acceptation).getTime();
      return tempsEcoule >= seuilMs;
    });

    if (coursesEnRetard.length === 0) {
      console.log('[rappelPriseEnCharge] Aucune course en retard de prise en charge');
      return Response.json({ success: true, rappels_envoyes: 0 });
    }

    // Vérifier les notifications déjà envoyées pour éviter les doublons
    const courseIds = coursesEnRetard.map((c) => c.id);
    const notifsExistantes = await base44.asServiceRole.entities.Notification.filter(
      { type: 'rappel_prise_en_charge' },
      '-created_date',
      500
    );
    const dejaNotifie = new Set(
      (notifsExistantes || [])
        .filter((n) => n.course_id && courseIds.includes(n.course_id))
        .map((n) => n.course_id)
    );

    const coursesARappeler = coursesEnRetard.filter((c) => !dejaNotifie.has(c.id));

    console.log(`[rappelPriseEnCharge] ${coursesEnRetard.length} courses en retard, ${coursesARappeler.length} à rappeler`);

    // Envoyer les notifications
    const resultats = await Promise.all(
      coursesARappeler.map(async (course) => {
        try {
          // Récupérer l'email du livreur
          const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id).catch(() => null);
          if (!livreur || !livreur.user_email) {
            console.warn(`[rappelPriseEnCharge] Livreur ${course.livreur_id} sans email — course ${course.id}`);
            return { course_id: course.id, success: false, error: 'livreur_sans_email' };
          }

          const res = await base44.functions.invoke('envoiNotificationPush', {
            titre: '🚨 Accélérez la course',
            message: 'Votre course est trop lente. Merci de récupérer le colis au plus vite pour éviter tout retard de livraison.',
            type: 'rappel_prise_en_charge',
            destinataire_email: livreur.user_email,
            livreur_id: course.livreur_id,
            course_id: course.id,
            category: 'rappel_prise_en_charge',
            personalize: false,
          });

          return { course_id: course.id, success: true, notif_data: res?.data || res };
        } catch (err) {
          console.error(`[rappelPriseEnCharge] Erreur course ${course.id}:`, err.message);
          return { course_id: course.id, success: false, error: err.message };
        }
      })
    );

    const envoyes = resultats.filter((r) => r.success).length;
    console.log(`[rappelPriseEnCharge] ${envoyes}/${coursesARappeler.length} rappels envoyés`);

    return Response.json({
      success: true,
      courses_en_retard: coursesEnRetard.length,
      rappels_envoyes: envoyes,
      rappels_echoues: resultats.length - envoyes,
      details: resultats,
    });
  } catch (error) {
    console.error('[rappelPriseEnCharge] Erreur fatale:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});