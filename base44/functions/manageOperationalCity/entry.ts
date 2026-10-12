import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * manageOperationalCity — Gestion des villes opérationnelles
 *
 * Actions :
 * - activate : Active une ville opérationnelle (crée si inexistante)
 * - deactivate : Désactive une ville opérationnelle
 * - list : Liste toutes les villes opérationnelles d'un pays
 * - list_quartiers : Liste les quartiers rattachés à une zone
 * - rattach_quartier : Rattache un quartier à une zone opérationnelle
 *
 * Sécurité : Super Admin uniquement.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden — Super Admin only' }, { status: 403 });
    }

    const payload = await req.json();
    const { action, country_code, city_name, city_display_name, description, quartier_id, ville_operationnelle } = payload;

    const now = new Date().toISOString();

    // ── ACTIVATE ──
    if (action === 'activate') {
      if (!country_code || !city_name) {
        return Response.json({ error: 'country_code and city_name required' }, { status: 400 });
      }

      const code = String(country_code).toUpperCase();
      const normalizedCity = String(city_name).trim().toLowerCase()
        .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a').replace(/[îï]/g, 'i')
        .replace(/[ôö]/g, 'o').replace(/[ûüù]/g, 'u').replace(/ç/g, 'c')
        .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();

      if (!normalizedCity) {
        return Response.json({ error: 'Invalid city name' }, { status: 400 });
      }

      // Vérifier si la ville existe déjà
      const existing = await base44.asServiceRole.entities.OperationalCity.filter({
        country_code: code,
        nom: normalizedCity,
      }, undefined, 1).catch(() => []);

      if (existing && existing.length > 0) {
        // Mettre à jour la ville existante
        const updated = await base44.asServiceRole.entities.OperationalCity.update(existing[0].id, {
          actif: true,
          date_activation: now,
          active_par: user.email,
          date_desactivation: null,
          desactive_par: null,
          nom_affichage: city_display_name || existing[0].nom_affichage,
          description: description || existing[0].description,
        });

        // Invalider le cache
        try {
          const { invalidateOperationalCityCache } = await import('../../shared/operationalZones.ts');
          invalidateOperationalCityCache(code);
        } catch {}

        return Response.json({
          success: true,
          action: 'activate',
          city: updated,
          created: false,
        });
      }

      // Créer une nouvelle ville opérationnelle
      const newCity = await base44.asServiceRole.entities.OperationalCity.create({
        country_code: code,
        nom: normalizedCity,
        nom_affichage: city_display_name || String(city_name).trim(),
        actif: true,
        description: description || '',
        date_activation: now,
        active_par: user.email,
      });

      // Invalider le cache
      try {
        const { invalidateOperationalCityCache } = await import('../../shared/operationalZones.ts');
        invalidateOperationalCityCache(code);
      } catch {}

      return Response.json({
        success: true,
        action: 'activate',
        city: newCity,
        created: true,
      });
    }

    // ── DEACTIVATE ──
    if (action === 'deactivate') {
      if (!country_code || !city_name) {
        return Response.json({ error: 'country_code and city_name required' }, { status: 400 });
      }

      const code = String(country_code).toUpperCase();
      const normalizedCity = String(city_name).trim().toLowerCase()
        .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a').replace(/[îï]/g, 'i')
        .replace(/[ôö]/g, 'o').replace(/[ûüù]/g, 'u').replace(/ç/g, 'c')
        .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();

      const existing = await base44.asServiceRole.entities.OperationalCity.filter({
        country_code: code,
        nom: normalizedCity,
      }, undefined, 1).catch(() => []);

      if (!existing || existing.length === 0) {
        return Response.json({ error: 'City not found' }, { status: 404 });
      }

      const updated = await base44.asServiceRole.entities.OperationalCity.update(existing[0].id, {
        actif: false,
        date_desactivation: now,
        desactive_par: user.email,
      });

      // Invalider le cache
      try {
        const { invalidateOperationalCityCache } = await import('../../shared/operationalZones.ts');
        invalidateOperationalCityCache(code);
      } catch {}

      return Response.json({
        success: true,
        action: 'deactivate',
        city: updated,
      });
    }

    // ── LIST ──
    if (action === 'list') {
      if (!country_code) {
        return Response.json({ error: 'country_code required' }, { status: 400 });
      }

      const code = String(country_code).toUpperCase();
      const cities = await base44.asServiceRole.entities.OperationalCity.filter({
        country_code: code,
      }, 'nom_affichage', 100).catch(() => []);

      return Response.json({
        success: true,
        cities: cities || [],
      });
    }

    // ── LIST QUARTIERS ──
    if (action === 'list_quartiers') {
      if (!country_code) {
        return Response.json({ error: 'country_code required' }, { status: 400 });
      }

      const code = String(country_code).toUpperCase();
      const quartiers = await base44.asServiceRole.entities.Quartier.filter({
        country_code: code,
        actif: true,
      }, 'ville', 500).catch(() => []);

      // Grouper par ville opérationnelle
      const grouped: Record<string, any[]> = {};
      for (const q of quartiers || []) {
        const opCity = q.ville_operationnelle || q.ville || '(non classé)';
        if (!grouped[opCity]) grouped[opCity] = [];
        grouped[opCity].push(q);
      }

      return Response.json({
        success: true,
        quartiers: quartiers || [],
        grouped,
      });
    }

    // ── RATTACH QUARTIER ──
    if (action === 'rattach_quartier') {
      if (!quartier_id || !ville_operationnelle) {
        return Response.json({ error: 'quartier_id and ville_operationnelle required' }, { status: 400 });
      }

      const normalizedOpCity = String(ville_operationnelle).trim().toLowerCase()
        .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a').replace(/[îï]/g, 'i')
        .replace(/[ôö]/g, 'o').replace(/[ûüù]/g, 'u').replace(/ç/g, 'c')
        .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();

      const updated = await base44.asServiceRole.entities.Quartier.update(quartier_id, {
        ville_operationnelle: normalizedOpCity,
      });

      // Invalider le cache des quartiers
      try {
        const { invalidateQuartierCache } = await import('../../shared/cityResolution.ts');
        invalidateQuartierCache();
      } catch {}

      return Response.json({
        success: true,
        action: 'rattach_quartier',
        quartier: updated,
      });
    }

    // ── AUDIT QUARTIERS ──
    if (action === 'audit_quartiers') {
      if (!country_code) {
        return Response.json({ error: 'country_code required' }, { status: 400 });
      }

      const code = String(country_code).toUpperCase();
      const quartiers = await base44.asServiceRole.entities.Quartier.filter({
        country_code: code,
      }, 'ville', 1000).catch(() => []);

      const total = (quartiers || []).length;
      const withOpCity = (quartiers || []).filter(q => q.ville_operationnelle).length;
      const withoutOpCity = total - withOpCity;
      const withGps = (quartiers || []).filter(q => q.latitude && q.longitude).length;

      // Grouper par ville administrative
      const byVille: Record<string, number> = {};
      for (const q of quartiers || []) {
        const ville = q.ville || '(vide)';
        byVille[ville] = (byVille[ville] || 0) + 1;
      }

      // Grouper par ville opérationnelle
      const byOpCity: Record<string, number> = {};
      for (const q of quartiers || []) {
        const opCity = q.ville_operationnelle || '(non rattaché)';
        byOpCity[opCity] = (byOpCity[opCity] || 0) + 1;
      }

      return Response.json({
        success: true,
        total,
        with_op_city: withOpCity,
        without_op_city: withoutOpCity,
        with_gps: withGps,
        by_ville: byVille,
        by_op_city: byOpCity,
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[manageOperationalCity] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});