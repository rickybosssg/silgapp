import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * ORCHESTRATEUR — CourseExterne update
 *
 * Fusionne 4 automations entity en 1 seule :
 *   1. syncStatutLivreurOnCourse  — sync statut livreur + WhatsApp client
 *   2. verifierEncoursLivreur     — vérification encours (si livrée)
 *   3. syncCommandeFromCourse     — sync commande partenaire (si statut mappé)
 *   4. validerPrimePromo          — validation prime code promo (si livrée)
 *
 * Économie : 3 crédits / update (de 4 automations → 1).
 * trigger_conditions : ne se déclenche QUE si statut ou livreur_id change.
 *
 * Les fonctions existantes restent inchangées — l'orchestrateur les invoque
 * via base44.asServiceRole.functions.invoke() avec le payload d'origine.
 */

const STATUS_MAP_KEYS = ['livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'en_livraison', 'livree', 'annulee'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event, data, old_data } = body;

    if (!data) return Response.json({ success: true, skip: true, reason: 'no_data' });
    if (event?.type !== 'update') return Response.json({ success: true, skip: true, reason: 'not_update' });

    const course = data;
    const oldCourse = old_data || {};
    const statutChanged = course.statut !== oldCourse.statut;
    const livreurIdChanged = course.livreur_id !== oldCourse.livreur_id;

    if (!statutChanged && !livreurIdChanged) {
      return Response.json({ success: true, skip: true, reason: 'no_relevant_change' });
    }

    const newStatut = course.statut;
    const called = [];

    // Helper : invoke + log errors, ne pas stocker la réponse (objet Response non-sérialisable)
    async function fireInvoke(fnName, payload) {
      try {
        await base44.asServiceRole.functions.invoke(fnName, payload);
        called.push(fnName);
      } catch (e) {
        console.error(`[ORCHESTRATOR] ${fnName} error:`, e?.message || String(e));
      }
    }

    // ── 1. Sync statut livreur (toujours si statut ou livreur_id change) ──
    await fireInvoke('syncStatutLivreurOnCourse', { event, data, old_data });

    // ── 2. Vérification encours (uniquement si statut → livrée) ──
    if (statutChanged && newStatut === 'livree') {
      await fireInvoke('verifierEncoursLivreur', { event, data, old_data });
    }

    // ── 3. Sync commande partenaire (uniquement si statut mappé ET commande liée) ──
    if (statutChanged && STATUS_MAP_KEYS.includes(newStatut) &&
        (course.commande_boutique_id || course.commande_restaurant_id || course.pharmacie_id)) {
      await fireInvoke('syncCommandeFromCourse', { event, data, old_data });
    }

    // ── 4. Valider prime code promo (uniquement si statut → livrée) ──
    if (statutChanged && newStatut === 'livree') {
      await fireInvoke('validerPrimePromo', { event, data, old_data });
    }

    return Response.json({ success: true, called, statut_changed: statutChanged, livreur_id_changed: livreurIdChanged });
  } catch (error) {
    console.error('[ORCHESTRATOR] Fatal:', error?.message || String(error));
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});