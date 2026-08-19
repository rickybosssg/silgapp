// PHASE 5 — VENUS Admin Intelligence Proactive (READ ONLY)
// Détections DÉTERMINISTES de tendances. Lecture seule stricte.
// Logique extraite dans venusAdminIntelligenceEngine.ts pour réutilisation par le scheduler push.
// VENUS WhatsApp inchangée. Dispatch V2 inchangé.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { computeVenusAdminInsights, SEUILS } from '../../shared/venusAdminIntelligenceEngine.ts';

export default async function handler(req) {
  const body = await req.json().catch(() => ({}));
  const countryCode = body.country_code || 'ALL';
  const base44 = createClientFromRequest(req);

  // ── Sécurité : VENUS Admin Intelligence est EXCLUSIVEMENT réservé au rôle admin ──
  const currentUser = await base44.auth.me().catch(() => null);
  if (!currentUser || currentUser.role !== 'admin') {
    return Response.json(
      { success: false, error: 'Accès refusé — VENUS Admin est réservé à l\'administrateur' },
      { status: 403 }
    );
  }

  const { insights, metrics } = await computeVenusAdminInsights(base44, countryCode);

  return Response.json({
    success: true,
    insights,
    metrics,
    seuils: SEUILS,
    generated_at: new Date().toISOString(),
    country_code: countryCode,
  });
}