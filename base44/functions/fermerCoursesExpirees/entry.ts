import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * DÉSACTIVÉ — Les courses ne sont plus fermées automatiquement.
 *
 * Cette fonction est conservée pour rétrocompatibilité mais ne ferme plus
 * aucune course. Le dispatch externe continue de chercher des livreurs
 * indéfiniment (cycles de 3 livreurs, puis 2 min d'attente, puis nouveau cycle).
 *
 * Une course n'est clôturée que par :
 * - Acceptation par un livreur
 * - Annulation par le client
 * - Annulation par l'administrateur
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();

    // Compter les courses encore en recherche (pour monitoring uniquement)
    const coursesEnRecherche = await base44.asServiceRole.entities.CourseExterne.filter({
      statut: 'recherche_livreur',
    }, '-created_date', 500);

    const paysActifs = await base44.asServiceRole.entities.Country.filter({ actif: true });
    const countryCodes = new Set(paysActifs.map(p => p.code));
    const coursesFiltrees = coursesEnRecherche.filter(c => countryCodes.has(c.country_code));

    const dureesMin = coursesFiltrees.map(c => ({
      id: c.id?.slice(-8),
      minutes: Math.round((now.getTime() - new Date(c.created_date).getTime()) / 60000),
    }));

    console.log(`[FERMETURE] DÉSACTIVÉ — ${coursesFiltrees.length} courses en recherche_livreur (surveillance uniquement)`);
    if (dureesMin.length > 0) {
      const maxDuree = Math.max(...dureesMin.map(d => d.minutes));
      console.log(`[FERMETURE] Durée max en recherche: ${maxDuree} min | Courses: ${JSON.stringify(dureesMin.slice(0, 10))}`);
    }

    return Response.json({ success: true, desactive: true, courses_en_recherche: coursesFiltrees.length, monitoring: dureesMin });
  } catch (error) {
    console.error('[FERMETURE] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
