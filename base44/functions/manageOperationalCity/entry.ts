import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { normalizeCityName, resolveOperationalName } from '../../shared/cityNames.js';
import { describeCityPolicy } from '../../shared/cityPolicySummary.js';

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

    if (user.role !== 'admin' || Boolean(user.enterprise_id) || user.admin_type === 'pays') {
      return Response.json({ error: 'Forbidden — Super Admin only' }, { status: 403 });
    }

    const payload = await req.json();
    const { action, country_code, city_name, city_display_name, description, quartier_id, ville_operationnelle } = payload;

    const now = new Date().toISOString();
    if (['activate', 'deactivate', 'rattach_quartier'].includes(action)) {
      if (!/^[A-Z]{2}$/.test(String(country_code || '').toUpperCase())) return Response.json({ error: 'invalid_country' }, { status: 400 });
      const countries = await base44.asServiceRole.entities.Country.filter({ code: String(country_code).toUpperCase(), actif: true }, undefined, 2);
      if (countries.length !== 1) return Response.json({ error: 'country_unavailable' }, { status: 400 });
    }

    // Conditional writes and read-back avoid stale toggles and false success.
    if (action === 'activate' || action === 'deactivate') {
      const code = String(country_code).toUpperCase();
      const name = normalizeCityName(city_name);
      if (!name) return Response.json({ error: 'invalid_city_name' }, { status: 400 });
      const entity = base44.asServiceRole.entities.OperationalCity;
      const all = await entity.filter({ country_code: code }, undefined, 100);
      const quartiers = await base44.asServiceRole.entities.Quartier.filter({ country_code: code, actif: true }, undefined, 1000);
      const canonical = resolveOperationalName(name, all, quartiers);
      if (canonical !== name) return Response.json({ error: 'commune_already_attached', operational_city: canonical }, { status: 409 });
      let matches = all.filter(c => normalizeCityName(c.nom) === name);
      if (matches.length > 1) return Response.json({ error: 'duplicate_operational_city' }, { status: 409 });
      const active = action === 'activate';
      let created = false;
      if (!matches.length) {
        if (!active) return Response.json({ error: 'City not found' }, { status: 404 });
        // New records remain OFF until a unique read-back succeeds.
        await entity.create({ country_code: code, nom: name, nom_affichage: city_display_name || String(city_name).trim(),
          actif: false, description: description || '', communes_rattachees: JSON.stringify([String(city_name).trim()]) });
        created = true;
        matches = await entity.filter({ country_code: code, nom: name }, undefined, 2);
        if (matches.length !== 1) return Response.json({ error: 'duplicate_operational_city' }, { status: 409 });
      }
      const current = matches[0];
      if (typeof payload.expected_active === 'boolean' && current.actif !== payload.expected_active) {
        return Response.json({ error: 'state_changed_refresh_required' }, { status: 409 });
      }
      if (current.actif !== active) {
        const history = [...(current.historique_modifications || []), { date: now, actor: user.email, action, previous_active: current.actif, active }];
        const patch = active
          ? { actif: true, date_activation: now, active_par: user.email }
          : { actif: false, date_desactivation: now, desactive_par: user.email };
        const result = await entity.updateMany({ id: current.id, actif: current.actif, updated_date: current.updated_date },
          { $set: { ...patch, historique_modifications: history } });
        if (result?.updated !== 1) return Response.json({ error: 'concurrent_change' }, { status: 409 });
      }
      const verified = await entity.filter({ country_code: code, nom: name }, undefined, 2);
      if (verified.length !== 1 || verified[0].actif !== active) return Response.json({ error: 'write_not_confirmed' }, { status: 409 });
      const { invalidateOperationalCityCache } = await import('../../shared/operationalZones.ts');
      invalidateOperationalCityCache(code);
      return Response.json({ success: true, action, city: verified[0], created });
    }

    // ── LIST ──
    if (action === 'list') {
      if (!country_code) {
        return Response.json({ error: 'country_code required' }, { status: 400 });
      }

      const code = String(country_code).toUpperCase();
      const cities = await base44.asServiceRole.entities.OperationalCity.filter({
        country_code: code,
      }, 'nom_affichage', 100);
      const countryFlags = await base44.asServiceRole.entities.AppConfig.filter({cle: `CITY_DISPATCH_ENABLED:${code}`});

      return Response.json({
        success: true,
        cities: cities || [],
        policy: describeCityPolicy(cities || [], countryFlags || [], code),
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
      }, 'ville', 500);

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

      const normalizedOpCity = normalizeCityName(ville_operationnelle);

      const quartier = await base44.asServiceRole.entities.Quartier.get(quartier_id);
      if (!quartier || quartier.country_code !== String(country_code).toUpperCase()) return Response.json({ error: 'country_mismatch' }, { status: 403 });
      const targets = await base44.asServiceRole.entities.OperationalCity.filter({ country_code: quartier.country_code, nom: normalizedOpCity }, undefined, 2);
      if (targets.length !== 1) return Response.json({ error: 'zone_unavailable' }, { status: 409 });
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
      }, 'ville', 1000);

      const total = (quartiers || []).length;
      const withOpCity = (quartiers || []).filter(q => q.ville_operationnelle).length;
      const withoutOpCity = total - withOpCity;
      const withGps = (quartiers || []).filter(q => q.latitude != null && q.longitude != null && Number.isFinite(Number(q.latitude)) && Number.isFinite(Number(q.longitude))).length;

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
    return Response.json({ error: error instanceof Error ? error.message : 'operation_failed' }, { status: 500 });
  }
});
