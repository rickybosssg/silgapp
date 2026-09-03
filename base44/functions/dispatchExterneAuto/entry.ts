import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { notifierRedispatchClient } from '../../shared/venusRedispatchNotifier.ts';
import { STATUTS_ACTIFS_COURSE, STATUTS_ACTIFS_VERIF, normalizeCommissionPct, chargerConfigPays } from '../../shared/dispatchConstants.ts';
import { verifierPaysCourseLivreur, reponseDejaPrise, generateToken, generatePIN, supprimerNotificationsCourse, journaliserDispatch } from '../../shared/dispatchUtils.ts';
import { chargerConfigDispatch, chargerConfigVaguesGPS, CYCLE_EPUISE_TIMEOUT_MS } from '../../shared/dispatchConfig.ts';
import { lancerDispatchMulti } from '../../shared/dispatchEngine.ts';
import { runWatchdog } from '../../shared/dispatchWatchdog.ts';
import { marquerRefuse, marquerAccepte, getLivreursNotifies, getLivreursRefuses, resetNotifications as resetNotifsEntity } from '../../shared/dispatchNotifications.ts';
import { accepterCourseV2, publierCourseDansFil, isV2Enabled, secoursDispatchV2, isPilotLivreur, DISPATCH_V2_BUNDLE_VERSION } from '../../shared/dispatchV2.ts';
import { resolveCourseParticipantUserIds } from '../../shared/conversationSecurity.ts';

// 🔖 Redéploiement forcé — 2026-08-14-simplified-3 — rappel T+5min re-notifie les mêmes livreurs libres
console.log(`[DISPATCH_EXTERNE_AUTO] 🔖 dispatchV2 bundle version: ${DISPATCH_V2_BUNDLE_VERSION}`);

// ═══════════════════════════════════════════════════════════════════════════
// 🛡️ RETRY AUTH — Protection contre les erreurs d'authentification transitoires
// ═══════════════════════════════════════════════════════════════════════════
// Le SDK Base44 peut occasionnellement perdre le contexte service role lors
// d'invocations chainées (entity automation → functions.invoke). L'erreur
// "You must be logged in to access this app" est transitoire : un retry avec
// un client fraîchement recréé résout le problème dans la majorité des cas.
//
// LOGIQUE :
//   1. Exécute l'opération avec le client courant.
//   2. Si "You must be logged in to access this app" → recrée le client, retry.
//   3. Maximum 2 retries (3 tentatives au total).
//   4. Si les retries échouent → l'erreur remonte normalement (alerte conservée).
//   5. LOG: STEP_FAILED=<stepName> pour identifier l'étape qui échoue.
// ═══════════════════════════════════════════════════════════════════════════

const AUTH_ERROR_SIGNATURE = 'You must be logged in to access this app';
const MAX_AUTH_RETRIES = 2;
const AUTH_RETRY_DELAY_MS = 500;
const INFRA_RETRY_DELAY_MS = 1000; // Backoff pour erreurs infrastructure transitoires (rate limit, timeout, réseau)

/**
 * Classification des erreurs infrastructure transitoires.
 *
 * Ces erreurs sont SÛRES à retryer car elles sont par nature temporaires :
 * - Rate limit (HTTP 429, "rate limit", "traffic volume") — quota API temporaire
 * - Timeout réseau (ETIMEDOUT, ECONNRESET, ECONNREFUSED, "fetch failed")
 * - Erreurs MongoDB transitoires ("mongodb.net", connectTimeoutMS)
 *
 * NE PAS inclure les HTTP 500 génériques — ils peuvent indiquer une erreur
 * persistante (bug, configuration) qui ne se résoudra pas avec un retry.
 *
 * @returns {boolean} true si l'erreur est transitoire et sûre à retryer
 */
function isTransientInfrastructureError(error: any): boolean {
  const msg = (error?.message || String(error)).toLowerCase();
  return msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('rate limit exceeded') ||
    msg.includes('traffic volume') ||
    msg.includes('429') ||
    msg.includes('timeout') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('mongodb.net') ||
    msg.includes('connecttimeout') ||
    msg.includes('network error') ||
    msg.includes('fetch failed');
}

/**
 * Wrapper pour les opérations de dispatch critiques.
 *
 * Logique de retry à deux niveaux :
 *
 * 1. ERREURS AUTH (transitoires Base44) :
 *    - Recrée le client et retry (jusqu'à MAX_AUTH_RETRIES = 2 retries).
 *    - Log: STEP_FAILED=<stepName> à chaque échec.
 *
 * 2. ERREURS INFRASTRUCTURE TRANSITOIRES (rate limit, timeout, réseau) :
 *    - Backoff 1000ms puis UNE seule nouvelle tentative.
 *    - Log: STEP_FAILED=<stepName> à la première erreur.
 *    - Log: STEP_RECOVERED=<stepName> si la 2e tentative réussit.
 *    - Si la 2e tentative échoue → l'erreur remonte vers le catch final.
 *
 * 3. AUTRES ERREURS (métier, bugs, config) :
 *    - Aucun retry — remontent immédiatement.
 *
 * Maximum total = 2 tentatives pour les erreurs infrastructure.
 * Les logs ne font JAMAIS échouer le dispatch (best-effort).
 */
