import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * BALAYAGE AUTOMATIQUE DE PRÉSENCE LIVREURS
 *
 * Exécuté toutes les 5 minutes.
 * ⚠️ MODIFICATION : Ne met PLUS automatiquement les livreurs hors_ligne.
 * Seul le livreur lui-même peut se mettre hors_ligne depuis son app.
 * Cette fonction ne fait désormais que collecter des statistiques de présence
 * à des fins de monitoring (sans modifier le statut des livreurs).
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
      return Response.json({ success: true, verifies: 0, inactifs_detectes: 0, message: 'Aucun livreur disponible' });
    }

    // Collecte de statistiques uniquement — AUCUNE mise à jour de statut
    const inactifsDetectes = [];
    const maintenant = new Date();

    for (const livreur of livreursDisponibles) {
      const hbDate = livreur.last_seen_at || livreur.derniere_position_date || livreur.created_date;
      if (!hbDate) continue;

      const hb = new Date(hbDate);
      if (isNaN(hb.getTime())) continue;

      const ageMin = (now - hb.getTime()) / 60000;

      if (ageMin > SEUIL_HORS_LIGNE_MIN) {
        inactifsDetectes.push({
          id: livreur.id?.slice(-8),
          nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(),
          age_min: Math.round(ageMin),
          country_code: livreur.country_code,
        });
      }
    }

    // Résumé par pays
    const parPays = {};
    inactifsDetectes.forEach(l => {
      const cc = l.country_code || 'INCONNU';
      parPays[cc] = (parPays[cc] || 0) + 1;
    });

    console.log(`[PRESENCE] 📊 Balayage terminé — ${inactifsDetectes.length} livreur(s) inactif(s) détecté(s) sur ${livreursDisponibles.length} vérifiés (AUCUNE mise à jour automatique)`);

    return Response.json({
      success: true,
      verifies: livreursDisponibles.length,
      inactifs_detectes: inactifsDetectes.length,
      inactifs: inactifsDetectes,
      par_pays: parPays,
      timestamp: maintenant.toISOString(),
      note: 'Aucune mise à jour automatique — seul le livreur peut se mettre hors_ligne',
    });
  } catch (error) {
    console.error('[PRESENCE] ❌ Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});