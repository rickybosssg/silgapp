import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { invalidateCityFlagCache } from '../../shared/cityResolution.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin' || user.enterprise_id) {
      return Response.json({ success: false, error: 'Super administrateur requis' }, { status: 403 });
    }
    const body = await req.json();
    const code = String(body.country_code || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || typeof body.enabled !== 'boolean' || typeof body.expected_enabled !== 'boolean') {
      return Response.json({ success: false, error: 'Configuration invalide' }, { status: 400 });
    }
    const countries = await base44.asServiceRole.entities.Country.filter({ code, actif: true }, undefined, 2);
    if (countries.length !== 1) return Response.json({ success: false, error: 'Pays indisponible' }, { status: 400 });
    const cle = `CITY_DISPATCH_ENABLED:${code}`;
    const entity = base44.asServiceRole.entities.AppConfig;
    const rows = await entity.filter({ cle }, undefined, 2);
    if (rows.length > 1 || (rows[0]?.valeur === 'true') !== body.expected_enabled) {
      return Response.json({ success: false, error: 'Configuration modifiee. Actualisez avant de reessayer.' }, { status: 409 });
    }
    const valeur = body.enabled ? 'true' : 'false';
    if (rows[0]) {
      const result = await entity.updateMany({ id: rows[0].id, valeur: rows[0].valeur }, { $set: { valeur } });
      if (result?.updated !== 1) return Response.json({ success: false, error: 'Modification concurrente' }, { status: 409 });
    } else {
      await entity.create({ cle, valeur, description: `Dispatch par ville ${code}` });
    }
    invalidateCityFlagCache(code);
    const verified = await entity.filter({ cle }, undefined, 2);
    if (verified.length !== 1 || verified[0].valeur !== valeur) {
      return Response.json({ success: false, error: 'Enregistrement non confirme. Actualisez la configuration.' }, { status: 409 });
    }
    return Response.json({ success: true, enabled: body.enabled, country_code: code });
  } catch {
    return Response.json({ success: false, error: 'Configuration temporairement indisponible' }, { status: 503 });
  }
});
