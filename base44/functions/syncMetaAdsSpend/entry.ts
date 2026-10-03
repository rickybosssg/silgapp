import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// ═══════════════════════════════════════════════════════════════════════════
// syncMetaAdsSpend — Phase 0 : LECTURE UNIQUEMENT
// ═══════════════════════════════════════════════════════════════════════════
//
// RÔLE : Lire les dépenses et statistiques réelles du compte publicitaire Meta
// et les enregistrer dans GrowthSpend + AppConfig pour affichage dashboard.
//
// SÉCURITÉ :
//   - Scope OAuth : ads_read UNIQUEMENT (pas de ads_management)
//   - Aucune création/modification/pause de campagne
//   - Aucune dépense provoquée par SILGAPP
//   - Idempotent : synchroniser plusieurs fois la même période ne multiplie pas
//
// IDÉMPOTENCE :
//   - Clé : `meta_spend_{accountId}_{YYYY-MM-DD}`
//   - Si une entrée GrowthSpend existe déjà pour cette clé → update montant
//   - Sinon → create
// ═══════════════════════════════════════════════════════════════════════════

const META_API_BASE = 'https://graph.facebook.com/v25.0';
const DEFAULT_AD_ACCOUNT_ID = '234850849367733'; // Eric Compaore (compte réel SILGAPP)

// ── Taux de conversion USD → FCFA ──
// Le compte Meta est configuré en USD. Meta API retourne le spend en USD.
// Ce taux doit être identique à META_USD_TO_FCFA_RATE dans growthBudgetGuard.ts
// et dans manageMetaCampaign/entry.ts.
const META_USD_TO_FCFA_RATE = 600;

