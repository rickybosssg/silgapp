import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Public, read-only projection. No arbitrary config keys, URLs or user data.
Deno.serve(async (req) => {
  try {
    const api = createClientFromRequest(req);
    const rows = await api.asServiceRole.entities.AppConfig.filter({ cle: { $in: ['APP_UPDATE_ANDROID', 'APP_UPDATE_IOS'] } }, undefined, 3);
    const platforms: Record<string, unknown> = {};
    for (const platform of ['android', 'ios']) {
      const matches = rows.filter(row => row.cle === `APP_UPDATE_${platform.toUpperCase()}`);
      platforms[platform] = { enabled: false };
      if (matches.length !== 1) continue;
      let value;
      try { value = JSON.parse(matches[0].valeur); } catch { continue; }
      const verified = Date.parse(value?.verified_at);
      if (value?.enabled !== true || value.store_available !== true || !/^\d+\.\d+\.\d+$/.test(value.version || '') || !Number.isFinite(verified) || verified > Date.now()) continue;
      platforms[platform] = { enabled: true, store_available: true, version: value.version, verified_at: value.verified_at };
    }
    return Response.json({ success: true, platforms });
  } catch {
    return Response.json({ success: false, error: 'Invitation indisponible.' }, { status: 503 });
  }
});
