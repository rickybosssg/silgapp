import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Synchronise la position GPS d'un partenaire (boutique ou restaurant).
 * - Authentifie le partenaire
 * - Met à jour latitude, longitude, derniere_position_date, gps_actif
 * - Respecte l'isolation par pays (pays_code inchangé)
 *
 * Payload: { latitude, longitude, gps_actif }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { latitude, longitude, gps_actif } = body;

    // Si GPS désactivé (pas de lat/lng), on met juste gps_actif=false sans écraser les coordonnées
    const asService = base44.asServiceRole;
    const now = new Date().toISOString();
    const updateData = {};

    if (latitude != null && longitude != null) {
      updateData.latitude = Number(latitude);
      updateData.longitude = Number(longitude);
      updateData.derniere_position_date = now;
      updateData.gps_actif = gps_actif !== false;
    } else if (gps_actif === false) {
      updateData.gps_actif = false;
    } else {
      return Response.json({ error: 'latitude et longitude requis (ou gps_actif=false)' }, { status: 400 });
    }

    // ── Chercher la boutique du partenaire ──────────────────────────────
    const boutiques = await asService.entities.Boutique.filter({ partenaire_id: user.id });
    if (boutiques?.length > 0) {
      const b = boutiques[0];
      await asService.entities.Boutique.update(b.id, updateData);
      console.log(`[syncPartenaireGPS] 🏪 Boutique "${b.nom}" GPS mis à jour: ${latitude}, ${longitude}`);
      return Response.json({ success: true, type: 'boutique', id: b.id, position: updateData });
    }

    // ── Chercher le restaurant du partenaire ───────────────────────────
    const restaurants = await asService.entities.Restaurant.filter({ partenaire_id: user.id });
    if (restaurants?.length > 0) {
      const r = restaurants[0];
      await asService.entities.Restaurant.update(r.id, updateData);
      console.log(`[syncPartenaireGPS] 🍽️ Restaurant "${r.nom}" GPS mis à jour: ${latitude}, ${longitude}`);
      return Response.json({ success: true, type: 'restaurant', id: r.id, position: updateData });
    }

    return Response.json({ error: 'Aucun établissement trouvé pour ce partenaire' }, { status: 404 });
  } catch (error) {
    console.error('[syncPartenaireGPS] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});