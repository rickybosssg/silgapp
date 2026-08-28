import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const normalizeCountry = (value) => String(value || '').trim().toUpperCase();
const sameId = (value, expected) => value != null && expected != null && String(value) === String(expected);

function includesLivreur(value, livreurId) {
  if (!value || !livreurId) return false;
  if (Array.isArray(value)) return value.some((id) => sameId(id, livreurId));
  if (typeof value !== 'string') return false;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.some((id) => sameId(id, livreurId));
  } catch (_) {}
  return value.split(/[,\s]+/).some((id) => sameId(id, livreurId));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth non requise: utilise en frontend polling livreur.
    const { livreur_id, country_code } = await req.json();

    if (!livreur_id) {
      return Response.json({ error: 'livreur_id requis' }, { status: 400 });
    }

    const livreur = await base44.asServiceRole.entities.Livreur.get(livreur_id);
    if (!livreur) {
      return Response.json({ error: 'livreur introuvable' }, { status: 404 });
    }

    const livreurCountry = normalizeCountry(livreur.country_code);
    const requestedCountry = normalizeCountry(country_code);
    const effectiveCountry = requestedCountry || livreurCountry;

    if (!effectiveCountry) {
      console.error('[getAllCoursesForLivreur][COUNTRY_MISSING]', { livreur_id });
      return Response.json({
        success: false,
        error: 'country_code livreur obligatoire',
        blocked_reason: 'missing_livreur_country_code',
      }, { status: 400 });
    }

    if (requestedCountry && livreurCountry && requestedCountry !== livreurCountry) {
      console.error('[getAllCoursesForLivreur][COUNTRY_MISMATCH]', {
        livreur_id,
        requested_country_code: requestedCountry,
        livreur_country_code: livreurCountry,
      });
      return Response.json({
        success: false,
        error: 'country_mismatch',
        blocked_reason: 'country_mismatch',
      }, { status: 403 });
    }

    if (livreur.bloque_encours) {
      return Response.json({
        success: true,
        courses: [],
        total: 0,
        country_code: effectiveCountry,
        bloque_encours: true,
        blocked_reason: 'bloque_encours',
      });
    }

    const allCourses = await base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: effectiveCountry },
      '-created_date',
      500,
    );

    const coursesPourLivreur = allCourses.filter((c) => {
      if (normalizeCountry(c.country_code) !== effectiveCountry) return false;

      // 1. Courses deja acceptees (ownership opérationnel).
      if (
        sameId(c.livreur_id, livreur_id) ||
        sameId(c.accepted_by_livreur_id, livreur_id) ||
        sameId(c.proposed_by_livreur_id, livreur_id) ||
        sameId(c.proposed_livreur_id, livreur_id)
      ) return true;

      // 2. Courses en dispatch multi-livreur.
      if (c.dispatch_status === 'propose' && !c.livreur_id && includesLivreur(c.dispatch_notified_ids, livreur_id)) {
        return true;
      }

      // 3. Ownership historique : livreur_financier_id pour les courses TERMINALES
      //    uniquement (livree, annulee). Cela permet de récupérer les courses
      //    dont livreur_id a été vidé par le passé (bug nettoyageMatinal corrigé).
      //    Pour les courses ACTIVES, livreur_financier_id n'est jamais utilisé
      //    — cela protégerait le redispatch (un ancien livreur ne doit pas
      //    voir une course redispatchée comme active chez lui).
      const isTerminal = c.statut === 'livree' || c.statut === 'annulee';
      if (isTerminal && sameId(c.livreur_financier_id, livreur_id)) {
        return true;
      }

      return false;
    });

    return Response.json({
      success: true,
      courses: coursesPourLivreur,
      total: coursesPourLivreur.length,
      country_code: effectiveCountry,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});