import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { ensureCourseCodeMessage } from '../../shared/courseCodeMessage.ts';
import { normalizeEnterpriseId, isEnterpriseAdmin } from '../../shared/enterpriseFinance.ts';

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

    // [ENTERPRISE] Résolution backend de enterprise_id depuis l'utilisateur authentifié.
    // - Admin Entreprise (silgapp_role=admin_entreprise) : enterprise_id forcé depuis son compte.
    //   Il ne peut pas créer de course publique ni de course pour une autre entreprise.
    // - Super Admin (role=admin, silgapp_role != admin_entreprise) : enterprise_id = null (course publique).
    // Toute valeur enterprise_id envoyée par le frontend est ignorée (anti-falsification).
    const enterpriseAdmin = isEnterpriseAdmin(user);
    if (enterpriseAdmin) {
      courseData.enterprise_id = normalizeEnterpriseId(user.enterprise_id);
      // [ENTERPRISE_SUSPENSION] Bloquer la création si l'entreprise est suspendue.
      const entList = await base44.asServiceRole.entities.Enterprise.filter({
        enterprise_financier_id: courseData.enterprise_id,
      }).catch(() => []);
      const ent = entList?.[0];
      if (ent && (ent.actif === false || ent.statut !== 'actif')) {
        return Response.json({
          error: 'Votre entreprise est temporairement suspendue. Veuillez contacter SILGAPP.',
          code: 'ENTERPRISE_SUSPENDED',
        }, { status: 403 });
      }
    } else {
      courseData.enterprise_id = null;
    }

    const course = await base44.entities.CourseExterne.create(courseData);

    // ── Messages automatiques (prix + PIN récupération + PIN livraison) ──
    // Même mécanisme que le flux client : ensureCourseCodeMessage (idempotent).
    // livreurId = null à la création (aucun livreur assigné).
    // Non-bloquant : un échec n'empêche pas la création de la course.
    if (course?.pickup_code_4_digits && course?.delivery_code_4_digits) {
      try {
        await ensureCourseCodeMessage(
          base44,
          course,
          null, // livreurId = null à la création
          course.pickup_code_4_digits,
          course.delivery_code_4_digits,
          '[CODE_MSG_ADMIN]'
        );
      } catch (err: any) {
        console.error('[creerCourseAdmin] Erreur message codes (non-bloquant):', err?.message || String(err));
      }
    }

    return Response.json({ success: true, course });
  } catch (error) {
    console.error('[creerCourseAdmin] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}