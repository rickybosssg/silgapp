import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  getReactivationConfig,
  getAutomaticCampaign,
  findEligibleClients,
  createScenario,
  processPendingScenarios,
  checkScenarioConversion,
  computeSmartSegment,
} from '../../shared/reactivationScenarioEngine.ts';

// Hash déterministe local (identique à reactivationScenarioEngine.ts)
function hashClientIdForDryRun(clientId: string): number {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = ((hash << 5) - hash) + clientId.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * moteurReactivationAuto — Moteur automatique de réactivation J0/J+2/J+5
 *
 * Appelé par automation planifiée (toutes les 6h) ou manuellement par l'admin.
 *
 * Étapes :
 *   1. Vérifie si le moteur est activé et non en pause
 *   2. Vérifie les conversions sur les scénarios actifs (arrêt immédiat)
 *   3. Traite les pushes en attente (J+2, J+5)
 *   4. Crée de nouveaux scénarios J0 pour les clients éligibles
 *
 * NE MODIFIE PAS : Dispatch V2, GPS, tarification, comptabilité, VENUS, auth.
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // Auth admin pour lancement manuel, ou appel automatisé sans auth
    const url = new URL(req.url);
    const isManual = url.searchParams.get('manual') === 'true';
    if (isManual) {
      const user = await base44.auth.me().catch(() => null);
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
      }
    }

    // Lire le body pour le mode dry-run (POST) ou query param (GET)
    let bodyData: any = null;
    try { bodyData = await req.json(); } catch {}
    const isDryRun = url.searchParams.get('dry_run') === 'true' || bodyData?.dry_run === true;

    const config = await getReactivationConfig(base44);

    // ── Mode dry-run : compter les éligibles sans envoyer ──

    // ── 1. Vérifier si le moteur est activé ──
    if (!config.enabled && !isDryRun) {
      return Response.json({ success: true, skipped: 'engine_disabled' });
    }
    if (config.paused && !isDryRun) {
      return Response.json({ success: true, skipped: 'engine_paused' });
    }

    // ── 2. Récupérer la campagne automatique ──
    const campaign = await getAutomaticCampaign(base44);
    if (!campaign) {
      return Response.json({
        success: false,
        error: 'Aucune campagne automatique configurée. Créez une campagne avec is_automatic=true.',
      }, { status: 400 });
    }

    // ── Dry-run : retourner les stats sans envoyer ──
    if (isDryRun) {
      const maxNewScenarios = config.testMode ? 10 : 500;
      const eligibleClients = await findEligibleClients(base44, config, campaign, maxNewScenarios);

      // Compter les clients déjà dans un scénario actif ou en cooldown
      const activeScenarios = await base44.asServiceRole.entities.ReactivationScenario.filter({ status: 'active' });
      const activeClientIds = new Set(activeScenarios.map((s: any) => s.client_id));

      const cooldownScenarios = await base44.asServiceRole.entities.ReactivationScenario.filter({
        status: ['completed', 'expired', 'converted'],
      });
      const now = Date.now();
      const cooldownMs = config.cooldownDays * 86400000;
      const inCooldown = new Set<string>();
      for (const s of cooldownScenarios) {
        const refDate = s.cooldown_expires_at ? new Date(s.cooldown_expires_at).getTime() :
                       s.j5_sent_at ? new Date(s.j5_sent_at).getTime() + cooldownMs :
                       s.j0_sent_at ? new Date(s.j0_sent_at).getTime() + cooldownMs : 0;
        if (refDate && now < refDate) inCooldown.add(s.client_id);
      }

      // Compter les clients sans token FCM valide
      const allClients = await base44.asServiceRole.entities.ClientExterne.list();
      const allTokens = await base44.asServiceRole.entities.NotificationToken.filter({ user_type: 'client', actif: true });
      const tokenByClientEmail: Record<string, any> = {};
      for (const t of allTokens) {
        if (t.user_email) tokenByClientEmail[t.user_email] = t;
      }

      let noValidToken = 0;
      let withValidToken = 0;
      const segmentCounts: Record<string, number> = { vip: 0, regular: 0, occasional: 0, no_course: 0 };

      for (const c of allClients) {
        const token = c.user_email ? tokenByClientEmail[c.user_email] || null : null;
        if (!token || !token.token || String(token.token).startsWith('web_')) {
          noValidToken++;
        } else {
          withValidToken++;
        }
        const seg = computeSmartSegment(c);
        segmentCounts[seg]++;
      }

      // Simuler le groupe contrôle et l'A/B
      const controlPct = campaign.control_group_pct || 0;
      let controlCount = 0;
      let willReceiveJ0 = 0;
      for (const e of eligibleClients) {
        const hash = hashClientIdForDryRun(e.client.id);
        const isControl = controlPct > 0 && (hash % 100) < controlPct;
        if (isControl) controlCount++;
        else willReceiveJ0++;
      }

      return Response.json({
        success: true,
        dry_run: true,
        test_mode: config.testMode,
        enabled: config.enabled,
        paused: config.paused,
        campaign_id: campaign.id,
        total_clients: allClients.length,
        eligible_total: eligibleClients.length,
        by_segment: {
          vip: eligibleClients.filter((e: any) => e.segment === 'vip').length,
          regular: eligibleClients.filter((e: any) => e.segment === 'regular').length,
          occasional: eligibleClients.filter((e: any) => e.segment === 'occasional').length,
          no_course: eligibleClients.filter((e: any) => e.segment === 'no_course').length,
        },
        will_receive_j0: willReceiveJ0,
        control_group: controlCount,
        no_valid_token: noValidToken,
        with_valid_token: withValidToken,
        already_in_active_scenario: activeClientIds.size,
        in_cooldown: inCooldown.size,
      });
    }

    // ── 3. Vérifier les conversions sur les scénarios actifs ──
    const activeScenarios = await base44.asServiceRole.entities.ReactivationScenario.filter({
      status: 'active',
    });

    let convertedCount = 0;
    for (const s of activeScenarios) {
      const wasConverted = await checkScenarioConversion(base44, s, config);
      if (wasConverted) convertedCount++;
    }

    // ── 4. Traiter les pushes en attente (J+2, J+5) ──
    const { j2Sent, j5Sent, expired, errors } = await processPendingScenarios(base44, config, campaign);

    // ── 5. Créer de nouveaux scénarios J0 ──
    const maxNewScenarios = config.testMode ? 10 : 50;
    const eligibleClients = await findEligibleClients(base44, config, campaign, maxNewScenarios);
    let newScenarios = 0;
    for (const eligible of eligibleClients) {
      try {
        const scenario = await createScenario(base44, config, campaign, eligible);
        if (scenario) newScenarios++;
      } catch (err) {
        console.error('[MOTEUR REACTIVATION] Erreur création scénario:', err);
      }
    }

    // ── 6. Recalculer les stats de la campagne ──
    await recalculateCampaignStats(base44, campaign.id);

    return Response.json({
      success: true,
      converted: convertedCount,
      j2_sent: j2Sent,
      j5_sent: j5Sent,
      expired,
      new_scenarios: newScenarios,
      errors,
      test_mode: config.testMode,
    });
  } catch (error) {
    console.error('[MOTEUR REACTIVATION] Erreur:', error);
    return Response.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

// ── Recalculer les stats agrégées de la campagne ────────────────────────────
async function recalculateCampaignStats(base44: any, campaignId: string) {
  const recipients = await base44.asServiceRole.entities.ReactivationCampaignRecipient.filter({
    campaign_id: campaignId,
  });
  const scenarios = await base44.asServiceRole.entities.ReactivationScenario.filter({
    campaign_id: campaignId,
  });

  const sentCount = recipients.filter((r: any) => ['sent', 'opened', 'converted'].includes(r.status)).length;
  const failedCount = recipients.filter((r: any) => r.status === 'failed').length;
  const controlCount = recipients.filter((r: any) => r.is_control_group).length;
  const openedCount = recipients.filter((r: any) => ['opened', 'converted'].includes(r.status)).length;
  const courseCreatedCount = recipients.filter((r: any) => r.course_created_at).length;
  const courseCompletedCount = recipients.filter((r: any) => r.course_completed_at).length;
  const revenue = recipients.reduce((sum: number, r: any) => sum + (r.revenue || 0), 0);
  const commission = recipients.reduce((sum: number, r: any) => sum + (r.commission || 0), 0);

  // Stats par étape de scénario
  const j0Count = scenarios.filter((s: any) => s.j0_sent_at).length;
  const j2Count = scenarios.filter((s: any) => s.j2_sent_at).length;
  const j5Count = scenarios.filter((s: any) => s.j5_sent_at).length;

  await base44.asServiceRole.entities.ReactivationCampaign.update(campaignId, {
    sent_count: sentCount,
    failed_count: failedCount,
    control_count: controlCount,
    opened_count: openedCount,
    course_created_count: courseCreatedCount,
    course_completed_count: courseCompletedCount,
    revenue_generated: revenue,
    commission_generated: commission,
    net_result: commission,
    target_count: recipients.length,
  });
}