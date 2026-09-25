import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { chargerConfigPays, normalizeCommissionPct } from '../../shared/dispatchConstants.ts';
import { comptabiliserCommissionEnterprise } from '../../shared/enterpriseFinance.ts';

// ═══════════════════════════════════════════════════════════════════════════
// CLOTURER COURSES AUTO TIMEOUT — Clôture automatique des courses après 2h
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
// FINALISATION :
//   Réutilise le mécanisme officiel de finaliserLivraisonLivreur :
//   - Courses admin : prix_propose_admin → prix_final
//   - Courses standard : délègue à calculPrixCourseExterne
//   - Courses prix à confirmer : pas de commission
//   Puis appelle verifierEncoursLivreur (CAS atomique idempotent)
//   Puis appelle comptabiliserCommissionEnterprise (si enterprise_id)
//
// TRAÇABILITÉ :
//   auto_completed = true
//   auto_completed_at = now
//   auto_completed_reason = "accepted_timeout_2h"
//   delivery_confirmed_by = "auto_timeout"
//
// IDEMPOTENCE :
//   - auto_completed true → skip (déjà clôturée)
//   - encours_comptabilise_at → skip (déjà comptabilisée)
//   - enterprise_encours_comptabilise_at → skip (déjà comptabilisée entreprise)
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

    // ── 2. Calculer le seuil temporel ──
    const now = new Date();
    const nowIso = now.toISOString();
    const thresholdMs = now.getTime() - (delayMinutes * 60 * 1000);

    // ── 3. Rechercher les courses éligibles ──
    // On filtre par statuts actifs + livreur assigné + pas déjà auto-complétée
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
        // ── Conditions d'éligibilité ──
        if (!course.heure_acceptation) continue;
        if (course.auto_completed) continue;

        const acceptTime = new Date(course.heure_acceptation).getTime();
        if (!Number.isFinite(acceptTime)) continue;

        const elapsed = now.getTime() - acceptTime;
        if (elapsed < delayMinutes * 60 * 1000) continue;

        // Pas de course programmée future
        if (course.date_souhaitee) {
          const souhaitTime = new Date(course.date_souhaitee).getTime();
          if (Number.isFinite(souhaitTime) && souhaitTime > now.getTime()) {
            continue;
          }
        }

        // Pas déjà livrée ou annulée (double-check)
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

    // ── 4. Finaliser chaque course ──
    const results: any[] = [];
    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const course of candidates.slice(0, MAX_COURSES_PER_RUN)) {
      try {
        const result = await finalizeOneCourse(base44, course, nowIso);
        results.push(result);
        if (result.skipped) {
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

async function finalizeOneCourse(base44: any, course: any, nowIso: string): Promise<any> {
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

  // ── CAS 1: Course admin — prix_propose_admin est la source de vérité ──
  if (isAdminCourse) {
    const montant = Number(course.prix_propose_admin);
    if (!Number.isFinite(montant) || montant <= 0) {
      // Pas de prix admin valide — clôturer sans commission (sera à confirmer)
      await base44.asServiceRole.entities.CourseExterne.update(courseId, {
        statut: 'livree',
        heure_livraison: nowIso,
        colis_livre_at: nowIso,
        auto_completed: true,
        auto_completed_at: nowIso,
        auto_completed_reason: 'accepted_timeout_2h',
        delivery_confirmed_at: nowIso,
        delivery_confirmed_by: 'auto_timeout',
        ...(course.livreur_financier_id ? {} : { livreur_financier_id: course.livreur_id }),
      });

      await libererLivreur(base44, course.livreur_id);
      return { course_id: courseId, auto_completed: true, prix_source: 'admin_no_price' };
    }

    // Charger la commission du pays
    const countryConfig = await chargerConfigPays(base44, course.country_code || '');
    const commissionPct = normalizeCommissionPct(countryConfig?.commission_pct);

    // Utiliser le taux figé à l'acceptation si disponible (Pass/Happy Hour)
    const tauxEffectif = (course.commission_locked_at && course.commission_taux_applique != null)
      ? Number(course.commission_taux_applique)
      : commissionPct;

    if (commissionPct === null) {
      // Commission non configurée — clôturer sans commission
      await base44.asServiceRole.entities.CourseExterne.update(courseId, {
        statut: 'livree',
        heure_livraison: nowIso,
        colis_livre_at: nowIso,
        prix_final: montant,
        auto_completed: true,
        auto_completed_at: nowIso,
        auto_completed_reason: 'accepted_timeout_2h',
        delivery_confirmed_at: nowIso,
        delivery_confirmed_by: 'auto_timeout',
        ...(course.livreur_financier_id ? {} : { livreur_financier_id: course.livreur_id }),
      });
      await libererLivreur(base44, course.livreur_id);
      return { course_id: courseId, auto_completed: true, prix_source: 'admin_no_commission' };
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
      auto_completed_reason: 'accepted_timeout_2h',
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

  // ── CAS 2: Course "prix à confirmer" — pas de commission ──
  if (course.prix_a_confirmer) {
    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      statut: 'livree',
      heure_livraison: nowIso,
      colis_livre_at: nowIso,
      auto_completed: true,
      auto_completed_at: nowIso,
      auto_completed_reason: 'accepted_timeout_2h',
      delivery_confirmed_at: nowIso,
      delivery_confirmed_by: 'auto_timeout',
      ...(course.livreur_financier_id ? {} : { livreur_financier_id: course.livreur_id }),
    });

    // Enterprise accounting même pour prix à confirmer
    try {
      if (course.enterprise_id) {
        await comptabiliserCommissionEnterprise(base44.asServiceRole, { ...course, statut: 'livree' });
      }
    } catch (e: any) {
      console.error(`[cloturerAutoTimeout] enterprise accounting error (prix à confirmer) for ${courseId}:`, e?.message);
    }

    await libererLivreur(base44, course.livreur_id);
    return { course_id: courseId, auto_completed: true, prix_source: 'prix_a_confirmer' };
  }

  // ── CAS 3: Course standard — déléguer à calculPrixCourseExterne ──
  try {
    const res = await base44.asServiceRole.functions.invoke('calculPrixCourseExterne', { course_id: courseId });

    // Marquer comme auto-complétée APRÈS le calcul (qui met déjà statut=livree)
    if (res?.success || res?.prix_a_confirmer) {
      await base44.asServiceRole.entities.CourseExterne.update(courseId, {
        auto_completed: true,
        auto_completed_at: nowIso,
        auto_completed_reason: 'accepted_timeout_2h',
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
        prix_final: res?.prix_final,
        commission_silga: res?.commission_silga,
        montant_livreur: res?.montant_livreur,
        prix_source: res?.prix_source || 'calcul_delegated',
      };
    } else {
      // calculPrixCourseExterne a échoué — clôturer sans commission
      await base44.asServiceRole.entities.CourseExterne.update(courseId, {
        statut: 'livree',
        heure_livraison: nowIso,
        colis_livre_at: nowIso,
        auto_completed: true,
        auto_completed_at: nowIso,
        auto_completed_reason: 'accepted_timeout_2h',
        delivery_confirmed_at: nowIso,
        delivery_confirmed_by: 'auto_timeout',
        ...(course.livreur_financier_id ? {} : { livreur_financier_id: course.livreur_id }),
      });
      await libererLivreur(base44, course.livreur_id);
      return { course_id: courseId, auto_completed: true, prix_source: 'calc_failed_no_commission', error: res?.error };
    }
  } catch (calcErr: any) {
    // En cas d'erreur de calcul, clôturer sans commission
    console.error(`[cloturerAutoTimeout] calculPrixCourseExterne error for ${courseId}:`, calcErr?.message);
    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      statut: 'livree',
      heure_livraison: nowIso,
      colis_livre_at: nowIso,
      auto_completed: true,
      auto_completed_at: nowIso,
      auto_completed_reason: 'accepted_timeout_2h',
      delivery_confirmed_at: nowIso,
      delivery_confirmed_by: 'auto_timeout',
      ...(course.livreur_financier_id ? {} : { livreur_financier_id: course.livreur_id }),
    });
    await libererLivreur(base44, course.livreur_id);
    return { course_id: courseId, auto_completed: true, prix_source: 'calc_error_no_commission', error: calcErr?.message };
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