import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const normalizeCode = (value: unknown) => String(value || '').trim().toUpperCase();

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: CORS_HEADERS });

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
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
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
      if (!livreur) return json({ error: "Code d'identification incorrect." }, 404);
      if (livreur.validation !== 'valide') {
        return json({ error: "Compte livreur non valide. Attendez la validation de l'administrateur." }, 403);
      }
      if (livreur.actif === false) {
        return json({ error: "Compte livreur desactive. Contactez l'administrateur." }, 403);
      }
      return json({ success: true, livreur });
    }

    if (action === 'getState') {
      const livreur = await requireLivreur();
      const courses = await base44.asServiceRole.entities.Course.filter(
        { livreur_id: livreur.id },
        '-created_date',
        50,
      );
      return json({ success: true, livreur, courses });
    }

    if (action === 'updateLivreur') {
      const livreur = await requireLivreur();
      const update = sanitizeUpdate(body?.data || {}, allowedLivreurFields);
      if (Object.keys(update).length === 0) return json({ success: true, livreur });
      const updated = await base44.asServiceRole.entities.Livreur.update(livreur.id, update);
      return json({ success: true, livreur: updated });
    }

    if (action === 'updateCourse') {
      const livreur = await requireLivreur();
      const courseId = String(body?.course_id || '');
      if (!courseId) return json({ error: 'course_id requis' }, 400);

      const course = await base44.asServiceRole.entities.Course.get(courseId);
      if (!course || course.livreur_id !== livreur.id) {
        return json({ error: 'Course non autorisee pour ce livreur' }, 403);
      }

      const update = sanitizeUpdate(body?.data || {}, allowedCourseFields);
      const updated = await base44.asServiceRole.entities.Course.update(courseId, update);
      return json({ success: true, course: updated });
    }

    return json({ error: 'Action inconnue' }, 400);
  } catch (error) {
    return json({ error: error?.message || 'Erreur nativeLivreur' }, 500);
  }
});
