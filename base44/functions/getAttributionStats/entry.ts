import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ═══════════════════════════════════════════════════════════════════════════
// getAttributionStats — Statistiques d'attribution Meta → Installation → Client → Courses
// ═══════════════════════════════════════════════════════════════════════════
//
// RÔLE : Retourner les métriques d'attribution par campagne Meta Ads :
//   - Dépenses Meta réelles (depuis GrowthSpend)
//   - Clics Meta réels (depuis META_ADS_LATEST_INSIGHTS)
//   - Installations attribuées (depuis AppInstall)
//   - Inscriptions (AppInstall avec user_email)
//   - Premières courses (ClientExterne lié, 1ère course livrée)
//   - Deuxièmes courses (ClientExterne lié, 2ème course livrée)
//   - CPI, coût par première course, commission/revenu attribuable
//
// LECTURE UNIQUEMENT — aucune modification de données.
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth : admin uniquement
    try {
      const user = await base44.auth.me();
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Admin requis' }, { status: 403 });
      }
    } catch {
      return Response.json({ error: 'Authentification requise' }, { status: 401 });
    }

    // ── 1. Lire les métriques Meta depuis AppConfig ──
    let metaMetrics = null;
    try {
      const metaConfigs = await base44.asServiceRole.entities.AppConfig.filter({ cle: 'META_ADS_LATEST_INSIGHTS' });
      if (metaConfigs?.[0]?.valeur) {
        metaMetrics = JSON.parse(metaConfigs[0].valeur);
      }
    } catch {}

    // ── 2. Lire les dépenses Meta réelles depuis GrowthSpend ──
    let metaSpends = [];
    try {
      metaSpends = await base44.asServiceRole.entities.GrowthSpend.filter(
        { moteur: 'publicite', statut: ['engagee', 'payee'] },
        '-date_depense', 500
      );
    } catch {}

    const totalSpendAllDays = (metaSpends || []).reduce((sum, s) => sum + (s.montant || 0), 0);

    // ── 3. Lire les AppInstall avec attribution ──
    const allInstalls = await base44.asServiceRole.entities.AppInstall.list('-created_date', 1000);

    // ── 4. Lire les ClientExterne pour matcher par user_email ──
    const allClients = await base44.asServiceRole.entities.ClientExterne.list('-created_date', 1000);
    const clientsByEmail = new Map();
    for (const c of allClients || []) {
      if (c.user_email) clientsByEmail.set(c.user_email.toLowerCase(), c);
    }

    // ── 5. Lire les CourseExterne livrées ──
    const deliveredCourses = await base44.asServiceRole.entities.CourseExterne.filter(
      { statut: 'livree' },
      '-heure_livraison', 1000
    );

    // Compter les courses par client (par téléphone normalisé)
    const coursesByPhone = {};
    for (const course of deliveredCourses || []) {
      const phone = course.client_phone_normalized || course.client_telephone;
      if (phone) coursesByPhone[phone] = (coursesByPhone[phone] || 0) + 1;
    }

    // ── 6. Construire les statistiques par campagne Meta ──
    const campaigns = metaMetrics?.campaigns || [];
    const campaignStats = [];

    for (const campaign of campaigns) {
      // Installations attribuées à cette campagne (par meta_campaign_id ou utm_campaign)
      const installsForCampaign = (allInstalls || []).filter(install => {
        if (install.meta_campaign_id === campaign.id) return true;
        if (install.utm_campaign && install.utm_campaign.includes(campaign.id)) return true;
        if (install.utm_campaign === campaign.name) return true;
        return false;
      });

      // Inscriptions (AppInstall avec user_email)
      const signups = installsForCampaign.filter(i => i.user_email);

      // Clients liés (ClientExterne trouvé par user_email)
      const linkedClients = signups
        .map(i => clientsByEmail.get(i.user_email?.toLowerCase()))
        .filter(Boolean);

      // Premières courses (clients avec exactement 1 course livrée)
      const firstCourses = linkedClients.filter(c => {
        const phone = c.client_phone_normalized || c.client_telephone;
        return coursesByPhone[phone] === 1;
      });

      // Deuxièmes courses (clients avec ≥2 courses livrées)
      const secondCourses = linkedClients.filter(c => {
        const phone = c.client_phone_normalized || c.client_telephone;
        return coursesByPhone[phone] >= 2;
      });

      // CA et commission attribuables
      const linkedPhones = new Set(linkedClients.map(c => c.client_phone_normalized || c.client_telephone).filter(Boolean));
      const attributedCourses = (deliveredCourses || []).filter(c => {
        const phone = c.client_phone_normalized || c.client_telephone;
        return linkedPhones.has(phone);
      });

      const revenue = attributedCourses.reduce((sum, c) => sum + (c.prix_final || 0), 0);
      const commission = attributedCourses.reduce((sum, c) => sum + (c.commission_silga || 0), 0);

      // Dépenses Meta réelles pour cette campagne (depuis les insights par campagne)
      const campaignMetrics = metaMetrics?.campaigns?.find(c => c.id === campaign.id);
      const campaignSpend = campaignMetrics?.spend || 0;
      const campaignClicks = campaignMetrics?.clicks || 0;

      const installsCount = installsForCampaign.length;
      const signupsCount = signups.length;
      const firstCoursesCount = firstCourses.length;
      const secondCoursesCount = secondCourses.length;

      campaignStats.push({
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        objective: campaign.objective,
        meta_spend: campaignSpend,
        meta_clicks: campaignClicks,
        installs: installsCount,
        signups: signupsCount,
        first_courses: firstCoursesCount,
        second_courses: secondCoursesCount,
        revenue,
        commission,
        cpi: installsCount > 0 ? campaignSpend / installsCount : 0,
        cost_per_first_course: firstCoursesCount > 0 ? campaignSpend / firstCoursesCount : 0,
      });
    }

    // ── 7. Statistiques globales d'attribution ──
    const allAttributedInstalls = (allInstalls || []).filter(i => i.utm_source || i.meta_campaign_id);
    const allSignups = allAttributedInstalls.filter(i => i.user_email);
    const allLinkedClients = allSignups
      .map(i => clientsByEmail.get(i.user_email?.toLowerCase()))
      .filter(Boolean);

    const globalStats = {
      total_installs: (allInstalls || []).length,
      attributed_installs: allAttributedInstalls.length,
      attributed_signups: allSignups.length,
      attributed_clients: allLinkedClients.length,
      attribution_rate: (allInstalls || []).length > 0
        ? (allAttributedInstalls.length / (allInstalls || []).length * 100).toFixed(1)
        : '0.0',
      total_meta_spend: totalSpendAllDays,
    };

    return Response.json({
      success: true,
      global: globalStats,
      campaigns: campaignStats,
      meta_account_id: metaMetrics?.account_id || null,
      meta_synced_at: metaMetrics?.synced_at || null,
      read_only: true,
    });

  } catch (error) {
    console.error('[getAttributionStats] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});