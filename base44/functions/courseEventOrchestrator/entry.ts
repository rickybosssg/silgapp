import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { isV2Enabled, DISPATCH_V2_BUNDLE_VERSION } from '../../shared/dispatchV2.ts';

// 🔖 Redéploiement forcé — 2026-08-14-simplified — 1 push batch à T=0, plus de T+20s ni secours
console.log(`[COURSE_ORCHESTRATOR] 🔖 dispatchV2 bundle version: ${DISPATCH_V2_BUNDLE_VERSION}`);

/**
 * ════════════════════════════════════════════════════════════════════════
 * SILGAPP COURSE ORCHESTRATOR — L'AUTOMATION ULTIME
 * ════════════════════════════════════════════════════════════════════════
 *
 * Routeur unique pour TOUS les événements CourseExterne (create + update).
 * Remplace 4 automations entity par 1 seule → -43% de crédits.
 *
 * RÈGLES IMPÉRATIVES :
 * 1. NE JAMAIS modifier CourseExterne directement (anti-boucle)
 * 2. Chaque module dans son propre try/catch (isolation totale)
 * 3. Idempotent : compare old_data vs data, sort si pas de changement pertinent
 * 4. Ne router QUE les modules concernés par le changement réel
 *
 * Modules appelés :
 * - CREATE  : dispatchExterneAuto (lancer_recherche_auto) + notifyClientSync
 * - UPDATE  : syncStatutLivreurOnCourse, verifierEncoursLivreur,
 *             syncCommandeFromCourse, validerPrimePromo, dispatchExterneAuto (retry)
 */

const STATUS_MAP_PARTNER = ['livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'en_livraison', 'livree', 'annulee'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event, data, old_data, changed_fields } = body;

    if (!data) return Response.json({ success: true, skip: true, reason: 'no_data' });

    const eventType = event?.type;
    const courseId = data.id || event?.entity_id;

    if (!courseId) return Response.json({ success: true, skip: true, reason: 'no_course_id' });

    const course = data;
    const oldCourse = old_data || {};
    const called = [];
    const errors = [];

    // Helper : invoke + isolation totale par module
    async function fireInvoke(fnName, payload) {
      try {
        await base44.asServiceRole.functions.invoke(fnName, payload);
        called.push(fnName);
      } catch (e) {
        const msg = e?.message || String(e);
        console.error(`[COURSE_ORCHESTRATOR] ❌ ${fnName}:`, msg);
        errors.push({ module: fnName, error: msg });
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // ÉVÉNEMENT CREATE
    // ════════════════════════════════════════════════════════════════════
    if (eventType === 'create') {
      // 1. Dispatch : V2 (fil) ou V1 (vagues) selon feature flag
      const v2Enabled = await isV2Enabled(base44);
      if (v2Enabled) {
        // V2 : dispatchExterneAuto publie et notifie de façon idempotente.
        await fireInvoke('dispatchExterneAuto', {
          action: 'lancer_recherche_auto',
          course_id: courseId,
          event,
          data,
        });
        called.push('dispatchV2');
      } else {
        await fireInvoke('dispatchExterneAuto', {
          action: 'lancer_recherche_auto',
          course_id: courseId,
          event,
          data,
        });
      }

      // 2. Notifier les clients (expéditeur/destinataire)
      await fireInvoke('notifyClientSync', {
        event,
        data,
      });

      return Response.json({
        success: true,
        event: 'create',
        course_id: courseId,
        called,
        errors,
      });
    }

    // ════════════════════════════════════════════════════════════════════
    // ÉVÉNEMENT UPDATE
    // ════════════════════════════════════════════════════════════════════
    if (eventType !== 'update') {
      return Response.json({ success: true, skip: true, reason: 'not_create_or_update' });
    }

    const statutChanged = course.statut !== oldCourse.statut;
    const livreurIdChanged = course.livreur_id !== oldCourse.livreur_id;

    // Anti-boucle : si ni statut ni livreur_id n'a changé, sortir immédiatement
    if (!statutChanged && !livreurIdChanged) {
      return Response.json({ success: true, skip: true, reason: 'no_relevant_change' });
    }

    const newStatut = course.statut;
    const oldStatut = oldCourse.statut;

    // ── 1. Sync statut livreur (si statut OU livreur_id change) ──
    await fireInvoke('syncStatutLivreurOnCourse', { event, data, old_data });

    // ── 2. Dispatch retry (uniquement si statut → recherche_livreur) ──
    // On ne relance le dispatch QUE si la course revient en recherche_livreur
    // (redispatch après refus, annulation, ou prix manuel refusé)
    if (statutChanged && newStatut === 'recherche_livreur') {
      const v2Enabled = await isV2Enabled(base44);
      if (v2Enabled) {
        await fireInvoke('dispatchExterneAuto', {
          action: 'lancer_recherche_auto',
          course_id: courseId,
          event,
          data,
        });
        called.push('dispatchV2');
      } else {
        await fireInvoke('dispatchExterneAuto', {
          action: 'lancer_recherche_auto',
          course_id: courseId,
          event,
          data,
        });
      }
    }

    // ── 3. Sync commande partenaire (si statut mappé ET commande liée) ──
    if (statutChanged && STATUS_MAP_PARTNER.includes(newStatut) &&
        (course.commande_boutique_id || course.commande_restaurant_id || course.pharmacie_id)) {
      await fireInvoke('syncCommandeFromCourse', { event, data, old_data });
    }

    // ── 4. Vérification encours (si statut → livrée) ──
    if (statutChanged && newStatut === 'livree') {
      await fireInvoke('verifierEncoursLivreur', { event, data, old_data });
    }

    // ── 5. Valider prime code promo (si statut → livrée) ──
    if (statutChanged && newStatut === 'livree') {
      await fireInvoke('validerPrimePromo', { event, data, old_data });
    }

    return Response.json({
      success: true,
      event: 'update',
      course_id: courseId,
      statut_changed: statutChanged,
      livreur_id_changed: livreurIdChanged,
      old_statut: oldStatut,
      new_statut: newStatut,
      called,
      errors,
    });

  } catch (error) {
    console.error('[COURSE_ORCHESTRATOR] Fatal:', error?.message || String(error));
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});