import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { chargerConfigPays, normalizeCommissionPct } from '../../shared/dispatchConstants.ts';
import { comptabiliserCommissionEnterprise } from '../../shared/enterpriseFinance.ts';

// ═══════════════════════════════════════════════════════════════════════════
// CLOTURER COURSES AUTO TIMEOUT — Clôture automatique des courses après timeout
// ═══════════════════════════════════════════════════════════════════════════
//
// RÈGLE MÉTIER :
//   Une course acceptée par un livreur depuis plus de X minutes (défaut 120)
//   et toujours dans un statut actif est clôturée automatiquement comme livrée.
//
// CONDITION D'ÉLIGIBILITÉ :
//   - livreur_id assigné (non null)
//   - heure_acceptation valide (non null)
//   - maintenant >= heure_acceptation + delay_minutes
//   - statut actif (pas livree, pas annulee)
//   - pas de date_souhaitee future (course programmée)
//   - auto_completed != true (idempotence — pas déjà clôturée auto)
//
// SÉCURITÉ PRIX :
//   Une course dont le prix final ne peut pas être déterminé de manière fiable
//   n'est PAS clôturée automatiquement. Elle reste pour intervention admin et
//   une alerte AUTO_CLOSE_BLOCKED_MISSING_PRICE est créée (idempotente).
//
// FINALISATION :
//   Réutilise le mécanisme officiel de finaliserLivraisonLivreur :
//   - Courses admin : prix_propose_admin → prix_final
//   - Courses standard : délègue à calculPrixCourseExterne
//   Puis appelle verifierEncoursLivreur (CAS atomique idempotent)
//   Puis appelle comptabiliserCommissionEnterprise (si enterprise_id)
//
// TRAÇABILITÉ :
//   auto_completed = true
//   auto_completed_at = now
//   auto_completed_reason = "accepted_timeout"
//   auto_completed_delay_minutes = <délai réellement appliqué>
//   delivery_confirmed_by = "auto_timeout"
//
// IDEMPOTENCE :
//   - auto_completed true → skip (déjà clôturée)
//   - encours_comptabilise_at → skip (déjà comptabilisée)
//   - enterprise_encours_comptabilise_at → skip (déjà comptabilisée entreprise)
//   - Alerte AUTO_CLOSE_BLOCKED_MISSING_PRICE → deduplication_key (une seule fois)
//
// NE MODIFIE PAS : Dispatch V2, FCM, ORS, TarifZone, Pass, Happy Hour, PIN/QR
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG_KEY_ENABLED = 'auto_close_courses_enabled';
const CONFIG_KEY_DELAY = 'auto_close_courses_delay_minutes';

const DEFAULT_DELAY_MINUTES = 120;
const DEFAULT_ENABLED = true;

const ACTIVE_STATUTS = [
  'livreur_en_route',
  'client_contacte',
  'en_route_expediteur',
  'arrive_prise_en_charge',
  'colis_recupere',
  'passager_embarque',
  'pris_en_charge',
  'en_livraison',
  'arrivee',
];

