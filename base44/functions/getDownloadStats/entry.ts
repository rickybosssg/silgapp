import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Récupérer le mois actuel
    const today = new Date();
    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    // Récupérer toutes les stats du mois
    const allStats = await base44.entities.DownloadStats.filter({ 
      month: monthKey
    });

    // Agréger les statistiques
    const stats = {
      month: monthKey,
      total_page_visits: 0,
      total_clicks: 0,
      total_downloads: 0,
      month_downloads: 0,
      by_country: {},
      by_platform: { android: 0, ios: 0, web: 0 }
    };

    allStats.forEach(s => {
      stats.total_page_visits += (s.page_visits || 0);
      stats.total_clicks += (s.clicks || 0);
      stats.total_downloads += (s.downloads || 0);
      
      // Par pays
      const cc = s.country_code || 'BF';
      if (!stats.by_country[cc]) {
        stats.by_country[cc] = { visits: 0, clicks: 0, downloads: 0 };
      }
      stats.by_country[cc].visits += (s.page_visits || 0);
      stats.by_country[cc].clicks += (s.clicks || 0);
      stats.by_country[cc].downloads += (s.downloads || 0);
      
      // Par plateforme
      const plat = s.platform || 'web';
      if (stats.by_platform[plat] !== undefined) {
        stats.by_platform[plat] += (s.downloads || 0);
      }
    });

    stats.month_downloads = stats.total_downloads;

    return Response.json({ 
      success: true, 
      stats 
    });
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});