import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { selectTargets, sendReactivationPush } from '../../shared/reactivationEngine.ts';

// ═══════════════════════════════════════════════════════════════════════════
// lancerCampagneReactivation — Lancement d'une campagne de réactivation
//
// CORRECTIONS (25/08/2026) :
//   1. Idempotence : supprime les recipients PENDING existants avant de recréer
//      → relancer une campagne ne crée jamais de doublons
//   2. Envoi par petits batchs (5 recipients) avec tracking par-recipient
//      → chaque recipient passe pending → sent ou failed individuellement
//   3. Statut final garanti : completed (jamais bloqué en "sending")
//      → même en cas d'erreur, le statut passe à "completed" avec failed_count
//   4. Les recipients déjà envoyés (sent/opened/converted) ne sont JAMAIS
//      supprimés ni ré-envoyés
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  let campaignId: string | null = null;
  let base44: any = null;

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentification requise' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 });

    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

    const body = await req.json();
    const { campaign_id, launch_now } = body;
    campaignId = campaign_id;

    if (!campaign_id) return Response.json({ error: 'campaign_id requis' }, { status: 400 });

    const campaign = await base44.asServiceRole.entities.ReactivationCampaign.get(campaign_id);
    if (!campaign) return Response.json({ error: 'Campagne introuvable' }, { status: 404 });

    // ── STEP 1: Supprimer les recipients PENDING existants (idempotence) ──
    //    On garde les recipients déjà envoyés (sent/opened/converted) pour ne
    //    jamais ré-envoyer un push à un client déjà notifié.
    const existingRecipients = await base44.asServiceRole.entities.ReactivationCampaignRecipient.filter(
      { campaign_id },
      '-created_date',
      500
    );

    const pendingToDelete = existingRecipients.filter((r: any) => r.status === 'pending');
    const alreadyProcessed = existingRecipients.filter((r: any) =>
      r.status === 'sent' || r.status === 'opened' || r.status === 'converted'
    );

    if (pendingToDelete.length > 0) {
      // Supprimer un par un (bulkDelete n'existe pas sur l'SDK)
      await Promise.all(pendingToDelete.map((r: any) =>
        base44.asServiceRole.entities.ReactivationCampaignRecipient.delete(r.id)
      ));
    }

    // ── STEP 2: Sélectionner les cibles si aucun recipient n'existe encore ──
    let allRecipients = alreadyProcessed;

    if (alreadyProcessed.length === 0) {
      const abVariants = campaign.ab_variants ? (() => {
        try { return JSON.parse(campaign.ab_variants); } catch { return null; }
      })() : null;

      const { targets, controlCount } = await selectTargets(base44, {
        segment_type: campaign.segment_type,
        country_code: campaign.country_code || undefined,
        city: campaign.city || undefined,
        course_min: campaign.course_min,
        course_max: campaign.course_max,
        max_targets: campaign.max_targets || 0,
        inactive_days_min: campaign.inactive_days_min,
        control_group_pct: campaign.control_group_pct || 0,
        ab_variants: abVariants,
        campaign_id,
      });

      if (targets.length === 0) {
        await base44.asServiceRole.entities.ReactivationCampaign.update(campaign_id, {
          status: 'completed',
          target_count: 0,
          completed_at: new Date().toISOString(),
        });
        return Response.json({ success: false, error: 'Aucun client éligible trouvé', target_count: 0 });
      }

      const recipientRecords = targets.map((t) => ({
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

      allRecipients = await base44.asServiceRole.entities.ReactivationCampaignRecipient.bulkCreate(recipientRecords);

      await base44.asServiceRole.entities.ReactivationCampaign.update(campaign_id, {
        target_count: targets.length,
        control_count: controlCount,
      });
    }

    // ── STEP 3: Si launch_now, envoyer les pushes par petits batchs ──
    if (!launch_now) {
      return Response.json({
        success: true,
        campaign_id,
        target_count: allRecipients.length,
        control_count: allRecipients.filter((r: any) => r.is_control_group).length,
        status: campaign.status === 'scheduled' ? 'scheduled' : 'draft',
      });
    }

    await base44.asServiceRole.entities.ReactivationCampaign.update(campaign_id, {
      status: 'sending',
      started_at: new Date().toISOString(),
    });

    // Recipients à envoyer : pending, non contrôle, token natif
    const toSend = allRecipients.filter((r: any) =>
      r.status === 'pending' &&
      !r.is_control_group &&
      r.push_token &&
      !String(r.push_token).startsWith('web_')
    );

    let successCount = 0;
    let failedCount = 0;

    if (toSend.length > 0) {
      const abVariants = campaign.ab_variants ? (() => {
        try { return JSON.parse(campaign.ab_variants); } catch { return null; }
      })() : null;

      if (campaign.is_ab_test && abVariants) {
        // ── Test A/B : envoyer par variante ──
        for (const variant of abVariants) {
          const variantTargets = toSend
            .filter((r: any) => r.ab_variant === variant.variant)
            .map((r: any) => ({ token: r.push_token, recipient_id: r.id }))
            .filter((t: any) => t.token && t.recipient_id);

          if (variantTargets.length === 0) continue;

          const result = await sendReactivationPush(
            variantTargets,
            variant.title || campaign.title,
            variant.message || campaign.message,
            campaign_id
          );

          // Mettre à jour chaque recipient individuellement
          for (const pr of result.results) {
            await base44.asServiceRole.entities.ReactivationCampaignRecipient.update(pr.recipient_id, {
              status: pr.ok ? 'sent' : 'failed',
              sent_at: pr.ok ? new Date().toISOString() : null,
              fcm_error: pr.ok ? null : (pr.error || null),
            });
          }
          successCount += result.success;
          failedCount += result.failed;

          // Désactiver les tokens invalides
          for (const invalidToken of result.invalid) {
            const tokenRecords = await base44.asServiceRole.entities.NotificationToken.filter({ token: invalidToken });
            for (const tr of tokenRecords) {
              await base44.asServiceRole.entities.NotificationToken.update(tr.id, { actif: false });
            }
          }
        }
      } else {
        // ── Envoi standard ──
        const sendTargets = toSend
          .map((r: any) => ({ token: r.push_token, recipient_id: r.id }))
          .filter((t: any) => t.token && t.recipient_id);

        const result = await sendReactivationPush(
          sendTargets,
          campaign.title,
          campaign.message,
          campaign_id
        );

        // Mettre à jour chaque recipient individuellement
        for (const pr of result.results) {
          await base44.asServiceRole.entities.ReactivationCampaignRecipient.update(pr.recipient_id, {
            status: pr.ok ? 'sent' : 'failed',
            sent_at: pr.ok ? new Date().toISOString() : null,
            fcm_error: pr.ok ? null : (pr.error || null),
          });
        }
        successCount += result.success;
        failedCount += result.failed;

        // Désactiver les tokens invalides
        for (const invalidToken of result.invalid) {
          const tokenRecords = await base44.asServiceRole.entities.NotificationToken.filter({ token: invalidToken });
          for (const tr of tokenRecords) {
            await base44.asServiceRole.entities.NotificationToken.update(tr.id, { actif: false });
          }
        }
      }
    }

    // ── STEP 4: Statut final garanti ──
    //    La campagne ne reste JAMAIS bloquée en "sending".
    //    completed = tous les recipients ont été traités (sent ou failed).
    await base44.asServiceRole.entities.ReactivationCampaign.update(campaign_id, {
      status: 'completed',
      sent_count: successCount,
      failed_count: failedCount,
      // delivered_count : non mesurable avec FCM Android — ne pas afficher 0 comme un résultat réel
      completed_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      campaign_id,
      target_count: allRecipients.length,
      control_count: allRecipients.filter((r: any) => r.is_control_group).length,
      sent: successCount,
      failed: failedCount,
      status: 'completed',
    });
  } catch (error: any) {
    // ── Filet de sécurité : ne jamais laisser la campagne bloquée en "sending" ──
    if (campaignId && base44) {
      try {
        const camp = await base44.asServiceRole.entities.ReactivationCampaign.get(campaignId).catch(() => null);
        if (camp && camp.status === 'sending') {
          await base44.asServiceRole.entities.ReactivationCampaign.update(campaignId, {
            status: 'completed',
            completed_at: new Date().toISOString(),
          });
        }
      } catch {}
    }
    console.error('[lancerCampagneReactivation] Error:', error);
    return Response.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}