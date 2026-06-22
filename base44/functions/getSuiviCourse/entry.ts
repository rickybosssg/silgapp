import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Endpoint PUBLIC pour récupérer les données de suivi d'une course par tracking_token ou ID.
 * Ne nécessite pas d'authentification utilisateur.
 */
Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token } = payload;

    if (!token) {
      return Response.json({ error: 'token_manquant' }, { status: 400, headers: corsHeaders });
    }

    // 1. Chercher par tracking_token
    let courses = await base44.asServiceRole.entities.CourseExterne.filter({ tracking_token: token });

    // 2. Fallback : chercher par ID direct
    if (!courses || courses.length === 0) {
      try {
        const byId = await base44.asServiceRole.entities.CourseExterne.get(token);
        if (byId) courses = [byId];
      } catch (_) { /* pas trouvé par ID */ }
    }

    if (!courses || courses.length === 0) {
      return Response.json({ error: 'not_found' }, { status: 404, headers: corsHeaders });
    }

    const course = courses[0];

    // Récupérer la position live du livreur si assigné
    let livreurPos = null;
    if (course.livreur_id) {
      try {
        const livreurs = await base44.asServiceRole.entities.Livreur.filter({ id: course.livreur_id });
        const l = livreurs?.[0];
        if (l?.latitude && l?.longitude) {
          livreurPos = {
            lat: l.latitude,
            lng: l.longitude,
            nom: l.prenom ? `${l.prenom} ${l.nom}` : l.nom,
          };
        }
      } catch (_) { /* ignore */ }
    }

    return Response.json({ course, livreurPos }, { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('[getSuiviCourse] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
