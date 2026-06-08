import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const normalizeCode = (value: unknown) => String(value || '').trim().toUpperCase();

const allowedLivreurFields = new Set([
  'statut',
  'latitude',
  'longitude',
  'derniere_position_date',
]);

const allowedCourseFields = new Set([
  'statut',
  'heure_acceptation',
  'heure_recuperation',
  'heure_livraison',
  'prix_reel',
  'remarque_livreur',
  'livreur_id',
  'livreur_nom',
]);

const sanitizeUpdate = (data: Record<string, unknown>, allowedFields: Set<string>) => {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (allowedFields.has(key)) output[key] = value;
  }
  return output;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json();

    if (body?.native_livreur === true) {
      const action = String(body?.action || '');

      const findLivreurByCode = async (code: string) => {
        const normalizedCode = normalizeCode(code);
        if (!normalizedCode) return null;

        const directMatches = await base44.asServiceRole.entities.Livreur.filter({
          code_identification: normalizedCode,
        });
        const directMatch = directMatches?.find(
          (livreur: Record<string, unknown>) => normalizeCode(livreur.code_identification) === normalizedCode,
        );
        if (directMatch) return directMatch;

        const allLivreurs = await base44.asServiceRole.entities.Livreur.list('-created_date', 500);
        return allLivreurs.find(
          (livreur: Record<string, unknown>) => normalizeCode(livreur.code_identification) === normalizedCode,
        ) || null;
      };

      const requireLivreur = async () => {
        const livreurId = String(body?.livreur_id || '');
        if (!livreurId) throw new Error('livreur_id requis');
        const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId);
        if (!livreur || livreur.actif === false) throw new Error('Compte livreur indisponible');
        return livreur;
      };

      if (action === 'verifyCode') {
        const livreur = await findLivreurByCode(body?.code);
        if (!livreur) return Response.json({ error: "Code d'identification incorrect." }, { status: 404 });
        if (livreur.validation !== 'valide') {
          return Response.json({ error: "Compte livreur non valide. Attendez la validation de l'administrateur." }, { status: 403 });
        }
        if (livreur.actif === false) {
          return Response.json({ error: "Compte livreur desactive. Contactez l'administrateur." }, { status: 403 });
        }
        return Response.json({ success: true, livreur });
      }

      if (action === 'getState') {
        const livreur = await requireLivreur();
        const courses = await base44.asServiceRole.entities.Course.filter(
          { livreur_id: livreur.id },
          '-created_date',
          50,
        );
        return Response.json({ success: true, livreur, courses });
      }

      if (action === 'updateLivreur') {
        const livreur = await requireLivreur();
        const update = sanitizeUpdate(body?.data || {}, allowedLivreurFields);
        if (Object.keys(update).length === 0) return Response.json({ success: true, livreur });
        const updated = await base44.asServiceRole.entities.Livreur.update(livreur.id, update);
        return Response.json({ success: true, livreur: updated });
      }

      if (action === 'updateCourse') {
        const livreur = await requireLivreur();
        const courseId = String(body?.course_id || '');
        if (!courseId) return Response.json({ error: 'course_id requis' }, { status: 400 });

        const course = await base44.asServiceRole.entities.Course.get(courseId);
        if (!course || course.livreur_id !== livreur.id) {
          return Response.json({ error: 'Course non autorisee pour ce livreur' }, { status: 403 });
        }

        const update = sanitizeUpdate(body?.data || {}, allowedCourseFields);
        const updated = await base44.asServiceRole.entities.Course.update(courseId, update);
        return Response.json({ success: true, course: updated });
      }

      return Response.json({ error: 'Action inconnue' }, { status: 400 });
    }

    const tokens = await base44.asServiceRole.entities.NotificationToken.filter({ actif: true });
    const notifications = await base44.asServiceRole.entities.Notification.list('-created_date', 50);

    return Response.json({
      tokens: tokens.map((t) => ({
        email: t.user_email,
        platform: t.platform,
        user_type: t.user_type,
        livreur_id: t.livreur_id,
        created: t.created_date,
      })),
      notifications: notifications.map((n) => ({
        titre: n.titre,
        message: n.message,
        type: n.type,
        destinataire: n.destinataire_email,
        lue: n.lue,
        created: n.created_date,
      })),
      stats: {
        total_tokens: tokens.length,
        total_notifications: notifications.length,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
