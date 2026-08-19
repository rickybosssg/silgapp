// ═══════════════════════════════════════════════════════════════════════
// VENUS Admin Push Scheduler — Tourne en arrière-plan (automation)
// Détection → validation → priorité → déduplication → push
// Non-bloquant : un échec n'impacte jamais SILGAPP
// ═══════════════════════════════════════════════════════════════════════

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { computeVenusAdminInsights } from '../../shared/venusAdminIntelligenceEngine.ts';
import { sendVenusAdminPush, shouldPush } from '../../shared/venusAdminPushEngine.ts';

export default async function handler(req) {
  const base44 = createClientFromRequest(req);
  const entities = base44.asServiceRole.entities;

  const results = {
    admins_checked: 0,
    insights_detected: 0,
    pushes_sent: 0,
    pushes_skipped: 0,
    pushes_failed: 0,
    errors: [],
  };

  try {
    // ── 1. Récupérer tous les utilisateurs admin ──
    const adminUsers = await entities.User.filter({ role: 'admin' }).catch(() => []);

    if (!adminUsers || adminUsers.length === 0) {
      console.warn('[venusAdminPushScheduler] Aucun utilisateur admin trouvé');
      return Response.json({ success: true, ...results, reason: 'no_admins' });
    }

    results.admins_checked = adminUsers.length;

    // ── 2. Calculer les insights (tous pays confondus) ──
    const { insights } = await computeVenusAdminInsights(base44, 'ALL');
    results.insights_detected = insights.length;

    // ── 3. Filtrer : seuls P0/P1 méritent un push ──
    const pushableInsights = insights.filter(shouldPush);

    if (pushableInsights.length === 0) {
      return Response.json({ success: true, ...results, reason: 'no_pushable_insights' });
    }

    // ── 4. Envoyer un push à chaque admin pour chaque insight P0/P1 ──
    for (const admin of adminUsers) {
      const adminEmail = admin.email;
      if (!adminEmail) continue;

      for (const insight of pushableInsights) {
        try {
          const pushResult = await sendVenusAdminPush(base44, {
            adminEmail,
            insight,
          });

          if (pushResult.sent) {
            results.pushes_sent += 1;
          } else if (pushResult.skipped) {
            results.pushes_skipped += 1;
          } else {
            results.pushes_failed += 1;
          }
        } catch (error) {
          results.pushes_failed += 1;
          results.errors.push({
            admin: adminEmail,
            insight_id: insight.id,
            error: error?.message || String(error),
          });
        }
      }
    }

    console.log('[venusAdminPushScheduler] Terminé', results);
    return Response.json({ success: true, ...results });
  } catch (error) {
    console.error('[venusAdminPushScheduler] Erreur non-bloquante:', error?.message || String(error));
    return Response.json({
      success: false,
      ...results,
      error: error?.message || String(error),
    });
  }
}