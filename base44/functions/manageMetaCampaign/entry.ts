import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// ═══════════════════════════════════════════════════════════════════════════
// manageMetaCampaign — Moteur de gestion des campagnes Meta Ads (MODE SUPERVISÉ)
// ═══════════════════════════════════════════════════════════════════════════
//
// ACTIONS :
//   READ : get_config, list_campaigns, list_creatives, list_logs,
//          get_campaign_status, sync_campaign_status
//   CREATIVE : create_creative, approve_creative, reject_creative
//   CAMPAIGN DRAFT : create_campaign_draft, approve_campaign, reject_campaign
//   META API : activate_campaign, pause_campaign, resume_campaign
//   CONFIG : set_config (clés protégées bloquées)
//
// SÉCURITÉ :
//   - Toutes les actions Meta API requièrent META_ACQUISITION_ENABLED = true
//   - Le compte est verrouillé sur 234850849367733 (whitelist hardcodée)
//   - Les campagnes sont créées en PAUSED sur Meta — admin doit resume manuellement
//   - Toutes les actions sont journalisées dans AcquisitionLog
//   - Les clés protégées ne peuvent pas être modifiées via set_config
// ═══════════════════════════════════════════════════════════════════════════

const META_API_BASE = 'https://graph.facebook.com/v25.0';
const ALLOWED_AD_ACCOUNT_ID = '234850849367733';

// ── Taux de conversion FCFA → USD (source autoritaire backend) ──
// 1 USD = 600 FCFA (taux métier retenu pour la conversion du budget publicitaire).
// Ce taux sert UNIQUEMENT à la conversion du budget envoyé à Meta (FCFA → cents USD).
// Le frontend (useMetaAdsData.js) utilise la même valeur pour l'affichage mais
// n'est jamais la source de sécurité — le backend reste autoritaire.
const META_USD_TO_FCFA_RATE = 600;

// ── Conversion centralisée : FCFA → cents USD ──
// Meta attend daily_budget en cents de la devise du compte (USD ici).
// Étapes : FCFA → USD (÷ rate) → cents USD (× 100), arrondi à l'entier le plus proche.
// Exemple : 1000 FCFA ÷ 600 = 1.6667 USD × 100 = 166.67 → 167 cents USD = $1.67/jour.
// JAMAIS envoyer daily_budget * 100 directement (traiterait les FCFA comme des cents USD).
function fcfaToUsdCents(budgetFcfa: number): number {
  const usd = budgetFcfa / META_USD_TO_FCFA_RATE;
  const cents = Math.round(usd * 100);
  return cents;
}

