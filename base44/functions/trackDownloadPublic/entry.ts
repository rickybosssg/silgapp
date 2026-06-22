import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    // IMPORTANT: Cette fonction est PUBLIQUE - pas d'authentification requise
    const base44 = createClientFromRequest(req);

    // Récupérer le corps de la requête
    const body = await req.json().catch(() => ({}));
    const { event_type, country_code, platform, referrer } = body;

    // Validation minimale
    if (!event_type) {
      return Response.json({
        success: false,
        error: "event_type requis (page_visit, download_click, ou apk_download)"
      }, { status: 400 });
    }

    // Créer ou mettre à jour les stats de téléchargement
    const today = new Date();
    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    // Récupérer les stats existantes (service role pour accès public)
    const existingStats = await base44.asServiceRole.entities.DownloadStats.filter({
      month: monthKey,
      country_code: country_code || 'BF'
    });

    if (existingStats.length > 0) {
      // Mettre à jour les stats existantes
      const stats = existingStats[0];
      const updates = {};

      if (event_type === 'page_visit') updates.page_visits = (stats.page_visits || 0) + 1;
      if (event_type === 'download_click') updates.clicks = (stats.clicks || 0) + 1;
      if (event_type === 'apk_download') {
        updates.downloads = (stats.downloads || 0) + 1;
        updates.last_download_date = new Date().toISOString();
      }

      if (Object.keys(updates).length > 0) {
        await base44.asServiceRole.entities.DownloadStats.update(stats.id, updates);
      }
    } else {
      // Créer de nouvelles stats
      const newStats = {
        month: monthKey,
        country_code: country_code || 'BF',
        platform: platform || 'web',
        referrer: referrer || 'direct',
        page_visits: event_type === 'page_visit' ? 1 : 0,
        clicks: event_type === 'download_click' ? 1 : 0,
        downloads: event_type === 'apk_download' ? 1 : 0,
        last_download_date: event_type === 'apk_download' ? new Date().toISOString() : null
      };
      await base44.asServiceRole.entities.DownloadStats.create(newStats);
    }

    return Response.json({
      success: true,
      message: 'Download tracked',
      event_type
    });
  } catch (error) {
    console.error('[trackDownload] Error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});
