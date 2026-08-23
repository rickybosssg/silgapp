import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Création sécurisée d'une course administrative.
 *
 * Garde-fou backend indépendant du frontend :
 * - Authentifie l'utilisateur
 * - Vérifie que l'utilisateur est admin
 * - Bloque toute création de course admin sans client_telephone
 * - Crée la course et la retourne
 *
 * Le frontend doit passer par cette fonction (et non base44.entities.CourseExterne.create)
 * pour garantir que le numéro de téléphone du client n'est jamais absent.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // ── Autorisation : admin complet OU permission dédiée can_create_admin_course ──
    // Un agent de saisie a role='user' mais can_create_admin_course=true.
    // Il peut créer des courses admin mais n'a PAS accès au dashboard admin complet.
    const isAuthorized = user.role === 'admin' || user.can_create_admin_course === true;
    if (!isAuthorized) {
      return Response.json({
        error: 'Réservé aux administrateurs ou agents de saisie autorisés',
        code: 'FORBIDDEN_NO_ADMIN_COURSE_PERMISSION'
      }, { status: 403 });
    }

    const courseData = await req.json();

    // ── Garde-fou backend : aucune course admin sans client_telephone ──
    if (courseData.source === 'admin') {
      const tel = (courseData.client_telephone || '').toString().trim();
      if (!tel) {
        return Response.json({
          error: 'Le numéro du client est obligatoire pour créer une course administrative.',
          code: 'CLIENT_PHONE_REQUIRED'
        }, { status: 400 });
      }
    }

    const course = await base44.entities.CourseExterne.create(courseData);
    return Response.json({ success: true, course });
  } catch (error) {
    console.error('[creerCourseAdmin] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}