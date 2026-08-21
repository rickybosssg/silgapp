import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * GET TARIF ZONES — Retourne les zones tarifaires actives.
 *
 * Utilisé par l'APK pour récupérer la configuration tarifaire depuis le backend.
 * L'APK met en cache local le résultat et utilise la dernière config connue
 * si Internet est indisponible.
 *
 * Paramètres:
 *   - country_code (string, optionnel): filtrer par pays
 *   - ville (string, optionnel): filtrer par ville
 *
 * Retourne les zones tarifaires actives dont la date de validité couvre la date actuelle.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const countryCode = url.searchParams.get('country_code') || '';
    const ville = url.searchParams.get('ville') || '';

    const filter = { actif: true };
    if (countryCode) filter.pays_code = countryCode;
    if (ville) filter.ville = ville;

    const zones = await base44.asServiceRole.entities.TarifZone
      .filter(filter, '-date_debut', 100)
      .catch(() => []);

    // Filtrer par date de validité
    const now = new Date();
    const validZones = (zones || []).filter((z) => {
      const debut = z.date_debut ? new Date(z.date_debut) : null;
      const fin = z.date_fin ? new Date(z.date_fin) : null;
      if (debut && now < debut) return false;
      if (fin && now > fin) return false;
      return true;
    });

    return Response.json({
      success: true,
      zones: validZones.map((z) => ({
        id: z.id,
        pays_code: z.pays_code,
        ville: z.ville,
        zone_tarifaire: z.zone_tarifaire,
        palier_1_km_max: z.palier_1_km_max,
        palier_1_prix: z.palier_1_prix,
        palier_2_km_max: z.palier_2_km_max,
        palier_2_prix: z.palier_2_prix,
        tolerance_min_km: z.tolerance_min_km,
        tolerance_max_km: z.tolerance_max_km,
        seuil_strict_km: z.seuil_strict_km,
        devise: z.devise || 'FCFA',
        date_debut: z.date_debut,
        date_fin: z.date_fin,
        description: z.description,
      })),
      fetched_at: now.toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});