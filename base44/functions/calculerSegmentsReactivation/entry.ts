import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { computeSegmentStats } from '../../shared/reactivationEngine.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentification requise' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 });

    // Accept both GET (direct) and POST (via base44.functions.invoke)

    const stats = await computeSegmentStats(base44);

    // Récupérer le nombre de campagnes
    const campaigns = await base44.asServiceRole.entities.ReactivationCampaign.list();
    const activeCampaigns = campaigns.filter((c: any) => c.status === 'sent' || c.status === 'sending');
    const totalRevenue = campaigns.reduce((sum: number, c: any) => sum + (c.revenue_generated || 0), 0);
    const totalCommission = campaigns.reduce((sum: number, c: any) => sum + (c.commission_generated || 0), 0);

    return Response.json({
      ...stats,
      totalCampaigns: campaigns.length,
      activeCampaigns: activeCampaigns.length,
      totalRevenue,
      totalCommission,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}