// ── WHITELIST HARD-CODÉE : seuls ces comptes sont autorisés ──
// Empêche toute importation de dépenses depuis d'autres comptes (CDL, etc.)
// même si META_AD_ACCOUNT_ID est modifié dans AppConfig.
const ALLOWED_AD_ACCOUNT_IDS = new Set([
  '234850849367733', // Eric Compaore (compte réel SILGAPP)
]);

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function dateNDaysAgoStr(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

async function getAdAccountId(base44) {
  let accountId = DEFAULT_AD_ACCOUNT_ID;
  try {
    const configs = await base44.asServiceRole.entities.AppConfig.filter({ cle: 'META_AD_ACCOUNT_ID' });
    if (configs?.[0]?.valeur) accountId = configs[0].valeur;
  } catch {}
  // ── VERROU DE SÉCURITÉ : rejeter tout compte non whitelisté ──
  const rawId = accountId.replace(/^act_/, '').trim();
  if (!ALLOWED_AD_ACCOUNT_IDS.has(rawId)) {
    throw new Error(`Compte publicitaire non autorisé: ${accountId}. Seul le compte Eric Compaore (234850849367733) est whitelisté.`);
  }
  return rawId;
}

async function fetchAccountInsights(accessToken, accountId, dateSince, dateUntil) {
  // Insights au niveau du compte : spend, impressions, clicks, ctr, cpc
  const url = `${META_API_BASE}/${accountId}/insights` +
    `?fields=spend,impressions,clicks,ctr,cpc,date_start,date_stop` +
    `&time_increment=1` + // données par jour
    `&time_range={"since":"${dateSince}","until":"${dateUntil}"}` +
    `&level=account&limit=100`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (data.error) throw new Error(`Meta API: ${data.error.message}`);
  return data.data || [];
}

async function fetchCampaigns(accessToken, accountId) {
  const url = `${META_API_BASE}/${accountId}/campaigns` +
    `?fields=id,name,status,objective,daily_budget,lifetime_budget&limit=100`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (data.error) throw new Error(`Meta API campaigns: ${data.error.message}`);
  return data.data || [];
}

async function fetchCampaignInsights(accessToken, campaignId, dateSince, dateUntil) {
  const url = `${META_API_BASE}/${campaignId}/insights` +
    `?fields=spend,impressions,clicks,ctr,cpc,reach,date_start,date_stop` +
    `&time_increment=1` +
    `&time_range={"since":"${dateSince}","until":"${dateUntil}"}` +
    `&limit=100`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (data.error) throw new Error(`Meta API campaign insights: ${data.error.message}`);
  return data.data || [];
}

async function upsertGrowthSpend(base44, accountId, date, spend, impressions, clicks) {
  const idempotencyKey = `meta_spend_${accountId}_${date}`;

  // ── Conversion USD → FCFA ──
  // Meta API retourne le spend en USD (compte configuré en USD).
  // On stocke le montant original ET le montant converti en FCFA.
  // Le moteur utilise amount_fcfa pour tous les calculs budgétaires.
  const amountFcfa = Math.round(spend * META_USD_TO_FCFA_RATE);
  const now = new Date().toISOString();

  // Vérifier si une entrée existe déjà pour cette clé (idempotence)
  const existing = await base44.asServiceRole.entities.GrowthSpend.filter({
    idempotency_key: idempotencyKey,
  });

  if (existing && existing.length > 0) {
    // Update — Meta peut ajuster les montants rapportés
    const entry = existing[0];
    await base44.asServiceRole.entities.GrowthSpend.update(entry.id, {
      montant: spend,
      devise: 'USD',
      amount_original: spend,
      currency_original: 'USD',
      amount_fcfa: amountFcfa,
      conversion_rate: META_USD_TO_FCFA_RATE,
      converted_at: now,
      description_depense: `Meta Ads ${date} — ${impressions} impressions, ${clicks} clics`,
      date_depense: new Date(date + 'T12:00:00Z').toISOString(),
    });
    return { action: 'updated', id: entry.id, amount_usd: spend, amount_fcfa: amountFcfa };
  }

  // Create
  const entry = await base44.asServiceRole.entities.GrowthSpend.create({
    moteur: 'publicite',
    type_depense: 'autre',
    montant: spend,
    devise: 'USD',
    amount_original: spend,
    currency_original: 'USD',
    amount_fcfa: amountFcfa,
    conversion_rate: META_USD_TO_FCFA_RATE,
    converted_at: now,
    country_code: '',
    idempotency_key: idempotencyKey,
    description_depense: `Meta Ads ${date} — ${impressions} impressions, ${clicks} clics`,
    statut: 'engagee',
    date_depense: new Date(date + 'T12:00:00Z').toISOString(),
  });
  return { action: 'created', id: entry.id, amount_usd: spend, amount_fcfa: amountFcfa };
}

async function storeLatestMetrics(base44, accountId, campaigns, insights) {
  // Stocker les métriques les plus récentes dans AppConfig pour le dashboard
  const today = todayStr();
  const todayInsight = insights.find(i => i.date_start === today) || insights[insights.length - 1];

  const metrics = {
    account_id: accountId,
    synced_at: new Date().toISOString(),
    currency_note: 'Meta account is in USD. All spend values below are converted to FCFA at rate ' + META_USD_TO_FCFA_RATE + ' FCFA/USD.',
    conversion_rate: META_USD_TO_FCFA_RATE,
    today: todayInsight ? {
      date: todayInsight.date_start,
      spend_usd: parseFloat(todayInsight.spend || '0'),
      spend_fcfa: Math.round(parseFloat(todayInsight.spend || '0') * META_USD_TO_FCFA_RATE),
      impressions: parseInt(todayInsight.impressions || '0'),
      clicks: parseInt(todayInsight.clicks || '0'),
      ctr: parseFloat(todayInsight.ctr || '0'),
      cpc_usd: parseFloat(todayInsight.cpc || '0'),
      cpc_fcfa: Math.round(parseFloat(todayInsight.cpc || '0') * META_USD_TO_FCFA_RATE),
    } : null,
    last_7_days: insights.slice(-7).map(i => ({
      date: i.date_start,
      spend_usd: parseFloat(i.spend || '0'),
      spend_fcfa: Math.round(parseFloat(i.spend || '0') * META_USD_TO_FCFA_RATE),
      impressions: parseInt(i.impressions || '0'),
      clicks: parseInt(i.clicks || '0'),
      ctr: parseFloat(i.ctr || '0'),
      cpc_usd: parseFloat(i.cpc || '0'),
      cpc_fcfa: Math.round(parseFloat(i.cpc || '0') * META_USD_TO_FCFA_RATE),
    })),
    campaigns: campaigns
      .sort((a, b) => (b.spend || 0) - (a.spend || 0))
      .slice(0, 10)
      .map(c => ({
        id: c.id,
        name: (c.name || '').substring(0, 50),
        status: c.status,
        objective: c.objective,
        spend_usd: c.spend || 0,
        spend_fcfa: Math.round((c.spend || 0) * META_USD_TO_FCFA_RATE),
        impressions: c.impressions || 0,
        clicks: c.clicks || 0,
        ctr: c.ctr || '0',
        cpc_usd: c.cpc || '0',
        cpc_fcfa: Math.round(parseFloat(c.cpc || '0') * META_USD_TO_FCFA_RATE),
      })),
  };

  const existing = await base44.asServiceRole.entities.AppConfig.filter({ cle: 'META_ADS_LATEST_INSIGHTS' });
  const valeur = JSON.stringify(metrics);
  if (existing && existing.length > 0) {
    await base44.asServiceRole.entities.AppConfig.update(existing[0].id, { valeur });
  } else {
    await base44.asServiceRole.entities.AppConfig.create({ cle: 'META_ADS_LATEST_INSIGHTS', valeur });
  }

  return metrics;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    // Auth : admin ou appel depuis workflow (service role)
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      isAdmin = user?.role === 'admin';
    } catch {}

    // Récupérer le token Meta Ads via le connecteur
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('meta_ads');
    if (!accessToken) {
      return Response.json({ error: 'Token Meta Ads non disponible. Connectez le compte dans Base44.' }, { status: 503 });
    }

    const accountId = `act_${await getAdAccountId(base44)}`;

    // Période : 7 derniers jours (pour rattrapage + données récentes)
    const dateSince = dateNDaysAgoStr(7);
    const dateUntil = todayStr();

    // 1. Lire les campagnes
    const campaigns = await fetchCampaigns(accessToken, accountId);

    // 2. Lire les insights (dépenses réelles par jour)
    const insights = await fetchAccountInsights(accessToken, accountId, dateSince, dateUntil);

    // 2b. Lire les insights par campagne
    const campaignMetrics = [];
    for (const campaign of campaigns) {
      try {
        const cInsights = await fetchCampaignInsights(accessToken, campaign.id, dateSince, dateUntil);
        const cSpend = cInsights.reduce((sum, i) => sum + parseFloat(i.spend || '0'), 0);
        const cImpressions = cInsights.reduce((sum, i) => sum + parseInt(i.impressions || '0'), 0);
        const cClicks = cInsights.reduce((sum, i) => sum + parseInt(i.clicks || '0'), 0);
        const cReach = cInsights.length > 0 ? Math.max(...cInsights.map(i => parseInt(i.reach || '0'))) : 0;

        campaignMetrics.push({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          objective: campaign.objective,
          daily_budget: campaign.daily_budget || null,
          spend: cSpend,
          impressions: cImpressions,
          clicks: cClicks,
          reach: cReach,
          ctr: cImpressions > 0 ? (cClicks / cImpressions * 100).toFixed(2) : '0',
          cpc: cClicks > 0 ? (cSpend / cClicks).toFixed(2) : '0',
        });
      } catch (err) {
        campaignMetrics.push({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          objective: campaign.objective,
          daily_budget: campaign.daily_budget || null,
          spend: 0,
          impressions: 0,
          clicks: 0,
          reach: 0,
          ctr: '0',
          cpc: '0',
        });
      }
    }

    // 3. Enregistrer les dépenses réelles dans GrowthSpend (idempotent)
    const syncResults = [];
    for (const insight of insights) {
      const spend = parseFloat(insight.spend || '0');
      const impressions = parseInt(insight.impressions || '0');
      const clicks = parseInt(insight.clicks || '0');

      if (spend === 0 && impressions === 0 && clicks === 0) continue;

      const result = await upsertGrowthSpend(
        base44,
        accountId,
        insight.date_start,
        spend,
        impressions,
        clicks
      );
      syncResults.push({ date: insight.date_start, spend, ...result });
    }

    // 4. Stocker les métriques dans AppConfig pour le dashboard
    const metrics = await storeLatestMetrics(base44, accountId, campaignMetrics, insights);

    return Response.json({
      success: true,
      account_id: accountId,
      synced_days: syncResults.length,
      today_spend: metrics.today?.spend || 0,
      today_impressions: metrics.today?.impressions || 0,
      today_clicks: metrics.today?.clicks || 0,
      today_ctr: metrics.today?.ctr || 0,
      today_cpc: metrics.today?.cpc || 0,
      campaigns_count: campaigns.length,
      sync_results: syncResults,
      read_only: true,
      modified_campaigns: 0,
    });

  } catch (error) {
    console.error('[syncMetaAdsSpend] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}