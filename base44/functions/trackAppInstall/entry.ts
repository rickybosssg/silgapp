import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ═══════════════════════════════════════════════════════════════════════════
// trackAppInstall — Enregistre l'installation + attribution UTM/Meta
// ═══════════════════════════════════════════════════════════════════════════
//
// RÈGLE D'ATTRIBUTION :
//   - L'attribution initiale (UTM/Meta) est capturée à la première ouverture
//   - Lors de l'enrichissement avec user_email (inscription), l'attribution
//     initiale est JAMAIS écrasée — on préserve la source la plus fiable
//   - user_email est enrichi (pas remplacé) si déjà présent
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const {
      device_id,
      platform,
      country_code,
      app_version,
      user_email,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      meta_campaign_id,
      meta_adset_id,
      meta_ad_id,
      attribution_source,
    } = payload;

    if (!device_id || !platform) {
      return Response.json({ success: false, error: "device_id et platform requis" }, { status: 400 });
    }

    // Vérifier si cet appareil est déjà enregistré
    const existing = await base44.asServiceRole.entities.AppInstall.filter({ device_id });
    const now = new Date().toISOString();

    if (existing.length > 0) {
      const install = existing[0];

      // ── Mise à jour — préserver l'attribution initiale ──
      const updates = {
        last_seen_at: now,
        app_version: app_version || install.app_version,
        country_code: country_code || install.country_code,
      };

      // user_email : enrichir (pas remplacer si déjà présent)
      if (user_email && !install.user_email) {
        updates.user_email = user_email;
        updates.user_email_linked_at = now;
      }

      // ── Attribution : JAMAIS écraser l'attribution initiale ──
      // Si l'attribution initiale est déjà définie, on la conserve.
      // On n'écrit les UTM que si aucun UTM n'était présent initialement.
      if (!install.utm_source && utm_source) {
        updates.utm_source = utm_source;
        updates.utm_medium = utm_medium || null;
        updates.utm_campaign = utm_campaign || null;
        updates.utm_content = utm_content || null;
        updates.utm_term = utm_term || null;
        updates.meta_campaign_id = meta_campaign_id || null;
        updates.meta_adset_id = meta_adset_id || null;
        updates.meta_ad_id = meta_ad_id || null;
        updates.attribution_source = attribution_source || (utm_source === 'meta' || utm_source === 'facebook' ? 'meta_ads' : 'referral');
        updates.attribution_confidence = 'high';
        updates.attributed_at = install.attributed_at || now;
      }

      await base44.asServiceRole.entities.AppInstall.update(install.id, updates);
      return Response.json({
        success: true,
        is_new: false,
        attribution_preserved: !!install.utm_source,
        message: "Install existante mise à jour",
      });
    }

    // ── Nouvelle installation — première ouverture ──
    const detectedSource = attribution_source ||
      (utm_source === 'meta' || utm_source === 'facebook' ? 'meta_ads' :
       utm_source ? 'referral' : 'direct');

    await base44.asServiceRole.entities.AppInstall.create({
      device_id,
      platform,
      country_code: country_code || 'INCONNU',
      first_opened_at: now,
      last_seen_at: now,
      app_version: app_version || null,
      user_email: user_email || null,
      user_email_linked_at: user_email ? now : null,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_content: utm_content || null,
      utm_term: utm_term || null,
      meta_campaign_id: meta_campaign_id || null,
      meta_adset_id: meta_adset_id || null,
      meta_ad_id: meta_ad_id || null,
      attribution_source: detectedSource,
      attribution_confidence: utm_source ? 'high' : 'low',
      attributed_at: now,
    });

    return Response.json({
      success: true,
      is_new: true,
      attribution_captured: !!utm_source,
      message: "Nouvelle installation enregistrée",
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});