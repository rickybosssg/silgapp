import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Apprentissage automatique des quartiers.
 *
 * Appelée à chaque création de CourseExterne.
 * Si un quartier_depart ou quartier_arrivee est saisi et n'existe pas dans la base Quartier,
 * il est automatiquement enregistré dans QuartiersProposes.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    let courseId, countryCode, source;

    // Déclenché depuis entity automation (create)
    if (body.event?.entity_id) {
      courseId = body.event.entity_id;
    } else if (body.course_id) {
      courseId = body.course_id;
    }

    if (!courseId) return Response.json({ error: 'course_id requis' }, { status: 400 });

    const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

    countryCode = course.country_code;
    source = course.source || 'client';

    const quartiersAApprendre = [];

    if (course.quartier_depart && course.quartier_depart.trim()) {
      quartiersAApprendre.push({ nom: course.quartier_depart.trim(), type: 'depart' });
    }
    if (course.quartier_arrivee && course.quartier_arrivee.trim()) {
      quartiersAApprendre.push({ nom: course.quartier_arrivee.trim(), type: 'arrivee' });
    }

    const resultats = [];

    for (const q of quartiersAApprendre) {
      // Vérifier si le quartier existe déjà dans Quartier
      const exists = await base44.asServiceRole.entities.Quartier.filter({
        country_code: countryCode,
        nom: q.nom,
      });

      if (exists && exists.length > 0) {
        continue; // Déjà connu
      }

      // Vérifier s'il existe déjà dans QuartiersProposes
      const dejaPropose = await base44.asServiceRole.entities.QuartiersProposes.filter({
        country_code: countryCode,
        nom_quartier: q.nom,
      });

      if (dejaPropose && dejaPropose.length > 0) {
        // Incrémenter le compteur
        await base44.asServiceRole.entities.QuartiersProposes.update(dejaPropose[0].id, {
          nb_occurrences: (dejaPropose[0].nb_occurrences || 1) + 1,
        });
        resultats.push({ nom: q.nom, action: 'incremente' });
      } else {
        // Nouveau quartier → créer la proposition
        await base44.asServiceRole.entities.QuartiersProposes.create({
          country_code: countryCode,
          ville: course.quartier_depart === q.nom ? null : null, // sera renseigné par l'admin
          nom_quartier: q.nom,
          statut: 'en_attente_validation',
          source: source,
          course_id: courseId,
          nb_occurrences: 1,
        });
        resultats.push({ nom: q.nom, action: 'cree' });
        console.log(`[QUARTIER] Nouveau quartier proposé: "${q.nom}" (${countryCode})`);
      }
    }

    return Response.json({ success: true, appris: resultats.length, resultats });
  } catch (error) {
    console.error('[QUARTIER] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});