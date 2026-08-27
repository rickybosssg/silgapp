import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * configurerReactivationAuto — Configuration du moteur automatique de réactivation
 *
 * Permet à l'admin de :
 *   - Activer/désactiver le moteur
 *   - Mettre en pause
 *   - Activer le mode test avec téléphones de test
 *   - Configurer le cooldown
 *   - Configurer les messages J0/J+2/J+5 (A/B)
 *   - Initialiser la campagne automatique
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentification requise' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 });

    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

    const body = await req.json();
    const { action } = body;

    if (action === 'get_config') {
      return Response.json(await getConfig(base44));
    }

    if (action === 'set_config') {
      const { config } = body;
      await setConfig(base44, config);
      return Response.json({ success: true });
    }

    if (action === 'toggle_engine') {
      const current = await getConfig(base44);
      await setConfig(base44, { REACTIVATION_AUTO_ENABLED: current.enabled ? 'false' : 'true' });
      return Response.json({ success: true, enabled: !current.enabled });
    }

    if (action === 'toggle_pause') {
      const current = await getConfig(base44);
      await setConfig(base44, { REACTIVATION_AUTO_PAUSED: current.paused ? 'false' : 'true' });
      return Response.json({ success: true, paused: !current.paused });
    }

    if (action === 'toggle_test_mode') {
      const current = await getConfig(base44);
      await setConfig(base44, { REACTIVATION_TEST_MODE: current.testMode ? 'false' : 'true' });
      return Response.json({ success: true, testMode: !current.testMode });
    }

    if (action === 'set_test_phones') {
      const { phones } = body;
      await setConfig(base44, { REACTIVATION_TEST_PHONES: JSON.stringify(phones || []) });
      return Response.json({ success: true });
    }

    if (action === 'init_campaign') {
      // Créer ou récupérer la campagne automatique
      const existing = await base44.asServiceRole.entities.ReactivationCampaign.filter({
        is_automatic: true,
      });
      if (existing.length > 0) {
        return Response.json({ success: true, campaign_id: existing[0].id, already_exists: true });
      }

      const campaign = await base44.asServiceRole.entities.ReactivationCampaign.create({
        name: 'Réactivation Automatique J0/J+2/J+5',
        status: 'completed', // Reste "completed" mais is_automatic=true
        segment_type: 'push_active',
        is_automatic: true,
        is_ab_test: true,
        control_group_pct: 15,
        attribution_window_hours: 72,
        title: 'SILGAPP vous manque ?',
        message: 'Réactivation automatique',
        smart_segment: 'all',
        push_interval_days: 2,
        push_interval_2_days: 3,
        cooldown_days: 30,
        test_mode: false,
        scenario_paused: false,
        inactive_days_min: 30,
        country_code: '',
        city: '',
        promo_cost: 0,
      });
      return Response.json({ success: true, campaign_id: campaign.id });
    }

    if (action === 'update_campaign') {
      const { campaign_id, updates } = body;
      if (!campaign_id) return Response.json({ error: 'campaign_id requis' }, { status: 400 });
      await base44.asServiceRole.entities.ReactivationCampaign.update(campaign_id, updates);
      return Response.json({ success: true });
    }

    if (action === 'get_scenario_stats') {
      const { campaign_id } = body;
      const filter = campaign_id ? { campaign_id } : {};
      const scenarios = await base44.asServiceRole.entities.ReactivationScenario.filter(filter);

      const stats = {
        total: scenarios.length,
        active: scenarios.filter((s: any) => s.status === 'active').length,
        converted: scenarios.filter((s: any) => s.status === 'converted').length,
        completed: scenarios.filter((s: any) => s.status === 'completed').length,
        expired: scenarios.filter((s: any) => s.status === 'expired').length,
        by_segment: {
          vip: scenarios.filter((s: any) => s.segment === 'vip').length,
          regular: scenarios.filter((s: any) => s.segment === 'regular').length,
          occasional: scenarios.filter((s: any) => s.segment === 'occasional').length,
          no_course: scenarios.filter((s: any) => s.segment === 'no_course').length,
        },
        by_step: {
          j0_sent: scenarios.filter((s: any) => s.j0_sent_at).length,
          j2_sent: scenarios.filter((s: any) => s.j2_sent_at).length,
          j5_sent: scenarios.filter((s: any) => s.j5_sent_at).length,
        },
        by_variant: {
          A: scenarios.filter((s: any) => s.ab_variant === 'A').length,
          B: scenarios.filter((s: any) => s.ab_variant === 'B').length,
        },
        control_group: scenarios.filter((s: any) => s.is_control_group).length,
        revenue: scenarios.reduce((sum: number, s: any) => sum + (s.revenue || 0), 0),
        commission: scenarios.reduce((sum: number, s: any) => sum + (s.commission || 0), 0),
      };
      return Response.json(stats);
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (error) {
    console.error('[configurerReactivationAuto] Erreur:', error);
    return Response.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getConfig(base44: any) {
  const configs = await base44.asServiceRole.entities.AppConfig.list().catch(() => []);
  const map: Record<string, string> = {};
  for (const c of configs) {
    if (c.cle) map[c.cle] = c.valeur;
  }
  let testPhones: string[] = [];
  try { testPhones = JSON.parse(map['REACTIVATION_TEST_PHONES'] || '[]'); } catch {}

  const campaign = await base44.asServiceRole.entities.ReactivationCampaign.filter({
    is_automatic: true,
  }).catch(() => []);

  return {
    enabled: map['REACTIVATION_AUTO_ENABLED'] === 'true',
    paused: map['REACTIVATION_AUTO_PAUSED'] === 'true',
    testMode: map['REACTIVATION_TEST_MODE'] === 'true',
    testPhones,
    cooldownDays: Number(map['REACTIVATION_COOLDOWN_DAYS']) || 30,
    attributionWindowHours: Number(map['REACTIVATION_ATTRIBUTION_WINDOW_HOURS']) || 72,
    messages: {
      j0_a: map['REACTIVATION_J0_MESSAGE_A'] || '',
      j0_b: map['REACTIVATION_J0_MESSAGE_B'] || '',
      j2_a: map['REACTIVATION_J2_MESSAGE_A'] || '',
      j2_b: map['REACTIVATION_J2_MESSAGE_B'] || '',
      j5_a: map['REACTIVATION_J5_MESSAGE_A'] || '',
      j5_b: map['REACTIVATION_J5_MESSAGE_B'] || '',
    },
    titles: {
      j0: map['REACTIVATION_J0_TITLE'] || '',
      j2: map['REACTIVATION_J2_TITLE'] || '',
      j5: map['REACTIVATION_J5_TITLE'] || '',
    },
    campaign_id: campaign[0]?.id || null,
  };
}

async function setConfig(base44: any, config: Record<string, string>) {
  for (const [key, value] of Object.entries(config)) {
    const existing = await base44.asServiceRole.entities.AppConfig.filter({ cle: key });
    if (existing.length > 0) {
      await base44.asServiceRole.entities.AppConfig.update(existing[0].id, { valeur: value });
    } else {
      await base44.asServiceRole.entities.AppConfig.create({
        cle: key,
        valeur: value,
        description: `Configuration moteur de réactivation automatique — ${key}`,
      });
    }
  }
}