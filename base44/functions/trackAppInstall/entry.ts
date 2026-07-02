import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const { device_id, platform, country_code, app_version, user_email } = payload;

    if (!device_id || !platform) {
      return Response.json({ success: false, error: "device_id et platform requis" }, { status: 400 });
    }

    // Verifier si cet appareil est deja enregistre
    const existing = await base44.asServiceRole.entities.AppInstall.filter({ device_id });

    const now = new Date().toISOString();

    if (existing.length > 0) {
      // Deja installe — juste mettre a jour last_seen_at
      const install = existing[0];
      await base44.asServiceRole.entities.AppInstall.update(install.id, {
        last_seen_at: now,
        app_version: app_version || install.app_version,
        user_email: user_email || install.user_email,
        country_code: country_code || install.country_code,
      });
      return Response.json({ success: true, is_new: false, message: "Install existante mise a jour" });
    }

    // Nouvelle installation — premier ouverture
    await base44.asServiceRole.entities.AppInstall.create({
      device_id,
      platform,
      country_code: country_code || 'BF',
      first_opened_at: now,
      last_seen_at: now,
      app_version: app_version || null,
      user_email: user_email || null,
    });

    return Response.json({ success: true, is_new: true, message: "Nouvelle installation enregistree" });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});