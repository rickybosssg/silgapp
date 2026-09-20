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
const DEFAULT_AD_ACCOUNT_ID = '2382788582549104'; // SILGAPP (Read-Only)

// ── WHITELIST HARD-CODÉE : seuls ces comptes sont autorisés ──
// Empêche toute importation de dépenses depuis Eric Compaore ou CDL
// même si META_AD_ACCOUNT_ID est modifié dans AppConfig.
const ALLOWED_AD_ACCOUNT_IDS = new Set([
  '2382788582549104', // SILGAPP (Read-Only)
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
    throw new Error(`Compte publicitaire non autorisé: ${accountId}. Seul le compte SILGAPP (2382788582549104) est whitelisté.`);
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

async function upsertGrowthSpend(base44, accountId, date, spend, impressions, clicks) {
  const idempotencyKey = `meta_spend_${accountId}_${date}`;

  // Vérifier si une entrée existe déjà pour cette clé (idempotence)
  const existing = await base44.asServiceRole.entities.GrowthSpend.filter({
    idempotency_key: idempotencyKey,
  });

  if (existing && existing.length > 0) {
    // Update — Meta peut ajuster les montants rapportés
    const entry = existing[0];
    await base44.asServiceRole.entities.GrowthSpend.update(entry.id, {
      montant: spend,
      description_depense: `Meta Ads ${date} — ${impressions} impressions, ${clicks} clics`,
      date_depense: new Date(date + 'T12:00:00Z').toISOString(),
    });
    return { action: 'updated', id: entry.id };
  }

  // Create
  const entry = await base44.asServiceRole.entities.GrowthSpend.create({
    moteur: 'publicite',
    type_depense: 'autre',
    montant: spend,
    devise: 'FCFA',
    country_code: '',
    idempotency_key: idempotencyKey,
    description_depense: `Meta Ads ${date} — ${impressions} impressions, ${clicks} clics`,
    statut: 'engagee',
    date_depense: new Date(date + 'T12:00:00Z').toISOString(),
  });
  return { action: 'created', id: entry.id };
}

async function storeLatestMetrics(base44, accountId, campaigns, insights) {
  // Stocker les métriques les plus récentes dans AppConfig pour le dashboard
  const today = todayStr();
  const todayInsight = insights.find(i => i.date_start === today) || insights[insights.length - 1];

  const metrics = {
    account_id: accountId,
    synced_at: new Date().toISOString(),
    today: todayInsight ? {
      date: todayInsight.date_start,
      spend: parseFloat(todayInsight.spend || '0'),
      impressions: parseInt(todayInsight.impressions || '0'),
      clicks: parseInt(todayInsight.clicks || '0'),
      ctr: parseFloat(todayInsight.ctr || '0'),
      cpc: parseFloat(todayInsight.cpc || '0'),
    } : null,
    last_7_days: insights.slice(-7).map(i => ({
      date: i.date_start,
      spend: parseFloat(i.spend || '0'),
      impressions: parseInt(i.impressions || '0'),
      clicks: parseInt(i.clicks || '0'),
      ctr: parseFloat(i.ctr || '0'),
      cpc: parseFloat(i.cpc || '0'),
    })),
    campaigns: campaigns.map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      daily_budget: c.daily_budget || null,
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
    const metrics = await storeLatestMetrics(base44, accountId, campaigns, insights);

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