const MAX_COURSES_PER_RUN = 25;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // ── 1. Lire la configuration depuis SystemConfig ──
    const configEntries = await base44.asServiceRole.entities.SystemConfig.filter({
      $or: [
        { cle: CONFIG_KEY_ENABLED },
        { cle: CONFIG_KEY_DELAY },
      ],
    }).catch(() => []);

    const configMap: Record<string, string> = {};
    for (const entry of configEntries || []) {
      configMap[entry.cle] = entry.valeur;
    }

    const enabled = configMap[CONFIG_KEY_ENABLED] !== undefined
      ? configMap[CONFIG_KEY_ENABLED] === 'true'
      : DEFAULT_ENABLED;

    const delayMinutes = configMap[CONFIG_KEY_DELAY]
      ? parseInt(configMap[CONFIG_KEY_DELAY], 10)
      : DEFAULT_DELAY_MINUTES;

    if (!enabled) {
      return Response.json({
        success: true,
        skipped: 'feature_disabled',
        message: 'Clôture automatique désactivée par le Super Admin',
      });
    }

    if (!Number.isFinite(delayMinutes) || delayMinutes < 30) {
      return Response.json({
        success: false,
        error: `Délai invalide: ${delayMinutes} (minimum 30 minutes)`,
      }, { status: 400 });
    }

    const delayMs = delayMinutes * 60 * 1000;
    const now = new Date();
    const nowIso = now.toISOString();

    // ── 2. Rechercher les courses éligibles ──
    const candidates: any[] = [];
    for (const statut of ACTIVE_STATUTS) {
      const courses = await base44.asServiceRole.entities.CourseExterne.filter(
        {
          statut,
          livreur_id: { $ne: null },
          auto_completed: { $ne: true },
        },
        '-heure_acceptation',
        MAX_COURSES_PER_RUN
      ).catch(() => []);

      for (const course of courses || []) {
        if (!course.heure_acceptation) continue;
        if (course.auto_completed) continue;

        const acceptTime = new Date(course.heure_acceptation).getTime();
        if (!Number.isFinite(acceptTime)) continue;

        const elapsed = now.getTime() - acceptTime;
        // >= delayMs → éligible ; < delayMs → pas encore
        if (elapsed < delayMs) continue;

        // Pas de course programmée future
        if (course.date_souhaitee) {
          const souhaitTime = new Date(course.date_souhaitee).getTime();
          if (Number.isFinite(souhaitTime) && souhaitTime > now.getTime()) {
            continue;
          }
        }

        // Double-check statut
        if (course.statut === 'livree' || course.statut === 'annulee') continue;

        candidates.push(course);
      }

      if (candidates.length >= MAX_COURSES_PER_RUN) break;
    }

    if (candidates.length === 0) {
      return Response.json({
        success: true,
        processed: 0,
        message: 'Aucune course éligible pour la clôture automatique',
      });
    }

    // ── 3. Finaliser chaque course ──
    const results: any[] = [];
    let processed = 0;
    let skipped = 0;
    let blocked = 0;
    let errors = 0;

    for (const course of candidates.slice(0, MAX_COURSES_PER_RUN)) {
      try {
        const result = await finalizeOneCourse(base44, course, nowIso, delayMinutes);
        results.push(result);
        if (result.blocked) {
          blocked++;
        } else if (result.skipped) {
          skipped++;
        } else {
          processed++;
        }
      } catch (err: any) {
        errors++;
        console.error(`[cloturerAutoTimeout] Error on course ${course.id}:`, err?.message);
        results.push({
          course_id: course.id,
          error: err?.message || String(err),
        });
      }
    }

    return Response.json({
      success: true,
      processed,
      skipped,
      blocked,
      errors,
      total_candidates: candidates.length,
      delay_minutes: delayMinutes,
      results,
    });
  } catch (error: any) {
    console.error('[cloturerAutoTimeout] Fatal error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Finaliser une seule course — réutilise le mécanisme officiel
// ═══════════════════════════════════════════════════════════════════════════

async function finalizeOneCourse(base44: any, course: any, nowIso: string, delayMinutes: number): Promise<any> {
  const courseId = course.id;

  // ── Idempotence : déjà auto-complétée ──
  if (course.auto_completed) {
    return { course_id: courseId, skipped: 'already_auto_completed' };
  }

  // ── Idempotence : déjà livrée ──
  if (course.statut === 'livree') {
    return { course_id: courseId, skipped: 'already_delivered' };
  }

  const isAdminCourse = course.pricing_mode === 'admin_manuel' || course.source === 'admin';

  // ── CAS 1: Course "prix à confirmer" — BLOCAGE (ne pas clôturer) ──
  // Le prix ne peut pas être déterminé de manière fiable. On ne clôture pas.
  // On crée une alerte admin idempotente.
  if (course.prix_a_confirmer) {
    await createBlockedAlert(base44, course, nowIso, 'prix_a_confirmer');
    return {
      course_id: courseId,
      blocked: true,
      reason: 'AUTO_CLOSE_BLOCKED_MISSING_PRICE',
      detail: 'prix_a_confirmer — prix final indéterminable sans intervention admin',
    };
  }

  // ── CAS 2: Course admin — prix_propose_admin est la source de vérité ──
  if (isAdminCourse) {
    const montant = Number(course.prix_propose_admin);
    if (!Number.isFinite(montant) || montant <= 0) {
      // Pas de prix admin valide — BLOCAGE (ne pas clôturer)
      await createBlockedAlert(base44, course, nowIso, 'admin_missing_prix_propose_admin');
      return {
        course_id: courseId,
        blocked: true,
        reason: 'AUTO_CLOSE_BLOCKED_MISSING_PRICE',
        detail: 'admin course sans prix_propose_admin valide',
      };
    }

    // Charger la commission du pays
    const countryConfig = await chargerConfigPays(base44, course.country_code || '');
    const commissionPct = normalizeCommissionPct(countryConfig?.commission_pct);

    // Utiliser le taux figé à l'acceptation si disponible (Pass/Happy Hour)
    const tauxEffectif = (course.commission_locked_at && course.commission_taux_applique != null)
      ? Number(course.commission_taux_applique)
      : commissionPct;

    if (commissionPct === null) {
      // Commission non configurée — BLOCAGE (ne pas clôturer sans commission)
      await createBlockedAlert(base44, course, nowIso, 'missing_country_commission_pct');
      return {
        course_id: courseId,
        blocked: true,
        reason: 'AUTO_CLOSE_BLOCKED_MISSING_PRICE',
        detail: `commission_pct non configuré pour le pays ${course.country_code}`,
      };
    }

    const commissionSilga = Math.round(montant * (tauxEffectif / 100));
    const montantLivreur = montant - commissionSilga;

    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      statut: 'livree',
      heure_livraison: nowIso,
      colis_livre_at: nowIso,
      prix_final: montant,
      commission_silga: commissionSilga,
      montant_livreur: montantLivreur,
      auto_completed: true,
      auto_completed_at: nowIso,
      auto_completed_reason: 'accepted_timeout',
      auto_completed_delay_minutes: delayMinutes,
      delivery_confirmed_at: nowIso,
      delivery_confirmed_by: 'auto_timeout',
      ...(course.livreur_financier_id ? {} : { livreur_financier_id: course.livreur_id }),
    });

    // Comptabiliser l'encours (idempotent via CAS)
    try {
      await base44.asServiceRole.functions.invoke('verifierEncoursLivreur', { course_id: courseId });
    } catch (e: any) {
      console.error(`[cloturerAutoTimeout] verifierEncoursLivreur error for ${courseId}:`, e?.message);
    }

    // Comptabiliser la commission entreprise (idempotent)
    try {
      const entCourse = await base44.asServiceRole.entities.CourseExterne.get(courseId);
      if (entCourse?.enterprise_id) {
        await comptabiliserCommissionEnterprise(base44.asServiceRole, entCourse);
      }
    } catch (e: any) {
      console.error(`[cloturerAutoTimeout] enterprise accounting error for ${courseId}:`, e?.message);
    }

    await libererLivreur(base44, course.livreur_id);

    return {
      course_id: courseId,
      auto_completed: true,
      prix_final: montant,
      commission_silga: commissionSilga,
      montant_livreur: montantLivreur,
      prix_source: 'admin_propose',
    };
  }

  // ── CAS 3: Course standard — déléguer à calculPrixCourseExterne ──
  try {
    const res = await base44.asServiceRole.functions.invoke('calculPrixCourseExterne', { course_id: courseId });

    // Si le calcul a réussi avec un prix déterminable
    if (res?.success && res?.prix_final != null && Number(res.prix_final) > 0) {
      await base44.asServiceRole.entities.CourseExterne.update(courseId, {
        auto_completed: true,
        auto_completed_at: nowIso,
        auto_completed_reason: 'accepted_timeout',
        auto_completed_delay_minutes: delayMinutes,
        delivery_confirmed_at: nowIso,
        delivery_confirmed_by: 'auto_timeout',
        ...(course.livreur_financier_id ? {} : { livreur_financier_id: course.livreur_id }),
      });

      // Comptabiliser l'encours (idempotent via CAS)
      try {
        await base44.asServiceRole.functions.invoke('verifierEncoursLivreur', { course_id: courseId });
      } catch (e: any) {
        console.error(`[cloturerAutoTimeout] verifierEncoursLivreur error for ${courseId}:`, e?.message);
      }

      // Comptabiliser la commission entreprise (idempotent)
      try {
        const entCourse = await base44.asServiceRole.entities.CourseExterne.get(courseId);
        if (entCourse?.enterprise_id) {
          await comptabiliserCommissionEnterprise(base44.asServiceRole, entCourse);
        }
      } catch (e: any) {
        console.error(`[cloturerAutoTimeout] enterprise accounting error for ${courseId}:`, e?.message);
      }

      await libererLivreur(base44, course.livreur_id);

      return {
        course_id: courseId,
        auto_completed: true,
        prix_final: res.prix_final,
        commission_silga: res.commission_silga,
        montant_livreur: res.montant_livreur,
        prix_source: res.prix_source || 'calcul_delegated',
      };
    }

    // ── Le prix n'a pas pu être déterminé (prix_a_confirmer ou échec calcul) ──
    // BLOCAGE : ne pas clôturer, créer une alerte admin
    const detail = res?.prix_a_confirmer
      ? 'calculPrixCourseExterne a retourné prix_a_confirmer'
      : (res?.error || 'calculPrixCourseExterne n\'a pas retourné de prix_final valide');

    await createBlockedAlert(base44, course, nowIso, 'calc_undeterminable', detail);
    return {
      course_id: courseId,
      blocked: true,
      reason: 'AUTO_CLOSE_BLOCKED_MISSING_PRICE',
      detail,
    };
  } catch (calcErr: any) {
    // Erreur de calcul — BLOCAGE (ne pas clôturer sans prix)
    const detail = `calculPrixCourseExterne error: ${calcErr?.message || String(calcErr)}`;
    await createBlockedAlert(base44, course, nowIso, 'calc_error', detail);
    return {
      course_id: courseId,
      blocked: true,
      reason: 'AUTO_CLOSE_BLOCKED_MISSING_PRICE',
      detail,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Créer une alerte admin idempotente pour course bloquée
// ═══════════════════════════════════════════════════════════════════════════

async function createBlockedAlert(base44: any, course: any, nowIso: string, subReason: string, extraDetail?: string): Promise<void> {
  const courseId = course.id;
  const deduplicationKey = `AUTO_CLOSE_BLOCKED_${courseId}`;

  // Idempotence : vérifier si une alerte existe déjà pour cette course
  try {
    const existing = await base44.asServiceRole.entities.Notification.filter({
      deduplication_key: deduplicationKey,
    }).catch(() => []);

    if (existing && existing.length > 0) {
      // Alerte déjà créée — ne pas recréer
      return;
    }
  } catch (e: any) {
    // Non bloquant — on tente quand même la création
  }

  const livreurNom = course.livreur_nom || 'N/A';
  const livreurTel = course.livreur_telephone || 'N/A';
  const acceptTime = course.heure_acceptation
    ? new Date(course.heure_acceptation).toLocaleString('fr-FR')
    : 'N/A';

  const detail = extraDetail || subReason;

  const titre = 'AUTO_CLOSE_BLOCKED_MISSING_PRICE';
  const message = `Course ${courseId} bloquée en clôture auto (prix indéterminable).
Raison: ${detail}
Livreur: ${livreurNom} (${livreurTel})
Statut: ${course.statut}
Heure d'acceptation: ${acceptTime}
Course conservée pour intervention admin.`;

  try {
    await base44.asServiceRole.entities.Notification.create({
      titre,
      message,
      type: 'alerte_critique_dispatch',
      course_id: courseId,
      deduplication_key: deduplicationKey,
    });
  } catch (e: any) {
    console.error(`[cloturerAutoTimeout] Failed to create blocked alert for ${courseId}:`, e?.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Libérer le livreur — remettre en disponible si en_course
// ═══════════════════════════════════════════════════════════════════════════

async function libererLivreur(base44: any, livreurId: string): Promise<void> {
  if (!livreurId) return;
  try {
    const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId);
    if (!livreur) return;
    // Ne libérer que si le livreur est en_course (pas s'il est déjà hors_ligne ou disponible)
    if (livreur.statut === 'en_course') {
      await base44.asServiceRole.entities.Livreur.update(livreurId, {
        statut: 'disponible',
      });
    }
  } catch (e: any) {
    console.error(`[cloturerAutoTimeout] libererLivreur error for ${livreurId}:`, e?.message);
  }
}