async function withAuthRetry(req: Request, stepName: string, fn: (base44: any) => Promise<any>) {
  let lastError: any = null;
  let infraRetried = false;

  for (let attempt = 0; attempt <= MAX_AUTH_RETRIES; attempt++) {
    try {
      const base44 = createClientFromRequest(req);
      return await fn(base44);
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || String(error);
      const isAuthError = msg.includes(AUTH_ERROR_SIGNATURE);
      const isInfra = isTransientInfrastructureError(error);

      console.error(`[DISPATCH] STEP_FAILED=${stepName} attempt=${attempt + 1}/${MAX_AUTH_RETRIES + 1} auth_error=${isAuthError} infra_error=${isInfra} msg="${msg}"`);

      // ── Erreur infrastructure transitoire (rate limit, timeout, réseau) ──
      // UNE seule retry avec backoff 1000ms
      if (isInfra && !infraRetried && attempt < MAX_AUTH_RETRIES) {
        infraRetried = true;
        await new Promise(r => setTimeout(r, INFRA_RETRY_DELAY_MS));
        console.log(`[DISPATCH] 🔄 Retrying ${stepName} after infra error (rate limit/timeout) — attempt ${attempt + 2}/${MAX_AUTH_RETRIES + 1}`);
        continue;
      }

      // ── Erreur auth transitoire — retry avec client frais ──
      if (isAuthError && !isInfra && attempt < MAX_AUTH_RETRIES) {
        await new Promise(r => setTimeout(r, AUTH_RETRY_DELAY_MS));
        console.log(`[DISPATCH] 🔄 Retrying ${stepName} with fresh client (attempt ${attempt + 2}/${MAX_AUTH_RETRIES + 1})`);
        continue;
      }

      // ── Autre erreur ou retries épuisés — remonter ──
      throw error;
    }
  }

  // Si on arrive ici avec une erreur infra qui a été retryée, c'est que la 2e tentative a échoué
  if (infraRetried && lastError) {
    console.error(`[DISPATCH] STEP_FAILED=${stepName} infra_retry_exhausted — erreur persistante après retry`);
  }
  throw lastError;
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    let { action, course_id, livreur_id, raison } = body;

    // Déclenchement depuis automation entity
    if (!action && body.event?.entity_id) {
      action = 'lancer_recherche_auto';
      course_id = body.event.entity_id;
    }

    // Déclenchement depuis automation scheduled (tick de secours) — sans action = watchdog
    if (!action) {
      action = 'watchdog';
    }

    // ─── 0. V2 : Publier une course dans le fil ──────────────────────────
    if (action === 'publier_fil_v2') {
      if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });
      let course;
      try { course = await base44.asServiceRole.entities.CourseExterne.get(course_id); } catch (e) {
        return Response.json({ error: 'Course introuvable' }, { status: 404 });
      }
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });
      const result = await withAuthRetry(req, 'publierCourseDansFil', (b44: any) => publierCourseDansFil(b44, course));
      return Response.json(result);
    }

    // ─── 0b. V2 : Accepter une course (updateMany + update single) ──────
    if (action === 'accepter_course_v2') {
      const { pricing_mode, manual_price, override_pricing_mode } = body;
      const result = await accepterCourseV2(base44, course_id, livreur_id, { pricing_mode, manual_price, override_pricing_mode });
      return Response.json(result);
    }

    // ─── 0c. V2 : Secours dispatch (top N) ──────────────────────────────
    if (action === 'secours_v2') {
      const { nb_livreurs } = body;
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });
      const result = await secoursDispatchV2(base44, course, nb_livreurs || 3);
      return Response.json(result);
    }

    // ─── 1. Lancer la recherche automatique (multi-livreurs) ──────────────
    if (action === 'lancer_recherche_auto') {
      if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });

      // 🔄 RETRY — l'automation entity peut se déclencher avant que la course soit
      // totalement disponible en base (cohérence à terme). On retente 3 fois avec 2s de délai.
      // Si le GET échoue, on utilise body.data (les données de l'événement entity) comme fallback.
      let course;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
          if (course) break;
        } catch (e) {
          console.warn(`[DISPATCH] ⚠️ Course ${course_id} tentative ${attempt}/3 échouée: ${e.message}`);
        }
        if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
      }
      // 🛡️ FALLBACK body.data — l'automatisation entity envoie les données de la course
      // dans le payload. Si le GET échoue (cohérence à terme), on utilise ces données
      // pour démarrer le dispatch immédiatement sans attendre le tick programmé.
      if (!course && body.data) {
        console.log(`[DISPATCH] 🛡️ Course ${course_id} introuvable via GET — utilisation de body.data (entity event)`);
        course = body.data;
        course.id = course_id;
      }
      if (!course) {
        console.warn(`[DISPATCH] ⚠️ Course ${course_id} introuvable après 3 tentatives et pas de body.data — ignorée`);
        return Response.json({ success: true, ignore: true, message: 'Course supprimée — ignorée' });
      }

      if (!course.country_code) {
        console.error(`[DISPATCH] ❌ Course ${course_id} sans country_code — alerte admin`);
        base44.asServiceRole.entities.Notification.create({
          titre: '🚨 Course sans pays',
          message: `Course ${course_id} (${course.adresse_depart || '?'}) n'a pas de country_code. Dispatch impossible.`,
          type: 'alerte_critique_dispatch', course_id, lue: false,
        }).catch(() => {});
        return Response.json({ success: false, error: 'Course sans country_code — dispatch impossible' }, { status: 400 });
      }

      if (!course.gps_depart_lat || !course.gps_depart_lng) {
        console.warn(`[DISPATCH] ⚠️ Course ${course_id} sans GPS`);
      }

      // ── V2 : publier dans le fil de courses disponibles ──
      // RÈGLE MÉTIER (2026-08-14) :
      //   T=0  : course visible dans le fil par tous les livreurs éligibles
      //          + push UNIQUEMENT aux livreurs prioritaires (priorite_dispatch > 0)
      //   T+20s: si la course est toujours libre, push aux non-prioritaires
      //   Si acceptée avant 20s → aucun push non-prioritaire
      // Le premier qui accepte gagne (prioritaire ou non), verrou atomique.
      const v2Enabled = await isV2Enabled(base44);
      if (v2Enabled) {
        const result = await withAuthRetry(req, 'publierCourseDansFil_lancerRecherche', (b44: any) => publierCourseDansFil(b44, course));
        return Response.json({ success: true, v2: true, published: true, ...result });
      }

      // ── V1 : dispatch par vagues (notifications ciblées) ──
      const result = await lancerDispatchMulti(base44, course_id, []);
      if (result.erreur) return Response.json({ error: result.erreur }, { status: 404 });
      if (result.ignore) return Response.json({ success: true, message: `Dispatch ignoré: ${result.statut}` });
      if (result.locked) return Response.json({ success: true, locked: true, message: 'Course verrouillée par un autre tick' });
      if (result.noLivreur) return Response.json({ success: false, noLivreur: true });
      if (result.en_attente) return Response.json({ success: true, en_attente: true });
      if (result.cycleEpuise) return Response.json({ success: true, cycle_epuise: true });

      return Response.json({
        success: true,
        nb_notifies: result.nb_notifies,
        total_notifies: result.total_notifies,
        livreurs: result.livreurs,
        timeout_sec: result.timeout_sec,
      });
    }

    // ─── 2. Vérifier si un livreur est dans la liste notifiée ─────────────
    if (action === 'check_course_pour_livreur') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ found: false });

      const countryGuard = await verifierPaysCourseLivreur(base44, course, livreur_id, 'check_course_pour_livreur');
      if (!countryGuard.ok) return Response.json(countryGuard.response, { status: countryGuard.status });

      // 🚫 Vérifier blocage encours du livreur
    if (countryGuard.ok && countryGuard.livreur?.bloque_encours) {
      return Response.json({ 
        found: false, bloque_encours: true,
        error: 'Votre plafond d\'encours SILGAPP a été atteint.',
      });
    }

    // 🛡️ NIVEAU 0 — VÉRIFICATION DE COURSE ACTIVE : un livreur ayant déjà une
    // course active ne doit JAMAIS voir ou accepter une nouvelle proposition.
    // Cette vérification est la première barrière du cas "Amidou Ouédraogo".
    if (countryGuard.ok) {
      const coursesActivesLivreur = await base44.asServiceRole.entities.CourseExterne.filter({
        livreur_id: livreur_id,
      }, '-created_date', 10);
      const coursesAccepteesLivreur = await base44.asServiceRole.entities.CourseExterne.filter({
        accepted_by_livreur_id: livreur_id,
      }, '-created_date', 10);
      const toutesCoursesLivreur = [...coursesActivesLivreur, ...coursesAccepteesLivreur];
      const courseActiveExistante = toutesCoursesLivreur.find(c =>
        STATUTS_ACTIFS_COURSE.includes(c.statut) && c.id !== course_id
      );
      const coursePrixManuelEnAttente = toutesCoursesLivreur.find(c =>
        c.id !== course_id && c.dispatch_status === 'propose' &&
        (c.livreur_id === livreur_id || c.accepted_by_livreur_id === livreur_id)
      );
      if (courseActiveExistante) {
        console.warn(`[DISPATCH] 🚫 check_course_pour_livreur — Livreur ${livreur_id} a déjà la course ${courseActiveExistante.id} active (${courseActiveExistante.statut}) — proposition masquée`);
        return Response.json({
          found: false, deja_en_course: true,
          error: 'Vous avez déjà une course en cours. Terminez-la avant d\'en voir une nouvelle.',
        });
      }
      if (coursePrixManuelEnAttente) {
        return Response.json({
          found: false, prix_manuel_en_attente: true,
          error: 'Vous avez déjà proposé un prix sur une course en attente de validation.',
        });
      }
    }

    if (course.statut === 'annulee' || course.statut === 'livree') {
        try {
          const livreurData = countryGuard.livreur;
          if (livreurData?.user_email) {
            const notifs = await base44.asServiceRole.entities.Notification.filter({
              course_id: course_id, destinataire_email: livreurData.user_email, type: 'nouvelle_course', lue: false,
            });
            for (const n of notifs) { await base44.asServiceRole.entities.Notification.update(n.id, { lue: true }); }
          }
        } catch (_) {}
        return Response.json({ found: false, cancelled: true });
      }

      if (course.dispatch_status === 'accepte') {
        // 🔧 CORRECTION : distinguer "j'ai accepté" vs "un autre a accepté"
        if (String(course.livreur_id) === String(livreur_id) || String(course.accepted_by_livreur_id) === String(livreur_id)) {
          return Response.json({ found: false, you_accepted: true, taken_by: course.livreur_id });
        }
        return Response.json({ found: false, already_taken: true, taken_by: course.livreur_id });
      }

      // 🔥 Course en disponible_push → visible par tous les livreurs éligibles (Push-to-Bid)
      if (course.dispatch_status === 'disponible_push') {
        const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date());
        return Response.json({ found: true, course, expired, disponible_push: true, timeout_expires_at: course.timeout_expires_at });
      }

      const notifiedIds = await getLivreursNotifies(base44, course_id);
      const isNotified = notifiedIds.includes(livreur_id);
      if (!isNotified) return Response.json({ found: false });

      const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date());
      return Response.json({ found: true, course, expired, timeout_expires_at: course.timeout_expires_at });
    }

    // ─── 3. Accepter une course — VERROU ATOMIQUE ─────────────────────────
    if (action === 'accepter_course') {
      const { pricing_mode, manual_price, override_pricing_mode } = body;

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const countryGuard = await verifierPaysCourseLivreur(base44, course, livreur_id, 'accepter_course');
      if (!countryGuard.ok) return Response.json(countryGuard.response, { status: countryGuard.status });
      const livreur = countryGuard.livreur;

      // 🚫 Vérifier blocage encours
      if (livreur.bloque_encours) {
        return Response.json({ 
          success: false, accepted: false, reason: 'bloque_encours',
          error: 'Votre plafond d\'encours SILGAPP a été atteint. Veuillez effectuer votre dépôt auprès de SILGAPP afin de réactiver votre compte.',
        });
      }

      // 🛡️ PROTECTION B — Vérification anti-courses multiples au moment de l'acceptation.
      // Le livreur ne peut pas accepter une nouvelle course s'il en a déjà une active.
      // On vérifie par livreur_id ET accepted_by_livreur_id (couvre les prix manuels
      // en attente de validation client où livreur_id est peut-être vide mais
      // accepted_by_livreur_id est posé).
      const coursesActivesLivreur = await base44.asServiceRole.entities.CourseExterne.filter({
        livreur_id: livreur_id,
      }, '-created_date', 20);
      const coursesAccepteesLivreur = await base44.asServiceRole.entities.CourseExterne.filter({
        accepted_by_livreur_id: livreur_id,
      }, '-created_date', 20);
      const toutesCoursesLivreur = [...coursesActivesLivreur, ...coursesAccepteesLivreur];
      const courseActiveExistante = toutesCoursesLivreur.find(c =>
        STATUTS_ACTIFS_COURSE.includes(c.statut) && c.id !== course_id
      );
      // Vérification prix manuel en attente (dispatch_status='propose' + livreur_id posé)
      const coursePrixManuelEnAttente = toutesCoursesLivreur.find(c =>
        c.id !== course_id && c.dispatch_status === 'propose' &&
        (c.livreur_id === livreur_id || c.accepted_by_livreur_id === livreur_id)
      );
      if (courseActiveExistante) {
        console.warn(`[DISPATCH] 🚫 Livreur ${livreur_id} a déjà la course ${courseActiveExistante.id} active (${courseActiveExistante.statut}) — acceptation refusée`);
        return Response.json({
          success: false, accepted: false, reason: 'deja_en_course',
          error: 'Vous avez déjà une course en cours. Terminez-la avant d\'en accepter une nouvelle.',
          course_active_id: courseActiveExistante.id,
          course_active_statut: courseActiveExistante.statut,
        });
      }
      if (coursePrixManuelEnAttente) {
        console.warn(`[DISPATCH] 🚫 Livreur ${livreur_id} a une course ${coursePrixManuelEnAttente.id} avec prix manuel en attente — acceptation refusée`);
        return Response.json({
          success: false, accepted: false, reason: 'prix_manuel_en_attente',
          error: 'Vous avez déjà proposé un prix sur une course en attente de validation. Attendez la réponse du client.',
          course_active_id: coursePrixManuelEnAttente.id,
        });
      }

      console.log('[DISPATCH][ACCEPT_ATTEMPT]', {
        course_id, livreur_id, course_status: course.statut || '',
        dispatch_status: course.dispatch_status || '',
        existing_livreur_id: course.livreur_id || '',
        accepted_by_livreur_id: course.accepted_by_livreur_id || '',
      });

      if (course.dispatch_status === 'accepte' || course.dispatch_status === 'accepted') {
        return Response.json(reponseDejaPrise('dispatch_already_accepted', course));
      }

      if (course.livreur_id || course.accepted_by_livreur_id) {
        return Response.json(reponseDejaPrise('livreur_lock_already_set', course));
      }

      if (course.dispatch_status !== 'propose' && course.dispatch_status !== 'disponible_push') {
        return Response.json({
          success: false, accepted: false, reason: 'not_available',
          error: "Cette course n'est plus disponible", dispatch_status: course.dispatch_status || '',
        });
      }

      const notifiedIds = await getLivreursNotifies(base44, course_id);
      const isDisponiblePush = course.dispatch_status === 'disponible_push';
      const refusedIds = isDisponiblePush ? await getLivreursRefuses(base44, course_id) : [];
      const isLivreurDisponible =
        livreur.type_livreur === 'externe' &&
        livreur.validation === 'valide' &&
        livreur.actif === true &&
        livreur.statut === 'disponible' &&
        livreur.manual_hors_ligne !== true &&
        livreur.admin_hors_ligne !== true;
      const isEligible = isDisponiblePush
        ? isLivreurDisponible && !refusedIds.includes(livreur_id)
        : notifiedIds.includes(livreur_id) || course.livreur_id === livreur_id;
      if (!isEligible) {
        return Response.json({ success: false, error: 'Vous n\'êtes pas éligible pour cette course', not_eligible: true });
      }

      if (course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date()) {
        return Response.json({ success: false, error: 'Course expirée', expired: true });
      }

      // Prix minimum dynamique selon le pays — BLOQUANT si non configuré (sécurité)
      let PRIX_MIN: number | null = null;
      try {
        const countryConfig = await chargerConfigPays(base44, course.country_code);
        if (countryConfig?.prix_minimum && countryConfig.prix_minimum > 0) {
          PRIX_MIN = countryConfig.prix_minimum;
        }
      } catch (_) {}
      if (PRIX_MIN === null) {
        return Response.json({
          success: false,
          error: `Prix minimum non configuré pour le pays ${course.country_code}`,
          blocked_reason: 'missing_country_prix_minimum',
        }, { status: 400 });
      }
      const deviseMin = course.devise || 'FCFA';

      if (pricing_mode === 'manual') {
        const montant = Number(manual_price);
        if (!montant || montant < PRIX_MIN) {
          return Response.json({ success: false, error: `Prix minimum : ${PRIX_MIN} ${deviseMin}` }, { status: 400 });
        }
      }

      const isManual = pricing_mode === 'manual' && manual_price >= PRIX_MIN;

      // Délai de grâce anti-race
      await new Promise(resolve => setTimeout(resolve, 200));

      // Double-check locking
      const courseFinal = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      console.log('[DISPATCH][ACCEPT_FINAL_CHECK]', {
        course_id, livreur_id,
        course_status: courseFinal.statut || '',
        dispatch_status: courseFinal.dispatch_status || '',
        existing_livreur_id: courseFinal.livreur_id || '',
        accepted_by_livreur_id: courseFinal.accepted_by_livreur_id || '',
      });
      
      // 🔧 CORRECTION : si le verrou est déjà posé mais par CE MÊME livreur → succès (requête concurrente du même client)
      const dejaVerrouilleParMoi = 
        (courseFinal.livreur_id && String(courseFinal.livreur_id) === String(livreur_id)) ||
        (courseFinal.accepted_by_livreur_id && String(courseFinal.accepted_by_livreur_id) === String(livreur_id));
      
      if (dejaVerrouilleParMoi) {
        console.log(`[DISPATCH] 🔒 Course ${course_id} déjà verrouillée par le même livreur ${livreur_id} — succès confirmé`);
        return Response.json({ 
          success: true, accepted: true, course_id, livreur_id,
          already_accepted: true,
        });
      }
      
      if ((courseFinal.dispatch_status !== 'propose' && courseFinal.dispatch_status !== 'disponible_push') || courseFinal.livreur_id || courseFinal.accepted_by_livreur_id) {
        return Response.json(reponseDejaPrise('final_check_already_taken', courseFinal));
      }

      // 🔐 Préserver les tokens/PINs existants — ne JAMAIS les regénérer
      // (générés une fois à la création de la course pour garantir l'unicité partout)
      const pickupToken = course.pickup_qr_token || generateToken();
      const deliveryToken = course.delivery_qr_token || generateToken();
      const pickupPIN = course.pickup_code_4_digits || generatePIN();
      const deliveryPIN = course.delivery_code_4_digits || generatePIN();
      const tokensOntEteGeneres = !!(course.pickup_qr_token && course.pickup_code_4_digits);
      if (!tokensOntEteGeneres) {
        console.log(`[DISPATCH] 🔐 Génération nouveaux tokens/PINs pour course ${course_id} (absents à la création)`);
      } else {
        console.log(`[DISPATCH] 🔒 Conservation tokens/PINs existants pour course ${course_id}`);
      }

      const updateData = {
        dispatch_status: isManual ? 'propose' : 'accepte',
        statut: isManual ? 'recherche_livreur' : 'livreur_en_route',
        heure_acceptation: isManual ? null : new Date().toISOString(),
        ...(override_pricing_mode === 'automatic' ? { pricing_mode: 'automatic' } : {}),
        livreur_id: livreur_id,
        livreur_nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(),
        livreur_photo_url: livreur.photo_url || '',
        livreur_telephone: livreur.telephone,
        livreur_vehicule: livreur.vehicule || livreur.type_vehicule || 'moto',
        livreur_note_moyenne: livreur.note_moyenne || 0,
        livreur_nombre_avis: livreur.nombre_avis || 0,
        accepted_by_livreur_id: livreur_id,
        accepted_at: isManual ? null : new Date().toISOString(),
        pickup_qr_token: pickupToken,
        pickup_code_4_digits: pickupPIN,
        delivery_qr_token: deliveryToken,
        delivery_code_4_digits: deliveryPIN,
      };

      if (isManual) {
        updateData.pricing_mode = 'manual';
        updateData.manual_price = Number(manual_price);
        updateData.manual_price_status = 'pending_client_validation';
        updateData.proposed_by_livreur_id = livreur_id;
        const dispatchConfig = await chargerConfigDispatch(base44);
        updateData.timeout_expires_at = new Date(Date.now() + dispatchConfig.manualPriceTimeoutSec * 1000).toISOString();
      }

      // 🛡️ CHECK FINAL ATOMIQUE ANTI-DOUBLON — juste avant l'updateMany, on refait
      // une vérification fraiche pour s'assurer que le livreur n'a pas accepté une
      // autre course dans les millisecondes écoulées. Cette vérification élimine
      // définitivement la race condition entre deux acceptations simultanées.
      const coursesActivesFinal = await base44.asServiceRole.entities.CourseExterne.filter({
        livreur_id: livreur_id,
      }, '-created_date', 20);
      const courseActiveFinal = coursesActivesFinal.find(c =>
        STATUTS_ACTIFS_COURSE.includes(c.statut) && c.id !== course_id
      );
      if (courseActiveFinal) {
        console.warn(`[DISPATCH] 🚫 RACE CONDITION BLOQUÉE — Livreur ${livreur_id} a accepté la course ${courseActiveFinal.id} (${courseActiveFinal.statut}) entre les checks — acceptation refusée`);
        return Response.json({
          success: false, accepted: false, reason: 'deja_en_course',
          error: 'Vous avez déjà une course en cours. Terminez-la avant d\'en accepter une nouvelle.',
          course_active_id: courseActiveFinal.id,
          course_active_statut: courseActiveFinal.statut,
        });
      }

      // 🔐 MISE À JOUR ATOMIQUE CONDITIONNELLE — empêche la course condition (race condition)
      // où deux livreurs passent le double-check simultanément. Le updateMany ne modifie
      // la course QUE si dispatch_status est toujours 'propose' ou 'disponible_push'.
      // ⚠️ Ne pas filtrer livreur_id avec une chaîne vide : Base44 stocke aussi l'absence
      // de livreur avec null, ce qui empêchait toute acceptation de ces courses.
      await base44.asServiceRole.entities.CourseExterne.updateMany(
        { id: course_id, dispatch_status: { $in: ['propose', 'disponible_push'] } },
        { $set: updateData }
      );

      // ✅ Vérification post-update : confirmer que CE livreur détient bien le verrou
      const courseVerifie = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      const isMyCourse = String(courseVerifie.livreur_id) === String(livreur_id) ||
                         String(courseVerifie.accepted_by_livreur_id) === String(livreur_id);
      if (!isMyCourse) {
        console.warn(`[DISPATCH] 🏁 Race condition perdue — livreur ${livreur_id} n'a pas obtenu la course ${course_id} (attribuée à ${courseVerifie.livreur_id || courseVerifie.accepted_by_livreur_id || '?'})`);
        return Response.json(reponseDejaPrise('race_condition_lost', courseVerifie));
      }

      if (!isManual) {
        await base44.asServiceRole.entities.Livreur.update(livreur_id, { statut: 'en_course' });
        await supprimerNotificationsCourse(base44, course_id);
        console.log(`[DISPATCH] 🎉 Course ${course_id} verrouillée (auto) par ${livreur_id}`);

        // ── Message automatique : Code de récupération pour courses admin ET VENUS ──
        // Envoie le code de récupération (pickup_code_4_digits) dans la messagerie
        // interne de la course, visible par le livreur assigné et l'admin.
        // Concerné : courses admin (source='admin') et courses créées par VENUS
        // (created_by_venus=true). Clé idempotente par (course_id, livreur_id) pour
        // éviter les doublons et permettre un nouveau message si réassignation.
        if ((course.source === 'admin' || course.created_by_venus === true) && pickupPIN) {
          const idempotencyKey = `pickup-code-${course_id}-${livreur_id}`;
          try {
            const existing = await base44.asServiceRole.entities.Message.filter({
              client_message_id: idempotencyKey,
            });
            if (!existing || existing.length === 0) {
              const courseMsgUserIds = await resolveCourseParticipantUserIds(base44, course.livreur_id, course.expediteur_client_id || course.destinataire_client_id);
              await base44.asServiceRole.entities.Message.create({
                course_id: course_id,
                participant_user_ids: courseMsgUserIds,
                security_status: courseMsgUserIds.length > 0 ? 'secured' : 'pending',
                sender_type: 'admin',
                sender_id: 'silgapp_system',
                sender_name: 'SILGAPP',
                message_type: 'text',
                content: `🔑 Code de récupération : ${pickupPIN}\n\nUtiliser ce code pour récupérer le Colis${course.prix_propose_admin ? `\n💰 Prix de la course : ${Number(course.prix_propose_admin).toLocaleString()} ${course.devise || 'FCFA'}` : (course.prix_estimate ? `\n💰 Prix estimé : ${Number(course.prix_estimate).toLocaleString()} ${course.devise || 'FCFA'}` : '')}`,
                source: 'app',
                client_message_id: idempotencyKey,
              });
              console.log(`[DISPATCH] 🔑 Message code de récupération créé pour course admin ${course_id} (livreur ${livreur_id})`);
            }
          } catch (err) {
            console.error(`[DISPATCH] ⚠️ Erreur création message code récupération:`, err?.message || String(err));
          }
        }

        // ── Phase 9 + QR/PIN : Suivi WhatsApp automatique avec QR Code et Code PIN ──
        // Détecter si c'est une réaffectation (livreur précédent a annulé)
        const isRedispatch = !!(course.dispatch_refused_ids && course.dispatch_refused_ids !== '[]')
          || (course.notes || '').includes('ANNULÉ');
        base44.asServiceRole.functions.invoke('envoyerSuiviWhatsApp', {
          course_id: course_id,
          evenement: 'livreur_assigne',
          is_redispatch: isRedispatch,
        }).catch(err => console.error('[DISPATCH] ❌ Suivi WhatsApp:', err.message));

        // 📝 Journaliser l'acceptation avec le temps de réponse
        let tempsAcceptationSec = null;
        if (course.heure_sollicitation) {
          tempsAcceptationSec = Math.round((Date.now() - new Date(course.heure_sollicitation).getTime()) / 1000);
        }
        journaliserDispatch(base44, {
          course_id, country_code: course.country_code,
          vague: course.dispatch_wave || 1,
          evenement: 'acceptation',
          livreur_acceptant_id: livreur_id,
          livreur_acceptant_nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(),
          temps_avant_acceptation_sec: tempsAcceptationSec,
        });

        marquerAccepte(base44, course_id, livreur_id, tempsAcceptationSec).catch(() => {});

        return Response.json({ success: true, accepted: true, course_id, livreur_id });
      }

      // Mode manuel : notifier le client
      try {
        let clientEmail = null;
        let clientIdForPush = course.expediteur_client_id || null;
        if (course.created_by_id) {
          try { const creator = await base44.asServiceRole.entities.User.get(course.created_by_id); clientEmail = creator?.email || null; } catch (_) {}
        }
        if (!clientEmail && course.expediteur_client_id) {
          const dest = await base44.asServiceRole.entities.ClientExterne.filter({ id: course.expediteur_client_id });
          clientEmail = dest?.[0]?.user_email || null;
        }
        if (clientEmail) {
          const prixMessage = `${livreur.prenom || ''} ${livreur.nom} propose cette course à ${Number(manual_price).toLocaleString()} ${course.devise || 'FCFA'}. Acceptez-vous ?`;
          // 📤 Push notification — le client n'est pas forcément dans l'app
          // On n'appelle QUE envoiNotificationPush (qui crée déjà la notif en BDD + envoie le push FCM)
          try {
            await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
              destinataire_email: clientEmail,
              client_id: clientIdForPush,
              titre: '💰 Prix proposé par le livreur',
              message: prixMessage,
              type: 'prix_manuel_propose',
              course_id: course_id,
              user_type: 'client',
            });
          } catch (e) { console.error('[DISPATCH] ❌ Push client prix manuel:', e.message); }
        }
      } catch (e) { console.warn('[DISPATCH] Erreur notif client prix manuel:', e.message); }

      // 📤 Envoyer le prix proposé au client via WhatsApp
      base44.asServiceRole.functions.invoke('envoyerSuiviWhatsApp', {
       course_id: course_id,
       evenement: 'prix_manuel_propose',
       manual_price: Number(manual_price),
      }).catch(err => console.error('[DISPATCH] ❌ Suivi WhatsApp prix manuel:', err.message));

      return Response.json({ success: true, accepted: true, pending_client_validation: true, course_id, livreur_id });
    }

    // ─── 4. Refuser une course ─────────────────────────────────────────────
    if (action === 'refuser_course') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const countryGuard = await verifierPaysCourseLivreur(base44, course, livreur_id, 'refuser_course');
      if (!countryGuard.ok) return Response.json(countryGuard.response, { status: countryGuard.status });

      if (course.dispatch_status === 'accepte' && course.livreur_id !== livreur_id) {
        return Response.json({ success: true, message: 'Course déjà prise par un autre' });
      }

      // 🚫 Marquer le livreur comme refusé définitif (exclusion permanente, survit au reset de cycle)
      await marquerRefuse(base44, course_id, livreur_id, raison || 'Refusé');
      console.log(`[DISPATCH] 🚫 Livreur ${livreur_id} marqué comme refusé — course ${course_id}`);

      // 🧹 Marquer les notifications "nouvelle_course" comme lues pour ce livreur (bulk)
      try {
        const livreurData = await base44.asServiceRole.entities.Livreur.get(livreur_id);
        if (livreurData?.user_email) {
          await base44.asServiceRole.entities.Notification.updateMany(
            { course_id: course_id, destinataire_email: livreurData.user_email, type: 'nouvelle_course', lue: false },
            { $set: { lue: true } }
          );
        }
      } catch (e) { console.warn('[DISPATCH] Erreur archivage notifs refus:', e.message); }

      const etaitVerrouillee = course.livreur_id === livreur_id;
      if (etaitVerrouillee) {
        // Libérer le verrou + remettre le statut en recherche (sinon reste bloqué à livreur_en_route)
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          statut: 'recherche_livreur',
          dispatch_status: 'redispatch',
          remarque_livreur: raison || 'Refusé',
          livreur_id: '',
          livreur_nom: '',
          livreur_telephone: '',
          heure_acceptation: null,
          accepted_by_livreur_id: '',
          accepted_at: null,
        });
        const result = await lancerDispatchMulti(base44, course_id, []);
        if (result.noLivreur) return Response.json({ success: true, noLivreur: true });
        if (result.cycleEpuise) return Response.json({ success: true, cycle_epuise: true });
        return Response.json({ success: true, nb_notifies: result.nb_notifies });
      }

      return Response.json({ success: true, exclu_definitif: true });
    }

    // ─── 5. Vérifier expiration & redispatch (avec exclusions cumulées) ──
    if (action === 'verifier_expiration') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date());

      // Expiration du verrou actif
      if (expired && course.dispatch_status === 'propose' && course.livreur_id) {
        console.log(`[DISPATCH] ⏰ Verrou expiré course ${course_id} — redispatch`);

        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          statut: 'recherche_livreur',
          dispatch_status: 'redispatch',
          livreur_id: '',
          livreur_nom: '',
          livreur_telephone: '',
          heure_acceptation: null,
          accepted_by_livreur_id: '',
          accepted_at: null,
        });

        const result = await lancerDispatchMulti(base44, course_id, []);
        return Response.json({ expired: true, redispatched: !result.noLivreur, nb_restants: result.total_notifies });
      }

      // Expiration vague multi (sans verrou)
      if (expired && course.dispatch_status === 'propose' && !course.livreur_id) {
        const currentWave = course.dispatch_wave || 0;
        if (currentWave > 0) {
          const gpsCfg = await chargerConfigVaguesGPS(base44);
          const maxWave = gpsCfg.waves.length;

          const nextWave = currentWave + 1;

          if (nextWave > maxWave) {
            console.log(`[DISPATCH] 📍 GPS vague ${currentWave} expirée (max: ${maxWave}) — cycle_epuise pour course ${course_id}`);
            const cycleEpuiseDeadline = new Date(Date.now() + CYCLE_EPUISE_TIMEOUT_MS).toISOString();
            await base44.asServiceRole.entities.CourseExterne.update(course_id, {
              dispatch_status: 'cycle_epuise',
              dispatch_wave: maxWave,
              timeout_expires_at: cycleEpuiseDeadline,
            });
            // Notification WhatsApp VENUS désactivée — le client peut relancer via l'app
            return Response.json({ expired: true, wave_epuise: true, venus_notifie: false });
          }
          console.log(`[DISPATCH] 📍 GPS avancement vague ${currentWave} → ${nextWave} pour course ${course_id}`);
          await base44.asServiceRole.entities.CourseExterne.update(course_id, {
            dispatch_status: 'redispatch',
            dispatch_wave: nextWave,
          });
        } else {
          console.log(`[DISPATCH] ⏰ Vague expirée course ${course_id} — nouvelle sélection`);
          await base44.asServiceRole.entities.CourseExterne.update(course_id, { dispatch_status: 'redispatch' });
        }

        const result = await lancerDispatchMulti(base44, course_id, []);
        return Response.json({ expired: true, redispatched: !result.noLivreur });
      }

      return Response.json({ expired, dispatch_status: course.dispatch_status, livreur_id: course.livreur_id });
    }

    // ─── 6. Watchdog — détection et correction d'anomalies (tick de secours 10 min) ──
    if (action === 'watchdog' || action === 'avancer_vagues_expirees') {
      const result = await withAuthRetry(req, 'runWatchdog', (b44: any) => runWatchdog(b44, body));
      return Response.json(result);
    }

    // ─── 7. Retry courses en attente / redispatch (hors vagues) ────────────
    if (action === 'retry_courses_en_attente') {
      const { country_code: filterCountry } = body;
      const filter = { statut: 'recherche_livreur' };
      if (filterCountry) filter.country_code = filterCountry;

      const courses = await base44.asServiceRole.entities.CourseExterne.filter(filter, '-created_date', 10);
      const aRetenter = courses.filter(c =>
        ['en_attente', 'redispatch', 'cycle_epuise'].includes(c.dispatch_status)
      );

      const MAX_COURSES_PER_TICK = 10;
      const coursesToProcess = aRetenter.slice(0, MAX_COURSES_PER_TICK);
      if (aRetenter.length > MAX_COURSES_PER_TICK) {
        console.log(`[DISPATCH] ⚡ ${aRetenter.length} courses à retenter — limitation à ${MAX_COURSES_PER_TICK}/tick`);
      }

      // 📦 Cache config — déjà mis en cache au niveau module (TTL 5 min)
      const cachedConfig = {
        dispatch: await chargerConfigDispatch(base44),
        gps: await chargerConfigVaguesGPS(base44),
      };

      const resultats = [];
      for (const course of coursesToProcess) {
        try {
          const result = await withAuthRetry(req, 'lancerDispatchMulti_retry', (b44: any) => lancerDispatchMulti(b44, course.id, [], cachedConfig));
          resultats.push({ course_id: course.id, ...result });
        } catch (err) {
          console.error(`[DISPATCH] ❌ Erreur retry course ${course.id}:`, err.message);
          resultats.push({ course_id: course.id, error: err.message });
        }
        // Délai minimal entre courses (les notifications sont fire-and-forget)
        await new Promise(r => setTimeout(r, 100));
      }
      return Response.json({ success: true, retried: coursesToProcess.length, total: aRetenter.length, resultats });
    }

    // ─── 7. Valider le prix manuel côté client ────────────────────────────
    if (action === 'valider_prix_manuel') {
      const { accepted } = body;
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const now = new Date().toISOString();

      if (accepted) {
        const prixManuel = Number(course.manual_price);
        // 🎯 Commission dynamique du pays de la course
        let commissionPct: number | null = null;
        try {
          if (course.country_code) {
            const countryConfig = await chargerConfigPays(base44, course.country_code);
            commissionPct = normalizeCommissionPct(countryConfig?.commission_pct);
          }
        } catch (error) {
          console.error('[dispatchExterneAuto] Lecture commission pays impossible', error);
        }
        if (commissionPct === null) {
          return Response.json({
            error: 'Commission du pays non configurée',
            reason: 'missing_country_commission_pct',
          }, { status: 409 });
        }
        const commission = Math.round(prixManuel * (commissionPct / 100));
        const montantLivreur = prixManuel - commission;

        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          manual_price_status: 'accepted', client_price_validated_at: now,
          statut: 'livreur_en_route', dispatch_status: 'accepte', heure_acceptation: now,
          prix_final: prixManuel, commission_silga: commission, montant_livreur: montantLivreur,
        });

        if (course.proposed_by_livreur_id) {
          const livreurId = course.proposed_by_livreur_id;
          await base44.asServiceRole.entities.Livreur.update(livreurId, { statut: 'en_course' });
          try {
            const livreurData = await base44.asServiceRole.entities.Livreur.get(livreurId);
            if (livreurData?.user_email) {
              await base44.asServiceRole.entities.Notification.create({
                titre: '✅ Prix accepté — La course peut commencer !',
                message: `Le client a accepté votre prix de ${prixManuel.toLocaleString()} ${course.devise || 'FCFA'}.`,
                type: 'course_acceptee', course_id: course_id, destinataire_email: livreurData.user_email, lue: false,
              });
              try {
                await base44.functions.invoke('envoiNotificationPush', {
                  destinataire_email: livreurData.user_email, livreur_id: livreurId,
                  titre: '✅ Prix accepté !', message: `Le client a validé ${prixManuel.toLocaleString()} ${course.devise || 'FCFA'}.`,
                  type: 'course_acceptee', course_id: course_id,
                });
              } catch (_) {}
            }
          } catch (e) { console.error('[DISPATCH] ❌ Notif livreur prix accepté:', e.message); }
        }

        await supprimerNotificationsCourse(base44, course_id);
        return Response.json({ success: true, accepted: true });
      } else {
        const livreurRefuseId = course.proposed_by_livreur_id;

        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          manual_price_status: 'refused', client_price_refused_at: now,
          statut: 'recherche_livreur', dispatch_status: 'redispatch',
          livreur_id: '', livreur_nom: '', livreur_telephone: '',
          pricing_mode: 'automatic', manual_price: null, proposed_by_livreur_id: '',
        });

        if (livreurRefuseId) {
          await base44.asServiceRole.entities.Livreur.update(livreurRefuseId, { statut: 'disponible' });
        }

        // Redispatch sans exclure (le refus était côté client, pas livreur)
        const result = await lancerDispatchMulti(base44, course_id, []);
        return Response.json({ success: true, accepted: false, redispatched: !result.noLivreur });
      }
    }

    // ─── 8. Lire la config dispatch ───────────────────────────────────────
    if (action === 'get_config') {
      const config = await chargerConfigDispatch(base44);
      return Response.json({ success: true, config });
    }

    // ─── 9. Sauvegarder la config dispatch ──────────────────────────────
    if (action === 'set_config') {
      const { nb_livreurs, timeout_sec } = body;
      const configs = await base44.asServiceRole.entities.AppConfig.filter({});

      const upsert = async (cle, valeur, description) => {
        const existing = configs.find(c => c.cle === cle);
        if (existing) {
          await base44.asServiceRole.entities.AppConfig.update(existing.id, { valeur: String(valeur) });
        } else {
          await base44.asServiceRole.entities.AppConfig.create({ cle, valeur: String(valeur), description });
        }
      };

      if (nb_livreurs !== undefined) {
        await upsert('DISPATCH_NB_LIVREURS', nb_livreurs, 'Nombre de livreurs notifiés par vague de dispatch');
      }
      if (timeout_sec !== undefined) {
        await upsert('DISPATCH_TIMEOUT_SEC', timeout_sec, 'Délai de réponse par vague (secondes)');
      }

      return Response.json({ success: true, message: 'Configuration dispatch sauvegardée' });
    }

    // ─── 10. Lire la config vagues GPS ───────────────────────────────────
    if (action === 'get_wave_config') {
      const cfg = await chargerConfigVaguesGPS(base44);
      return Response.json({ success: true, config: cfg });
    }

    // ─── 11. Sauvegarder la config vagues GPS ───────────────────────────
    if (action === 'set_wave_config') {
      const { gps_waves_enabled, waves } = body;
      const configs = await base44.asServiceRole.entities.DispatchWaveConfig.filter({});
      const wavesJson = JSON.stringify(waves || []);

      if (configs[0]) {
        await base44.asServiceRole.entities.DispatchWaveConfig.update(configs[0].id, {
          gps_waves_enabled: gps_waves_enabled !== false,
          waves_json: wavesJson,
        });
      } else {
        await base44.asServiceRole.entities.DispatchWaveConfig.create({
          gps_waves_enabled: gps_waves_enabled !== false,
          waves_json: wavesJson,
        });
      }

      return Response.json({ success: true, message: 'Configuration vagues GPS sauvegardée' });
    }

    // ─── 12. Diagnostic anti-doublon notifications ────────────────────────
    if (action === 'diagnostic_notifications') {
      const toutes = await base44.asServiceRole.entities.Notification.filter({ type: 'nouvelle_course' }, '-created_date', 500);
      
      // Grouper par course_id + destinataire_email
      const grouped = {};
      for (const n of toutes) {
        const key = `${n.course_id || '?'}::${n.destinataire_email || '?'}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(n);
      }

      const doublons = Object.entries(grouped)
        .filter(([, notifs]) => notifs.length > 1)
        .map(([key, notifs]) => ({
          key,
          count: notifs.length,
          non_lues: notifs.filter(n => !n.lue).length,
          lues: notifs.filter(n => n.lue).length,
          derniere: notifs[0]?.created_date,
          premiere: notifs[notifs.length - 1]?.created_date,
        }));

      const stats = {
        total_notifications: toutes.length,
        total_combinaisons: Object.keys(grouped).length,
        combinaisons_avec_doublons: doublons.length,
        total_doublons_en_surplus: doublons.reduce((s, d) => s + d.count - 1, 0),
        doublons_non_lus: doublons.filter(d => d.non_lues > 0).length,
        doublons_detail: doublons.slice(0, 30),
      };

      console.log(`[DIAGNOSTIC NOTIFS] ${stats.total_notifications} notifs, ${stats.combinaisons_avec_doublons} combinaisons avec doublons, ${stats.total_doublons_en_surplus} notifs en surplus`);
      return Response.json({ success: true, stats });
    }

    // ─── 13. Marquer une course comme "vue" par le livreur ──────────────
    // Remplace l'ancien appel frontend direct base44.entities.DispatchNotification.create()
    // Sécurisé : résout livreur_user_email côté backend, vérifie l'identité du livreur,
    // vérifie l'éligibilité de la course, et applique une clé d'idempotence.
    if (action === 'marquer_vue_course') {
      if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });

      // 1. Récupérer l'utilisateur connecté
      const me = await base44.auth.me();
      if (!me || !me.email) {
        return Response.json({ success: false, error: 'Utilisateur non authentifié' }, { status: 401 });
      }

      // 2. Résoudre le Livreur correspondant à cet utilisateur
      const livreurs = await base44.asServiceRole.entities.Livreur.filter(
        { user_email: me.email }, '-created_date', 1
      );
      const livreur = livreurs?.[0];
      if (!livreur) {
        return Response.json({ success: false, error: 'Aucun profil livreur lié à ce compte' }, { status: 403 });
      }

      // 3. Vérifier que la course existe et est éligible pour ce livreur
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) {
        return Response.json({ success: false, error: 'Course introuvable' }, { status: 404 });
      }

      // Vérifier que le pays du livreur correspond au pays de la course
      const courseCountry = (course.country_code || '').toUpperCase();
      const livreurCountry = (livreur.country_code || '').toUpperCase();
      if (!courseCountry || !livreurCountry || courseCountry !== livreurCountry) {
        return Response.json({ success: false, error: 'country_mismatch' }, { status: 403 });
      }

      // Vérifier que la course est encore disponible (non livrée, non annulée)
      if (course.statut === 'annulee' || course.statut === 'livree') {
        return Response.json({ success: true, ignored: true, reason: 'course_terminal' });
      }

      // 4. Vérifier l'idempotence — ne pas créer de doublon
      const existing = await base44.asServiceRole.entities.DispatchNotification.filter(
        { course_id: course_id, livreur_id: livreur.id }, '-date_notification', 1
      );
      if (existing && existing.length > 0) {
        return Response.json({ success: true, already_exists: true });
      }

      // 5. Créer la DispatchNotification avec livreur_user_email résolu côté backend
      await base44.asServiceRole.entities.DispatchNotification.create({
        course_id: course_id,
        livreur_id: livreur.id,
        livreur_user_email: livreur.user_email || me.email,
        country_code: livreurCountry,
        vague: 0,
        statut: 'notifie',
        priorite_dispatch: livreur.priorite_dispatch || 0,
        date_notification: new Date().toISOString(),
      });

      return Response.json({ success: true });
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (error) {
    const isRateLimit = error.message?.toLowerCase?.().includes('rate limit') || error.message?.toLowerCase?.().includes('rate_limit') || error.message?.toLowerCase?.().includes('traffic volume');
    const isAuthError = error.message?.includes(AUTH_ERROR_SIGNATURE);
    // 🛡️ Les erreurs auth transitoires ont déjà été retentées par withAuthRetry (2 retries).
    // Si on arrive ici avec une erreur auth, cela signifie que les retries ont échoué
    // → c'est une vraie erreur persistante, l'alerte reste justifiée.
    console.error(`[DISPATCH] STEP_FAILED=dispatchExterneAuto.catch Erreur fatale${isRateLimit ? ' (RATE_LIMIT)' : ''}${isAuthError ? ' (AUTH_EXHAUSTED)' : ''}:`, error.message);
    try {
      const base44 = createClientFromRequest(req);
      // 🛡️ Anti-spam : ne créer une alerte que si aucune alerte récente (< 30 min) n'existe
      // Délai augmenté à 30 min pour les rate limits (transitoires) vs 5 min pour les autres erreurs
      const alertWindow = isRateLimit ? 60 * 60 * 1000 : 5 * 60 * 1000;
      const recentAlerts = await base44.asServiceRole.entities.Notification.filter({
        type: 'alerte_critique_dispatch', lue: false,
      }, '-created_date', 1);
      const hasRecent = recentAlerts?.[0] && (Date.now() - new Date(recentAlerts[0].created_date).getTime()) < alertWindow;
      if (!hasRecent) {
        const msg = isRateLimit
          ? `Le moteur de dispatch a atteint la limite d'appels API (rate limit). Cela est transitoire — le prochain tick reprendra automatiquement. Si le problème persiste, contactez le support.`
          : isAuthError
            ? `Le moteur de dispatch a échoué après ${MAX_AUTH_RETRIES + 1} tentatives: ${error.message}. Les courses ne sont plus relancées automatiquement. Intervention requise.`
            : `Le moteur de dispatch a crashé: ${error.message}. Les courses ne sont plus relancées automatiquement. Intervention requise.`;
        await base44.asServiceRole.entities.Notification.create({
          titre: isRateLimit ? '⚠️ Surcharge API temporaire — dispatch' : '🚨 Erreur fatale — dispatch automatique',
          message: msg,
          type: 'alerte_critique_dispatch', lue: false,
        });
      }
    } catch (_) {}
    return Response.json({ error: error.message }, { status: 500 });
  }
});