const PROTECTED_CONFIG_KEYS = new Set([
  'META_AD_ACCOUNT_LOCKED',
  'META_ALLOWED_COUNTRIES',
  'META_ALLOWED_OBJECTIVES',
  'META_USD_TO_FCFA_RATE', // taux verrouillé — modifiable uniquement via config admin
]);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin uniquement' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // ── Load guardrails ──
    const configs = await base44.asServiceRole.entities.AppConfig.filter({});
    const getConfig = (key) => configs.find(c => c.cle === key)?.valeur;
    const g = {
      killSwitch: getConfig('META_ACQUISITION_ENABLED') === 'true',
      supervisedMode: getConfig('META_SUPERVISED_MODE') !== 'false',
      autoMode: getConfig('META_AUTO_MODE_ENABLED') === 'true',
      dailyBudgetCap: parseInt(getConfig('META_DAILY_BUDGET_CAP') || '1000'),
      maxCampaignsActive: parseInt(getConfig('META_MAX_CAMPAIGNS_ACTIVE') || '1'),
      allowedCountries: JSON.parse(getConfig('META_ALLOWED_COUNTRIES') || '["BF"]'),
      allowedObjectives: JSON.parse(getConfig('META_ALLOWED_OBJECTIVES') || '["OUTCOME_TRAFFIC"]'),
      adAccountLocked: getConfig('META_AD_ACCOUNT_LOCKED') || ALLOWED_AD_ACCOUNT_ID,
    };

    // ── Helper: log action ──
    const logAction = async (action_type, target_type, target_id, target_name, details) => {
      await base44.asServiceRole.entities.AcquisitionLog.create({
        action_type,
        actor_email: user.email,
        target_type,
        target_id: target_id || '',
        target_name: target_name || '',
        details: JSON.stringify(details || {}),
        action_date: new Date().toISOString(),
      }).catch(() => {});
    };

    // ── Helper: get Meta token ──
    const getMetaToken = async () => {
      const { accessToken } = await base44.asServiceRole.connectors.getConnection('meta_ads');
      if (!accessToken) throw new Error('Token Meta Ads non disponible');
      return accessToken;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // READ-ONLY ACTIONS
    // ═══════════════════════════════════════════════════════════════════════

    if (action === 'get_config') {
      return Response.json({ success: true, config: g });
    }

    if (action === 'list_campaigns') {
      const campaigns = await base44.asServiceRole.entities.MetaCampaign.list('-created_date', 100);
      return Response.json({ success: true, campaigns });
    }

    if (action === 'list_creatives') {
      const creatives = await base44.asServiceRole.entities.AdCreative.list('-created_date', 100);
      return Response.json({ success: true, creatives });
    }

    if (action === 'list_logs') {
      const logs = await base44.asServiceRole.entities.AcquisitionLog.list('-action_date', 100);
      return Response.json({ success: true, logs });
    }

    if (action === 'get_campaign_status') {
      const { meta_campaign_id } = body;
      if (!meta_campaign_id) return Response.json({ error: 'meta_campaign_id requis' }, { status: 400 });
      const token = await getMetaToken();
      const res = await fetch(`${META_API_BASE}/${meta_campaign_id}?fields=status,name,daily_budget,configured_status,objective`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return Response.json({ success: true, meta_status: data });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CREATIVE ACTIONS
    // ═══════════════════════════════════════════════════════════════════════

    if (action === 'create_creative') {
      const { name, type_media, image_url, video_url, headline, primary_text, call_to_action, landing_url, meta_objective, platforms, country_codes } = body;
      if (!name) return Response.json({ error: 'name requis' }, { status: 400 });
      const creative = await base44.asServiceRole.entities.AdCreative.create({
        name, type_media: type_media || 'image',
        image_url, video_url, headline, primary_text,
        call_to_action: call_to_action || 'INSTALL_APP',
        landing_url, meta_objective: meta_objective || 'OUTCOME_TRAFFIC',
        platforms: platforms || '["facebook","instagram"]',
        country_codes: country_codes || '["BF"]',
        status: 'draft',
      });
      await logAction('creative_created', 'ad_creative', creative.id, name, { type_media, objective: meta_objective });
      return Response.json({ success: true, creative });
    }

    if (action === 'approve_creative') {
      const { creative_id } = body;
      const creative = await base44.asServiceRole.entities.AdCreative.get(creative_id);
      if (!creative) return Response.json({ error: 'Créatif introuvable' }, { status: 404 });
      await base44.asServiceRole.entities.AdCreative.update(creative_id, {
        status: 'approved', approved_by: user.email, approved_at: new Date().toISOString(),
      });
      await logAction('creative_approved', 'ad_creative', creative_id, creative.name, {});
      return Response.json({ success: true, creative_id, status: 'approved' });
    }

    if (action === 'reject_creative') {
      const { creative_id, rejection_reason } = body;
      const creative = await base44.asServiceRole.entities.AdCreative.get(creative_id);
      if (!creative) return Response.json({ error: 'Créatif introuvable' }, { status: 404 });
      await base44.asServiceRole.entities.AdCreative.update(creative_id, {
        status: 'rejected', rejected_by: user.email, rejected_at: new Date().toISOString(), rejection_reason,
      });
      await logAction('creative_rejected', 'ad_creative', creative_id, creative.name, { reason: rejection_reason });
      return Response.json({ success: true, creative_id, status: 'rejected' });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CAMPAIGN DRAFT ACTIONS (no Meta API call)
    // ═══════════════════════════════════════════════════════════════════════

    if (action === 'create_campaign_draft') {
      const { name, objective, daily_budget, creative_ids, country_codes, target_audience, idempotency_key } = body;
      if (!name) return Response.json({ error: 'name requis' }, { status: 400 });

      // Idempotency check
      if (idempotency_key) {
        const existing = await base44.asServiceRole.entities.MetaCampaign.filter({ idempotency_key });
        if (existing.length > 0) return Response.json({ success: true, already_exists: true, campaign: existing[0] });
      }

      // Validate countries
      const countries = JSON.parse(country_codes || '["BF"]');
      const invalidCountries = countries.filter(c => !g.allowedCountries.includes(c));
      if (invalidCountries.length > 0) {
        return Response.json({ error: `Pays non autorisés: ${invalidCountries.join(', ')}. Autorisés: ${g.allowedCountries.join(', ')}` }, { status: 400 });
      }

      // Validate objective
      if (!g.allowedObjectives.includes(objective)) {
        return Response.json({ error: `Objectif non autorisé: ${objective}. Autorisés: ${g.allowedObjectives.join(', ')}` }, { status: 400 });
      }

      // Validate budget (FCFA): required, finite, > 0 and <= protected cap.
      const draftBudgetFcfa = Number(daily_budget);
      if (!Number.isFinite(draftBudgetFcfa) || draftBudgetFcfa <= 0) {
        return Response.json({ error: 'Budget doit être > 0 FCFA' }, { status: 400 });
      }
      if (draftBudgetFcfa > g.dailyBudgetCap) {
        return Response.json({ error: `Budget ${draftBudgetFcfa} > plafond ${g.dailyBudgetCap} FCFA` }, { status: 400 });
      }

      // Validate creatives
      if (creative_ids) {
        const ids = JSON.parse(creative_ids);
        for (const id of ids) {
          const creative = await base44.asServiceRole.entities.AdCreative.get(id);
          if (!creative || creative.status !== 'approved') {
            return Response.json({ error: `Créatif ${id} non approuvé ou introuvable` }, { status: 400 });
          }
        }
      }

      const campaign = await base44.asServiceRole.entities.MetaCampaign.create({
        name, objective, daily_budget: draftBudgetFcfa, creative_ids, country_codes, target_audience,
        idempotency_key: idempotency_key || `mc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: 'draft',
      });
      await logAction('campaign_created', 'meta_campaign', campaign.id, name, { objective, daily_budget: draftBudgetFcfa, countries });
      return Response.json({ success: true, campaign });
    }

    if (action === 'approve_campaign') {
      const { campaign_id } = body;
      const campaign = await base44.asServiceRole.entities.MetaCampaign.get(campaign_id);
      if (!campaign) return Response.json({ error: 'Campagne introuvable' }, { status: 404 });
      if (campaign.status !== 'draft' && campaign.status !== 'pending_approval') {
        return Response.json({ error: `Statut ${campaign.status} — ne peut être approuvée` }, { status: 400 });
      }
      await base44.asServiceRole.entities.MetaCampaign.update(campaign_id, {
        status: 'approved', approved_by: user.email, approved_at: new Date().toISOString(),
      });
      await logAction('campaign_approved', 'meta_campaign', campaign_id, campaign.name, {});
      return Response.json({ success: true, campaign_id, status: 'approved' });
    }

    if (action === 'reject_campaign') {
      const { campaign_id, rejection_reason } = body;
      const campaign = await base44.asServiceRole.entities.MetaCampaign.get(campaign_id);
      if (!campaign) return Response.json({ error: 'Campagne introuvable' }, { status: 404 });
      await base44.asServiceRole.entities.MetaCampaign.update(campaign_id, {
        status: 'rejected', rejected_by: user.email, rejected_at: new Date().toISOString(), rejection_reason,
      });
      await logAction('campaign_rejected', 'meta_campaign', campaign_id, campaign.name, { reason: rejection_reason });
      return Response.json({ success: true, campaign_id, status: 'rejected' });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // META API ACTIONS (require kill switch ON)
    // ═══════════════════════════════════════════════════════════════════════

    if (action === 'activate_campaign') {
      if (!g.killSwitch) {
        return Response.json({ error: 'Kill switch META_ACQUISITION_ENABLED = false. Activation impossible.' }, { status: 403 });
      }

      const { campaign_id } = body;
      const campaign = await base44.asServiceRole.entities.MetaCampaign.get(campaign_id);
      if (!campaign) return Response.json({ error: 'Campagne introuvable' }, { status: 404 });
      if (campaign.status !== 'approved') {
        return Response.json({ error: `Campagne statut ${campaign.status} — doit être approved` }, { status: 400 });
      }

      if (campaign.meta_campaign_id) {
        return Response.json({
          error: `Campagne déjà liée à Meta (meta_campaign_id=${campaign.meta_campaign_id}). Utilisez resume_campaign pour la reprendre.`,
          reconciliation_required: true,
          existing_meta_campaign_id: campaign.meta_campaign_id,
        }, { status: 409 });
      }

      // Check max active campaigns
      const activeCampaigns = await base44.asServiceRole.entities.MetaCampaign.filter({ status: 'active' });
      if (activeCampaigns.length >= g.maxCampaignsActive) {
        return Response.json({ error: `Max campagnes actives atteint (${g.maxCampaignsActive})` }, { status: 400 });
      }

      // Re-validate guardrails
      const countries = JSON.parse(campaign.country_codes || '["BF"]');
      if (countries.some(c => !g.allowedCountries.includes(c))) {
        return Response.json({ error: 'Pays non autorisés' }, { status: 400 });
      }
      if (!g.allowedObjectives.includes(campaign.objective)) {
        return Response.json({ error: 'Objectif non autorisé' }, { status: 400 });
      }
      // Garde-fou budget : doit être > 0 et <= plafond métier (FCFA)
      const budgetFcfa = Number(campaign.daily_budget);
      if (!Number.isFinite(budgetFcfa) || budgetFcfa <= 0) {
        return Response.json({ error: 'Budget doit être > 0 FCFA' }, { status: 400 });
      }
      if (budgetFcfa > g.dailyBudgetCap) {
        return Response.json({ error: `Budget ${budgetFcfa} FCFA > plafond ${g.dailyBudgetCap} FCFA` }, { status: 400 });
      }
      // Conversion FCFA → cents USD (compte Meta en USD)
      // 1000 FCFA → 167 cents USD ($1.67) — JAMAIS 100000 cents ($1000)
      const budgetUsdCents = fcfaToUsdCents(budgetFcfa);
      // Vérification de cohérence : le résultat ne doit jamais dépasser budgetFcfa
      // (si rate=600, 1000 FCFA → 167 cents ; si on obtenait 100000, ce serait un bug)
      if (budgetUsdCents > budgetFcfa) {
        await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, {
          error: `Conversion incohérente: ${budgetFcfa} FCFA → ${budgetUsdCents} cents USD (attendu < ${budgetFcfa})`,
        });
        return Response.json({ error: `Erreur de conversion budget: ${budgetFcfa} FCFA → ${budgetUsdCents} cents USD` }, { status: 500 });
      }

      // Verify account is whitelisted
      if (g.adAccountLocked !== ALLOWED_AD_ACCOUNT_ID) {
        return Response.json({ error: 'Compte publicitaire non autorisé' }, { status: 403 });
      }

      // Validate creatives
      let creativeIds = [];
      if (campaign.creative_ids) {
        creativeIds = JSON.parse(campaign.creative_ids);
        for (const id of creativeIds) {
          const creative = await base44.asServiceRole.entities.AdCreative.get(id);
          if (!creative || creative.status !== 'approved') {
            return Response.json({ error: `Créatif ${id} non approuvé` }, { status: 400 });
          }
        }
      }

      const token = await getMetaToken();
      const accountId = `act_${g.adAccountLocked}`;

      // 1. Create campaign on Meta (PAUSED — admin must manually resume)
      // Meta API v20+ requires explicit ad set budget sharing opt-out for this flow.
      const campaignRes = await fetch(`${META_API_BASE}/${accountId}/campaigns`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaign.name,
          objective: campaign.objective,
          status: 'PAUSED',
          special_ad_categories: '[]',
          is_adset_budget_sharing_enabled: false,
        }),
      });
      const campaignData = await campaignRes.json();
      if (campaignData.error) {
        await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, {
          api: 'create_campaign',
          error: campaignData.error.message,
          error_code: campaignData.error.code,
          error_subcode: campaignData.error.error_subcode,
          fbtrace_id: campaignData.error.fbtrace_id,
        });
        throw new Error(`Meta campaign: ${campaignData.error.message}`);
      }
      const metaCampaignId = campaignData.id;
      await logAction('meta_api_called', 'meta_campaign', campaign_id, campaign.name, { api: 'create_campaign', meta_id: metaCampaignId });

      // 2. Create ad set on Meta (PAUSED) — ciblage Ouagadougou + 25km, 18-45 ans
      const OUAGADOUGOU_CITY_KEY = '193625'; // Meta city key pour Ouagadougou (région Kadiogo, BF)
      const adsetRes = await fetch(`${META_API_BASE}/${accountId}/adsets`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${campaign.name} - AdSet`,
          campaign_id: metaCampaignId,
          daily_budget: budgetUsdCents, // FCFA → USD → cents USD (ex: 1000 FCFA → 167 cents = $1.67)
          billing_event: 'IMPRESSIONS',
          optimization_goal: campaign.objective === 'OUTCOME_TRAFFIC' ? 'LINK_CLICKS' : 'OFFSITE_CONVERSIONS',
          targeting: {
            geo_locations: {
              cities: [{ key: OUAGADOUGOU_CITY_KEY, radius: 25, distance_unit: 'kilometer' }],
            },
            age_min: 18,
            age_max: 45,
            genders: [0], // 0 = tous genres
          },
          status: 'PAUSED',
        }),
      });
      const adsetData = await adsetRes.json();
      if (adsetData.error) {
        await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, { api: 'create_adset', error: adsetData.error.message });
        throw new Error(`Meta adset: ${adsetData.error.message}`);
      }
      await logAction('meta_api_called', 'meta_campaign', campaign_id, campaign.name, { api: 'create_adset', meta_id: adsetData.id, targeting: 'Ouagadougou+25km, 18-45, all genders' });

      // 3. Create ad creative on Meta (using image_url from approved AdCreative)
      let metaAdId = null;
      let metaCreativeId = null;
      if (creativeIds.length > 0) {
        const adCreative = await base44.asServiceRole.entities.AdCreative.get(creativeIds[0]);
        if (adCreative && adCreative.image_url) {
          const creativeRes = await fetch(`${META_API_BASE}/${accountId}/adcreatives`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: adCreative.name,
              title: adCreative.headline || campaign.name,
              body: adCreative.primary_text || '',
              image_url: adCreative.image_url,
              object_url: adCreative.landing_url || 'https://silga-dispatch-go.base44.app/telecharger',
              call_to_action_type: adCreative.call_to_action || 'INSTALL_APP',
            }),
          });
          const creativeData = await creativeRes.json();
          if (creativeData.error) {
            await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, { api: 'create_creative', error: creativeData.error.message });
            throw new Error(`Meta creative: ${creativeData.error.message}`);
          }
          metaCreativeId = creativeData.id;
          await logAction('meta_api_called', 'meta_campaign', campaign_id, campaign.name, { api: 'create_creative', meta_id: metaCreativeId });

          // Update AdCreative with Meta creative ID
          await base44.asServiceRole.entities.AdCreative.update(adCreative.id, { meta_creative_id: metaCreativeId });

          // 4. Create ad on Meta (PAUSED)
          const adRes = await fetch(`${META_API_BASE}/${accountId}/ads`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `${campaign.name} - Ad`,
              adset_id: adsetData.id,
              creative: { creative_id: metaCreativeId },
              status: 'PAUSED',
            }),
          });
          const adData = await adRes.json();
          if (adData.error) {
            await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, { api: 'create_ad', error: adData.error.message });
            throw new Error(`Meta ad: ${adData.error.message}`);
          }
          metaAdId = adData.id;
          await logAction('meta_api_called', 'meta_campaign', campaign_id, campaign.name, { api: 'create_ad', meta_id: metaAdId });
        }
      }

      // 5. Update MetaCampaign with Meta IDs (status = paused since Meta campaign is PAUSED)
      await base44.asServiceRole.entities.MetaCampaign.update(campaign_id, {
        status: 'paused',
        meta_campaign_id: metaCampaignId,
        activated_at: new Date().toISOString(),
      });
      await logAction('campaign_activated', 'meta_campaign', campaign_id, campaign.name, {
        meta_campaign_id: metaCampaignId,
        adset_id: adsetData.id,
        ad_id: metaAdId,
        creative_id: metaCreativeId,
        meta_status: 'PAUSED',
        targeting: 'Ouagadougou+25km, 18-45, all genders',
      });

      return Response.json({
        success: true, campaign_id, meta_campaign_id: metaCampaignId, meta_adset_id: adsetData.id,
        meta_ad_id: metaAdId, meta_creative_id: metaCreativeId,
        meta_status: 'PAUSED',
        targeting: 'Ouagadougou + 25km, 18-45 ans, tous genres',
        message: 'Campagne créée sur Meta en PAUSED. Utilisez resume_campaign pour démarrer la diffusion.',
      });
    }

    const discoverCampaignChildren = async (token, metaCampaignId) => {
      const adsetsRes = await fetch(`${META_API_BASE}/${metaCampaignId}/adsets?fields=id,name,status,effective_status,daily_budget&limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const adsetsData = await adsetsRes.json();
      if (adsetsData.error) throw new Error(`Liste Ad Sets: ${adsetsData.error.message}`);

      const adsRes = await fetch(`${META_API_BASE}/${metaCampaignId}/ads?fields=id,name,status,effective_status&limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const adsData = await adsRes.json();
      if (adsData.error) throw new Error(`Liste Ads: ${adsData.error.message}`);

      return { adsets: adsetsData.data || [], ads: adsData.data || [] };
    };

    const setMetaObjectStatus = async (token, objectId, targetStatus) => {
      const res = await fetch(`${META_API_BASE}/${objectId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      const data = await res.json();
      return data.error ? { success: false, error: data.error.message } : { success: true };
    };

    if (action === 'pause_campaign') {
      if (!g.killSwitch) return Response.json({ error: 'Kill switch OFF' }, { status: 403 });
      const { campaign_id } = body;
      const campaign = await base44.asServiceRole.entities.MetaCampaign.get(campaign_id);
      if (!campaign || !campaign.meta_campaign_id) return Response.json({ error: 'Campagne/Meta ID introuvable' }, { status: 404 });
      const token = await getMetaToken();
      const metaCampaignId = campaign.meta_campaign_id;

      let adsets, ads;
      try {
        ({ adsets, ads } = await discoverCampaignChildren(token, metaCampaignId));
      } catch (e) {
        await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, { api: 'pause_campaign', step: 'discover', error: e.message });
        return Response.json({ error: e.message }, { status: 500 });
      }

      const campaignResult = await setMetaObjectStatus(token, metaCampaignId, 'PAUSED');
      if (!campaignResult.success) {
        await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, { api: 'pause_campaign', step: 'campaign', error: campaignResult.error });
        return Response.json({ error: `Pause Campaign échouée: ${campaignResult.error}` }, { status: 500 });
      }

      const adsetResults = [];
      for (const adset of adsets) {
        const result = await setMetaObjectStatus(token, adset.id, 'PAUSED');
        adsetResults.push({ id: adset.id, name: adset.name, success: result.success, error: result.error });
        if (!result.success) {
          await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, { api: 'pause_campaign', step: 'adset', meta_id: adset.id, error: result.error });
        }
      }
      const failedAdsets = adsetResults.filter(r => !r.success);
      if (failedAdsets.length > 0) {
        await base44.asServiceRole.entities.MetaCampaign.update(campaign_id, { status: 'paused' });
        return Response.json({ error: `Pause Ad Set échouée pour ${failedAdsets.length}/${adsets.length}`, details: failedAdsets }, { status: 500 });
      }

      const adResults = [];
      for (const ad of ads) {
        const result = await setMetaObjectStatus(token, ad.id, 'PAUSED');
        adResults.push({ id: ad.id, name: ad.name, success: result.success, error: result.error });
        if (!result.success) {
          await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, { api: 'pause_campaign', step: 'ad', meta_id: ad.id, error: result.error });
        }
      }
      const failedAds = adResults.filter(r => !r.success);
      if (failedAds.length > 0) {
        await base44.asServiceRole.entities.MetaCampaign.update(campaign_id, { status: 'paused' });
        return Response.json({ error: `Pause Ad échouée pour ${failedAds.length}/${ads.length}`, details: failedAds }, { status: 500 });
      }

      await base44.asServiceRole.entities.MetaCampaign.update(campaign_id, { status: 'paused', paused_at: new Date().toISOString() });
      await logAction('campaign_paused', 'meta_campaign', campaign_id, campaign.name, { meta_id: metaCampaignId, adsets: adsetResults, ads: adResults });
      return Response.json({ success: true, campaign_id, status: 'paused', adsets: adsetResults, ads: adResults });
    }

    if (action === 'resume_campaign') {
      if (!g.killSwitch) return Response.json({ error: 'Kill switch OFF' }, { status: 403 });
      const { campaign_id } = body;
      const campaign = await base44.asServiceRole.entities.MetaCampaign.get(campaign_id);
      if (!campaign || !campaign.meta_campaign_id) return Response.json({ error: 'Campagne/Meta ID introuvable' }, { status: 404 });
      const token = await getMetaToken();
      const metaCampaignId = campaign.meta_campaign_id;

      let adsets, ads;
      try {
        ({ adsets, ads } = await discoverCampaignChildren(token, metaCampaignId));
      } catch (e) {
        await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, { api: 'resume_campaign', step: 'discover', error: e.message });
        return Response.json({ error: e.message }, { status: 500 });
      }
      if (adsets.length === 0) {
        await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, { api: 'resume_campaign', step: 'discover', error: 'Aucun Ad Set trouvé' });
        return Response.json({ error: 'Aucun Ad Set trouvé — activation incomplète' }, { status: 500 });
      }
      if (ads.length === 0) {
        await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, { api: 'resume_campaign', step: 'discover', error: 'Aucune Ad trouvée' });
        return Response.json({ error: 'Aucune Ad trouvée — activation incomplète' }, { status: 500 });
      }

      const campaignResult = await setMetaObjectStatus(token, metaCampaignId, 'ACTIVE');
      if (!campaignResult.success) {
        await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, { api: 'resume_campaign', step: 'campaign', error: campaignResult.error });
        return Response.json({ error: `Activation Campaign échouée: ${campaignResult.error}` }, { status: 500 });
      }

      const adsetResults = [];
      for (const adset of adsets) {
        const result = await setMetaObjectStatus(token, adset.id, 'ACTIVE');
        adsetResults.push({ id: adset.id, name: adset.name, success: result.success, error: result.error });
        if (!result.success) {
          await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, { api: 'resume_campaign', step: 'adset', meta_id: adset.id, error: result.error });
        }
      }
      const failedAdsets = adsetResults.filter(r => !r.success);
      if (failedAdsets.length > 0) {
        return Response.json({ error: `Activation Ad Set échouée pour ${failedAdsets.length}/${adsets.length}`, details: failedAdsets, level_reached: 'adset' }, { status: 500 });
      }

      const adResults = [];
      for (const ad of ads) {
        const result = await setMetaObjectStatus(token, ad.id, 'ACTIVE');
        adResults.push({ id: ad.id, name: ad.name, success: result.success, error: result.error });
        if (!result.success) {
          await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, { api: 'resume_campaign', step: 'ad', meta_id: ad.id, error: result.error });
        }
      }
      const failedAds = adResults.filter(r => !r.success);
      if (failedAds.length > 0) {
        return Response.json({ error: `Activation Ad échouée pour ${failedAds.length}/${ads.length}`, details: failedAds, level_reached: 'ad' }, { status: 500 });
      }

      await base44.asServiceRole.entities.MetaCampaign.update(campaign_id, { status: 'active' });
      await logAction('campaign_activated', 'meta_campaign', campaign_id, campaign.name, { meta_id: metaCampaignId, adsets: adsetResults, ads: adResults });
      return Response.json({ success: true, campaign_id, status: 'active', adsets: adsetResults, ads: adResults });
    }

    if (action === 'sync_campaign_status') {
      const { campaign_id } = body;
      const campaign = await base44.asServiceRole.entities.MetaCampaign.get(campaign_id);
      if (!campaign || !campaign.meta_campaign_id) return Response.json({ error: 'Campagne/Meta ID introuvable' }, { status: 404 });
      const token = await getMetaToken();
      const metaCampaignId = campaign.meta_campaign_id;

      const res = await fetch(`${META_API_BASE}/${metaCampaignId}?fields=id,name,status,effective_status,daily_budget,objective`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      let adsets = [];
      let ads = [];
      try {
        ({ adsets, ads } = await discoverCampaignChildren(token, metaCampaignId));
      } catch (e) {
        await logAction('meta_api_error', 'meta_campaign', campaign_id, campaign.name, { api: 'sync_campaign_status', step: 'discover', error: e.message });
      }

      const campaignActive = data.status === 'ACTIVE';
      const allAdsetsActive = adsets.length > 0 && adsets.every(a => a.status === 'ACTIVE');
      const allAdsActive = ads.length > 0 && ads.every(a => a.status === 'ACTIVE');
      const chainActive = campaignActive && allAdsetsActive && allAdsActive;
      const chainPaused = data.status === 'PAUSED' && adsets.every(a => a.status === 'PAUSED') && ads.every(a => a.status === 'PAUSED');
      const localStatus = chainActive ? 'active' : 'paused';

      if (localStatus !== campaign.status) {
        await base44.asServiceRole.entities.MetaCampaign.update(campaign_id, { status: localStatus });
        await logAction('config_changed', 'meta_campaign', campaign_id, campaign.name, {
          sync: 'status_reconciled',
          old: campaign.status,
          new: localStatus,
          chainActive,
          chainPaused,
        });
      }

      return Response.json({
        success: true,
        meta_status: data,
        adsets,
        ads,
        chain_active: chainActive,
        chain_paused: chainPaused,
        local_status: localStatus,
        partial_activation: !chainActive && !chainPaused && data.status !== 'DELETED',
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONFIG ACTIONS
    // ═══════════════════════════════════════════════════════════════════════

    if (action === 'set_config') {
      const { key, value } = body;
      if (PROTECTED_CONFIG_KEYS.has(key)) {
        return Response.json({ error: `Clé protégée — modification interdite via cette fonction` }, { status: 403 });
      }
      const existing = await base44.asServiceRole.entities.AppConfig.filter({ cle: key });
      const oldValue = existing[0]?.valeur;
      if (existing.length > 0) {
        await base44.asServiceRole.entities.AppConfig.update(existing[0].id, { valeur: String(value) });
      } else {
        await base44.asServiceRole.entities.AppConfig.create({ cle: key, valeur: String(value) });
      }
      await logAction('config_changed', 'config', key, key, { old: oldValue, new: value });
      return Response.json({ success: true, key, value });
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (error) {
    console.error('[manageMetaCampaign] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
