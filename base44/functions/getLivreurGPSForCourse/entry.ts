import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// ═══════════════════════════════════════════════════════════════════════════
// GET LIVREUR GPS FOR COURSE — Retourne UNIQUEMENT la position GPS du livreur
// affecté à une course, après vérification que l'utilisateur est autorisé.
// ═══════════════════════════════════════════════════════════════════════════
//
// Sécurité :
//   - Utilisateur authentifié obligatoire
//   - L'utilisateur doit être le créateur/client de la course OU un admin
//   - Le livreur est lu via asServiceRole (bypass RLS) mais seuls les champs
//     GPS sont retournés (latitude, longitude, derniere_position_date)
//   - Aucune donnée privée (email, téléphone, finances, documents) n'est exposée
//
// Retour :
//   { livreur_id, latitude, longitude, derniere_position_date }
//   ou { livreur_id: null } si pas de livreur affecté
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const { courseId } = await req.json();
    if (!courseId) return Response.json({ error: 'courseId requis' }, { status: 400 });

    // 1. Charger la course
    let course;
    try {
      course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
    } catch {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

    // 2. Vérifier l'autorisation : admin OU créateur/client de la course
    const isAdmin = user.role === 'admin';
    if (!isAdmin) {
      // Vérifier si l'utilisateur est le créateur de la course
      const isCreator = course.created_by_id === user.id;

      // Vérifier si l'utilisateur est le client lié (via client_user_email)
      const isClientLinked = course.client_user_email && course.client_user_email === user.email;

      // Vérifier via ClientExterne (destinataire ou expéditeur)
      let isClientOfCourse = isCreator || isClientLinked;
      if (!isClientOfCourse) {
        const clients = await base44.asServiceRole.entities.ClientExterne.filter({ user_email: user.email });
        if (clients && clients.length > 0) {
          const client = clients[0];
          isClientOfCourse =
            course.destinataire_client_id === client.id ||
            course.expediteur_client_id === client.id ||
            course.client_telephone === client.telephone;
        }
      }

      if (!isClientOfCourse) {
        return Response.json({ error: 'Accès refusé' }, { status: 403 });
      }
    }

    // 3. Vérifier qu'un livreur est affecté
    if (!course.livreur_id) {
      return Response.json({ livreur_id: null, latitude: null, longitude: null, derniere_position_date: null });
    }

    // 4. Charger le livreur via asServiceRole
    const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id);
    if (!livreur) {
      return Response.json({ livreur_id: course.livreur_id, latitude: null, longitude: null, derniere_position_date: null });
    }

    // 5. Retourner UNIQUEMENT les champs GPS
    return Response.json({
      livreur_id: livreur.id,
      latitude: livreur.latitude ?? null,
      longitude: livreur.longitude ?? null,
      derniere_position_date: livreur.derniere_position_date ?? null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}