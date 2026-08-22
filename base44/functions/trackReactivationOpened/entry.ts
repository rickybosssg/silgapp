import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ─────────────────────────────────────────────────────────────────────────────
// trackReactivationOpened
//
// Appelée par l'app client quand un utilisateur clique sur une notification
// de réactivation (type=reactivation_campaign, destination=create_course).
//
// Met à jour le statut du recipient de "sent" → "opened" et enregistre la
// date d'ouverture. Les stats agrégées de la campagne sont recalculées.
//
// IMPORTANT : FCM Android ne fournit pas d'accusé de livraison fiable.
// "opened" est le SEUL signal de réception confirmée (action utilisateur).
// "delivered" n'est jamais défini côté serveur — seul "opened" est fiable.
// ─────────────────────────────────────────────────────────────────────────────

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentification requise' }, { status: 401 });

    // Accepter POST et GET
    let body: any = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { body = {}; }
    } else if (req.method === 'GET') {
      const url = new URL(req.url);
      body = {
        campaign_id: url.searchParams.get('campaign_id'),
        recipient_id: url.searchParams.get('recipient_id'),
      };
    } else {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const { campaign_id, recipient_id } = body;

    if (!campaign_id || !recipient_id) {
      return Response.json({ error: 'campaign_id et recipient_id sont obligatoires' }, { status: 400 });
    }

    // ── Récupérer le recipient ──
    const recipient = await base44.asServiceRole.entities.ReactivationCampaignRecipient.get(recipient_id);

    if (!recipient) {
      return Response.json({ error: 'Recipient introuvable' }, { status: 404 });
    }

    if (recipient.campaign_id !== campaign_id) {
      return Response.json({ error: 'Campaign mismatch' }, { status: 400 });
    }

    // ── Ne pas écraser un statut "converted" ──
    if (recipient.status === 'converted') {
      return Response.json({ success: true, already: 'converted' });
    }

    // ── Groupe contrôle : ne pas marquer comme opened ──
    if (recipient.is_control_group) {
      return Response.json({ success: true, ignored: 'control_group' });
    }

    // ── Déjà ouvert : pas d'écrasement ──
    if (recipient.status === 'opened') {
      return Response.json({ success: true, already: 'opened' });
    }

    // ── Mettre à jour le recipient : sent → opened ──
    const now = new Date().toISOString();
    await base44.asServiceRole.entities.ReactivationCampaignRecipient.update(recipient_id, {
      status: 'opened',
      opened_at: now,
    });

    // ── Recalculer les stats agrégées de la campagne ──
    const allRecipients = await base44.asServiceRole.entities.ReactivationCampaignRecipient.filter({
      campaign_id,
    });

    const openedCount = allRecipients.filter(
      (r: any) => r.status === 'opened' || r.status === 'converted'
    ).length;

    const courseCreatedCount = allRecipients.filter((r: any) => r.course_created_at).length;
    const courseCompletedCount = allRecipients.filter((r: any) => r.course_completed_at).length;
    const revenue = allRecipients.reduce((sum: number, r: any) => sum + (r.revenue || 0), 0);
    const commission = allRecipients.reduce((sum: number, r: any) => sum + (r.commission || 0), 0);

    await base44.asServiceRole.entities.ReactivationCampaign.update(campaign_id, {
      opened_count: openedCount,
      course_created_count: courseCreatedCount,
      course_completed_count: courseCompletedCount,
      revenue_generated: revenue,
      commission_generated: commission,
      net_result: commission,
    });

    return Response.json({
      success: true,
      recipient_id,
      status: 'opened',
      opened_at: now,
    });
  } catch (error) {
    console.error('[trackReactivationOpened] Erreur:', error);
    return Response.json({ error: error?.message || 'Erreur serveur' }, { status: 500 });
  }
}