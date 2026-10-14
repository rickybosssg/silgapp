import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { publierCourseDansFil, isV2Enabled } from '../../shared/dispatchV2.ts';

// ═══════════════════════════════════════════════════════════════════════════
// RÉCUPÉRATION DES COURSES BLOQUÉES — Mécanisme léger de récupération
// ═══════════════════════════════════════════════════════════════════════════
//
// Détecte les courses Standard valides qui n'ont pas été publiées dans le fil
// « Disponibles » à cause d'un échec temporaire (orchestrateur timeout, erreur
// réseau, etc.) et les publie immédiatement.
//
// CAS COUVERTS :
//   1. Course en 'nouvelle' depuis > 60s sans notification
//   2. Course en 'recherche_livreur' avec dispatch_status='en_attente' depuis > 60s
//   3. Course revenue anormalement de 'recherche_livreur' vers 'nouvelle'
//
// SÉCURITÉ :
//   - Idempotent : publierCourseDansFil a un garde atomique (updateMany conditionnel)
//   - N'inclut JAMAIS les courses Éco isolées (en attente de regroupement)
//   - N'inclut JAMAIS les courses en attente de décision client
//   - N'inclut JAMAIS les courses terminées (livrée, annulée)
//   - N'inclut JAMAIS les courses déjà acceptées (accepte, propose)
//   - Limité à 20 courses par tick pour éviter les timeouts
//   - Ne crée JAMAIS de doublon de course
//
// APPELÉ PAR : workflow dédié toutes les 1 minute
// ═══════════════════════════════════════════════════════════════════════════

const STUCK_THRESHOLD_MS = 60 * 1000; // 60 secondes
const MAX_COURSES_PER_TICK = 20;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const thresholdDate = new Date(now.getTime() - STUCK_THRESHOLD_MS).toISOString();

    const v2Enabled = await isV2Enabled(base44);
    if (!v2Enabled) {
      return Response.json({ success: true, skipped: 'v2_disabled' });
    }

    // ── Cas 1 : Courses en 'nouvelle' depuis > 60s ──
    // Une course en 'nouvelle' doit être rapidement passée en 'recherche_livreur'
    // par l'orchestrateur. Si elle est toujours en 'nouvelle' après 60s, c'est
    // que l'orchestrateur a échoué (timeout, erreur réseau, etc.).
    const coursesNouvelles = await base44.asServiceRole.entities.CourseExterne.filter({
      statut: 'nouvelle',
      created_date: { $lte: thresholdDate },
    }, 'created_date', MAX_COURSES_PER_TICK).catch(() => []);

    // ── Cas 2 : Courses en 'recherche_livreur' avec dispatch_status='en_attente' ──
    // Une course en 'recherche_livreur' doit avoir dispatch_status='disponible_push'
    // (V2) ou 'propose' (V1). Si elle est en 'en_attente', c'est que la publication
    // a échoué ou que la course a été remise en attente par le watchdog.
    const coursesEnAttente = await base44.asServiceRole.entities.CourseExterne.filter({
      statut: 'recherche_livreur',
      dispatch_status: 'en_attente',
      updated_date: { $lte: thresholdDate },
    }, 'created_date', MAX_COURSES_PER_TICK).catch(() => []);

    // ── Cas 3 : Courses en 'disponible_push' depuis > 60s avec 0 DispatchNotification ──
    // CAS CRITIQUE : la course a été publiée (dispatch_status='disponible_push') mais
    // la notification a échoué silencieusement (Livreur.filter en erreur, bulkCreate en
    // erreur, etc.). Aucun push n'a été envoyé → les livreurs ne savent pas que la
    // course existe. On re-tente la notification via publierCourseDansFil qui détecte
    // ce cas et re-notifie (re-notification de secours dans dispatchV2.ts).
    const coursesSansNotif: any[] = [];
    const coursesPubliees = await base44.asServiceRole.entities.CourseExterne.filter({
      statut: 'recherche_livreur',
      dispatch_status: 'disponible_push',
      updated_date: { $lte: thresholdDate },
    }, 'created_date', MAX_COURSES_PER_TICK).catch(() => []);

    for (const c of (coursesPubliees || [])) {
      if (!c?.id) continue;
      if (c.client_decision_attendue === true) continue;
      if (c.livreur_id || c.accepted_by_livreur_id) continue;
      // Vérifier si la course a au moins 1 DispatchNotification
      const dnCheck = await base44.asServiceRole.entities.DispatchNotification.filter(
        { course_id: c.id }, undefined, 1
      ).catch(() => []);
      if (!dnCheck || dnCheck.length === 0) {
        coursesSansNotif.push(c);
      }
    }

    // ── Combiner et dédupliquer ──
    const seenIds = new Set<string>();
    const stuckCourses: any[] = [];
    for (const c of [...(coursesNouvelles || []), ...(coursesEnAttente || []), ...(coursesSansNotif || [])]) {
      if (!c?.id || seenIds.has(c.id)) continue;
      // Exclure les courses Eco isolées (en attente de regroupement)
      if (c.delivery_mode === 'eco' && c.eco_status === 'isolated') continue;
      // Exclure les courses en attente de décision client
      if (c.client_decision_attendue === true) continue;
      // Exclure les courses déjà acceptées
      if (c.livreur_id || c.accepted_by_livreur_id) continue;
      // Exclure les courses déjà publiées (sauf cas 3 — 0 notif, déjà ajoutées dans coursesSansNotif)
      if (c.dispatch_status === 'disponible_push' || c.dispatch_status === 'propose') {
        // Cas 3 : course publiée mais 0 notif → ne pas exclure, elle est dans coursesSansNotif
        if (coursesSansNotif.find(s => s.id === c.id)) {
          // OK, on la garde pour re-notification
        } else {
          continue;
        }
      }
      seenIds.add(c.id);
      stuckCourses.push(c);
    }

    if (stuckCourses.length === 0) {
      return Response.json({ success: true, recovered: 0, reason: 'no_stuck_courses' });
    }

    // ── Publier chaque course bloquée ──
    const results: any[] = [];
    let recovered = 0;
    for (const course of stuckCourses) {
      try {
        const result = await publierCourseDansFil(base44, course);
        if (result?.success) {
          recovered++;
          results.push({ course_id: course.id, action: 'recovered', result: 'published' });
        } else {
          results.push({ course_id: course.id, action: 'skipped', reason: result?.reason || 'unknown' });
        }
      } catch (err: any) {
        console.error(`[RECUP_COURSES] Course ${course.id} recovery failed:`, err?.message || String(err));
        results.push({ course_id: course.id, action: 'error', error: err?.message || String(err) });
      }
      // Petite pause pour éviter de surcharger la BDD
      await new Promise(r => setTimeout(r, 50));
    }

    console.log(`[RECUP_COURSES] ${recovered}/${stuckCourses.length} course(s) récupérée(s)`);

    return Response.json({
      success: true,
      recovered,
      checked: stuckCourses.length,
      results: results.slice(0, 10),
    });

  } catch (error) {
    console.error('[RECUP_COURSES] Erreur:', error?.message || String(error));
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}