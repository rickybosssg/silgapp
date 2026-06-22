import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * BALAYAGE AUTOMATIQUE DE PRÉSENCE LIVREURS
 *
 * Exécuté toutes les 5 minutes.
 * Tout livreur disponible dont le dernier heartbeat dépasse 60 minutes
 * est automatiquement passé en hors_ligne et exclu du dispatch.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = Date.now();
    const SEUIL_HORS_LIGNE_MIN = 60;

    // Récupérer tous les livreurs externes disponibles
    const livreursDisponibles = await base44.asServiceRole.entities.Livreur.filter({
      type_livreur: 'externe',
      statut: 'disponible',
      actif: true,
    }, '-updated_date', 500);

    if (!livreursDisponibles || livreursDisponibles.length === 0) {
      return Response.json({ success: true, verifies: 0, marques_hors_ligne: 0, message: 'Aucun livreur disponible' });
    }

    const passesHorsLigne = [];
    const maintenant = new Date();

    for (const livreur of livreursDisponibles) {
      const hbDate = livreur.last_seen_at || livreur.derniere_position_date || livreur.created_date;
      if (!hbDate) continue;

      const hb = new Date(hbDate);
      if (isNaN(hb.getTime())) continue;

      const ageMin = (now - hb.getTime()) / 60000;

      if (ageMin > SEUIL_HORS_LIGNE_MIN) {
        try {
          await base44.asServiceRole.entities.Livreur.update(livreur.id, { statut: 'hors_ligne' });
          passesHorsLigne.push({
            id: livreur.id?.slice(-8),
            nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(),
            age_min: Math.round(ageMin),
            country_code: livreur.country_code,
          });
          console.log(`[PRESENCE] ${livreur.prenom || ''} ${livreur.nom} → hors_ligne (HB: ${Math.round(ageMin)} min)`);
        } catch (err) {
          console.error(`[PRESENCE] Échec mise hors_ligne ${livreur.id}:`, err.message);
        }
      }
    }

    // Résumé par pays
    const parPays = {};
    passesHorsLigne.forEach(l => {
      const cc = l.country_code || 'INCONNU';
      parPays[cc] = (parPays[cc] || 0) + 1;
    });

    console.log(`[PRESENCE] Balayage terminé — ${passesHorsLigne.length} livreur(s) mis hors_ligne sur ${livreursDisponibles.length} vérifiés`);

    return Response.json({
      success: true,
      verifies: livreursDisponibles.length,
      marques_hors_ligne: passesHorsLigne.length,
      passes_hors_ligne: passesHorsLigne,
      par_pays: parPays,
      timestamp: maintenant.toISOString(),
    });
  } catch (error) {
    console.error('[PRESENCE] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
