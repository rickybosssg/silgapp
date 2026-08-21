import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { selectTargets, sendReactivationPush } from '../../shared/reactivationEngine.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentification requise' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 });

    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

    const body = await req.json();
    const { campaign_id, launch_now } = body;

    if (!campaign_id) return Response.json({ error: 'campaign_id requis' }, { status: 400 });

    const campaign = await base44.asServiceRole.entities.ReactivationCampaign.get(campaign_id);
    if (!campaign) return Response.json({ error: 'Campagne introuvable' }, { status: 404 });

    // ── Sélection des cibles ──────────────────────────────────────────────
    const abVariants = campaign.ab_variants ? (() => {
      try { return JSON.parse(campaign.ab_variants); } catch { return null; }
    })() : null;

    const { targets, controlCount } = await selectTargets(base44, {
      segment_type: campaign.segment_type,
      country_code: campaign.country_code || undefined,
      city: campaign.city || undefined,
      course_min: campaign.course_min,
      course_max: campaign.course_max,
      inactive_days_min: campaign.inactive_days_min,
      control_group_pct: campaign.control_group_pct || 0,
      ab_variants: abVariants,
    });

    if (targets.length === 0) {
      await base44.asServiceRole.entities.ReactivationCampaign.update(campaign_id, {
        status: 'completed',
        target_count: 0,
        completed_at: new Date().toISOString(),
      });
      return Response.json({ success: false, error: 'Aucun client éligible trouvé', target_count: 0 });
    }

    // ── Créer les recipient records ──────────────────────────────────────
    const recipients = targets.map((t) => ({
      campaign_id,
      client_id: t.client.id,
      client_telephone: t.client.telephone || '',
      user_email: t.client.user_email || '',
      push_token: t.token?.token || '',
      push_token_id: t.token?.id || '',
      is_control_group: t.is_control,
      ab_variant: t.ab_variant || '',
      status: t.is_control ? 'control' : 'pending',
      country_code: t.client.country_code || '',
    }));

    const created = await base44.asServiceRole.entities.ReactivationCampaignRecipient.bulkCreate(recipients);

    await base44.asServiceRole.entities.ReactivationCampaign.update(campaign_id, {
      target_count: targets.length,
      control_count: controlCount,
    });

    // ── Si lancement immédiat : envoyer les push ──────────────────────────
    if (launch_now) {
      await base44.asServiceRole.entities.ReactivationCampaign.update(campaign_id, {
        status: 'sending',
        started_at: new Date().toISOString(),
      });

      // Récupérer les tokens à envoyer (hors contrôle)
      const toSend = targets.filter((t) => !t.is_control && t.token?.token && !String(t.token.token).startsWith('web_'));
      const tokenList = toSend.map((t) => t.token.token);

      let successCount = 0;
      let failedCount = 0;

      if (tokenList.length > 0) {
        // Pour les tests A/B, envoyer le message de la variante
        if (campaign.is_ab_test && abVariants) {
          for (const variant of abVariants) {
            const variantTargets = toSend.filter((t) => t.ab_variant === variant.variant);
            const variantTokens = variantTargets.map((t) => t.token.token);
            if (variantTokens.length === 0) continue;
            const result = await sendReactivationPush(variantTokens, variant.title || campaign.title, variant.message || campaign.message, campaign_id);
            successCount += result.success;
            failedCount += result.failed;
          }
        } else {
          const result = await sendReactivationPush(tokenList, campaign.title, campaign.message, campaign_id);
          successCount = result.success;
          failedCount = result.failed;

          // Désactiver les tokens invalides
          if (result.invalid.length > 0) {
            for (const invalidToken of result.invalid) {
              const tokenRecords = await base44.asServiceRole.entities.NotificationToken.filter({ token: invalidToken });
              for (const tr of tokenRecords) {
                await base44.asServiceRole.entities.NotificationToken.update(tr.id, { actif: false });
              }
            }
          }
        }
      }

      // Mettre à jour les recipients comme envoyés
      const sentRecipients = created.filter((r: any) => r.status === 'pending');
      for (const r of sentRecipients) {
        await base44.asServiceRole.entities.ReactivationCampaignRecipient.update(r.id, {
          status: 'sent',
          sent_at: new Date().toISOString(),
        });
      }

      await base44.asServiceRole.entities.ReactivationCampaign.update(campaign_id, {
        status: 'sent',
        sent_count: successCount,
        failed_count: failedCount,
        delivered_count: successCount,
      });

      return Response.json({
        success: true,
        campaign_id,
        target_count: targets.length,
        control_count: controlCount,
        sent: successCount,
        failed: failedCount,
      });
    }

    return Response.json({
      success: true,
      campaign_id,
      target_count: targets.length,
      control_count: controlCount,
      status: campaign.status === 'scheduled' ? 'scheduled' : 'draft',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}