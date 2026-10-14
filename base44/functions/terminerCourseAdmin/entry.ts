import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { chargerConfigPays, normalizeCommissionPct } from '../../shared/dispatchConstants.ts';
import { comptabiliserCommissionEnterprise, normalizeEnterpriseId } from '../../shared/enterpriseFinance.ts';
import { tauxCommissionEffectif, zeroCommissionFields, hasZeroCommissionLock } from '../../shared/commissionLock.ts';
import { completeEcoMissionIfNeeded, updateEcoMissionRouteProgress } from '../../shared/ecoOptimizationEngine.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TERMINER COURSE ADMIN — Finalisation administrative officielle d'une course
// ═══════════════════════════════════════════════════════════════════════════
//
// RÈGLE PRODUIT :
//   Quand un Admin sélectionne "Livrée" et clique "Mettre à jour",
//   SILGAPP exécute la FINALISATION MÉTIER OFFICIELLE — pas un simple update.
//
//   Cette fonction MIRROIR finaliserLivraisonLivreur mais pour l'admin :
//     - Mêmes règles de prix (prix_propose_client, prix_propose_admin, calculPrixCourseExterne)
//     - Mêmes règles de commission (commissionLock, Pass/Happy Hour, Enterprise)
//     - Même libération du livreur (updateLivreurAfterDelivery)
//     - Même comptabilisation (verifierEncoursLivreur — CAS atomique idempotent)
//     - Même gestion Enterprise (comptabiliserCommissionEnterprise)
//     - Même gestion Eco Mission
//
//   Seule différence : delivery_confirmed_by = 'admin' (pas 'bouton').
//
// SÉCURITÉ :
//   - Admin uniquement (role === 'admin')
//   - Idempotent : si déjà livrée → success sans réécriture
//   - Préserve commissionLock (jamais réintroduire le taux Country)
//   - Préserve livreur_financier_id (immuable une fois set)
//   - Préserve Enterprise (dette Enterprise ≠ dette livreur)
//   - Préserve Dispatch V2 (dispatch_status → accepte, notifications expirées)
// ═══════════════════════════════════════════════════════════════════════════

const TERMINAL_STATUSES = ['livree', 'annulee'];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 });

    const body = await req.json();
    const { course_id } = body;

    if (!course_id) {
      return Response.json({ error: 'course_id requis' }, { status: 400 });
    }

    // 1. Charger la course
    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id).catch(() => null);
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

    // 2. Idempotence : si déjà livrée, retourner succès sans réécriture
    if (course.statut === 'livree') {
      return Response.json({
        success: true,
        skipped: 'already_delivered',
        course_id,
        statut: 'livree',
        prix_final: course.prix_final,
        commission_silga: course.commission_silga,
        montant_livreur: course.montant_livreur,
        message: 'Course déjà livrée. Aucune action répétée.',
      });
    }

    // 3. Refuser si annulée
    if (course.statut === 'annulee') {
      return Response.json({
        success: false,
        error: 'Impossible de terminer une course annulée',
        course_id,
        current_status: course.statut,
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    const livreurId = course.livreur_id || course.accepted_by_livreur_id || null;
    const isAdminCourse = course.pricing_mode === 'admin_manuel' || course.source === 'admin';
    const isEnterprise = !!normalizeEnterpriseId(course.enterprise_id);

    // ═══════════════════════════════════════════════════════════════════════
    // 4. RÉSOLUTION DU PRIX — mêmes règles que finaliserLivraisonLivreur
    // ═══════════════════════════════════════════════════════════════════════
    // RÈGLE : NE PAS inventer ou recalculer inutilement.
    //   - Course admin (source=admin) → prix_propose_admin
    //   - Course client publique avec prix_propose_client > 0 → prix_propose_client
    //   - Course standard → déléguer à calculPrixCourseExterne (source de vérité)
    //   - Aucun prix exploitable → refus clair, ne pas inventer
    // ═══════════════════════════════════════════════════════════════════════

    let prixFinal: number | null = null;
    let commissionSilga = 0;
    let montantLivreur = 0;
    let prixSource = '';
    let delegatedToCalculPrix = false;

    if (isAdminCourse) {
      // ── Course admin : prix_propose_admin est la source de vérité ──
      const montant = Number(course.prix_propose_admin);
      if (!Number.isFinite(montant) || montant <= 0) {
        return Response.json({
          success: false,
          error: 'Aucun prix admin défini sur cette course. Renseignez/confirmez le prix avant de finaliser.',
          course_id,
          blocked_reason: 'missing_admin_price',
        }, { status: 400 });
      }
      prixFinal = montant;
      prixSource = 'admin_propose_admin';

    } else if (Number(course.prix_propose_client) > 0) {
      // ── Course client publique avec prix_propose_client > 0 ──
      // NE PAS recalculer via ORS. Le prix du client est la source de vérité.
      prixFinal = Number(course.prix_propose_client);
      prixSource = 'client_prix_propose';

    } else if (course.prix_a_confirmer) {
      // ── Course en "prix à confirmer" : pas de prix exploitable ──
      // On peut quand même clôturer la course, mais sans commission.
      // L'admin devra confirmer le prix via confirmerPrixCourseAdmin.
      prixFinal = null;
      prixSource = 'prix_a_confirmer';

    } else {
      // ── Course standard : déléguer à calculPrixCourseExterne ──
      // calculPrixCourseExterne gère prix_propose_client, TarifZone, calcul auto.
      // Il appelle également verifierEncoursLivreur lui-même.
      try {
        const rawRes = await base44.asServiceRole.functions.invoke('calculPrixCourseExterne', { course_id });
        const res = rawRes?.data ?? rawRes;
        if (res?.success) {
          prixFinal = Number(res.prix_final) || null;
          commissionSilga = Number(res.commission_silga) || 0;
          montantLivreur = Number(res.montant_livreur) || 0;
          prixSource = res.prix_source || 'calculPrixCourseExterne';
          delegatedToCalculPrix = true;
        } else if (res?.prix_a_confirmer) {
          prixFinal = null;
          prixSource = 'prix_a_confirmer_calcul';
        } else {
          return Response.json({
            success: false,
            error: res?.error || 'Impossible de calculer le prix de cette course. Renseignez/confirmez le prix avant de finaliser.',
            course_id,
            blocked_reason: 'prix_calculation_failed',
          }, { status: 400 });
        }
      } catch (calcErr: any) {
        return Response.json({
          success: false,
          error: 'Erreur calculPrixCourseExterne: ' + (calcErr?.message || calcErr),
          course_id,
        }, { status: 500 });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. CALCUL COMMISSION — si pas délégué à calculPrixCourseExterne
    // ═══════════════════════════════════════════════════════════════════════
    // Préserver commissionLock : le taux figé à l'acceptation reste la source.
    // L'admin ne JAMAIS réintroduire le taux Country.
    // ═══════════════════════════════════════════════════════════════════════

    if (!delegatedToCalculPrix && prixFinal !== null && prixFinal > 0) {
      const countryConfig = await chargerConfigPays(base44, course.country_code || '');
      const commissionPct = normalizeCommissionPct(countryConfig?.commission_pct);

      let tauxEffectif: number;
      if (isEnterprise) {
        // Enterprise : utiliser le taux figé sur la course, ou le taux de l'enterprise
        tauxEffectif = (course.commission_locked_at && course.commission_taux_applique != null)
          ? Number(course.commission_taux_applique)
          : commissionPct ?? 0;
      } else {
        // Public : utiliser tauxCommissionEffectif (respecte commissionLock)
        tauxEffectif = tauxCommissionEffectif(course, commissionPct ?? 0);
      }

      if (isEnterprise) {
        // ── ENTERPRISE : commission = 0 sur la course (payée par l'entreprise) ──
        // Le livreur n'est JAMAIS débité. La commission Enterprise va dans EnterpriseLedger.
        commissionSilga = 0;
        montantLivreur = prixFinal;
      } else {
        commissionSilga = Math.round(prixFinal * (tauxEffectif / 100));
        montantLivreur = prixFinal - commissionSilga;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. CONSTRUIRE L'UPDATE
    // ═══════════════════════════════════════════════════════════════════════

    const updateData: any = {
      statut: 'livree',
      dispatch_status: 'accepte',
      heure_livraison: now,
      colis_livre_at: now,
      delivery_confirmed_by: 'admin',
      delivery_confirmed_at: now,
      auto_completed: false,
    };

    // Prix et commission (uniquement si prix exploitable)
    if (prixFinal !== null && prixFinal > 0) {
      updateData.prix_final = prixFinal;
      updateData.commission_silga = commissionSilga;
      updateData.montant_livreur = montantLivreur;
      // Préserver zeroCommissionFields (Pass/Happy Hour → encours_comptabilise_montant = 0)
      Object.assign(updateData, zeroCommissionFields(course));
    }

    // livreur_financier_id : immuable une fois set
    if (!course.livreur_financier_id && livreurId) {
      updateData.livreur_financier_id = livreurId;
    }

    await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);

    // ═══════════════════════════════════════════════════════════════════════
    // 7. EXPIRER LES NOTIFICATIONS DE DISPATCH ENCORE ACTIVES
    // ═══════════════════════════════════════════════════════════════════════
    let notifsExpired = 0;
    try {
      const activeNotifs = await base44.asServiceRole.entities.DispatchNotification.filter({
        course_id,
        statut: { $in: ['notifie', 'push_tente', 'push_succes', 'sans_token'] },
      }, undefined, 50);

      if (activeNotifs && activeNotifs.length > 0) {
        const ids = activeNotifs.map((n: any) => n.id);
        const result = await base44.asServiceRole.entities.DispatchNotification.updateMany(
          { id: { $in: ids }, statut: { $in: ['notifie', 'push_tente', 'push_succes', 'sans_token'] } },
          { $set: { statut: 'expire', date_reponse: now } }
        );
        notifsExpired = result?.updated || 0;
      }
    } catch (e: any) {
      console.error('[TERMINER_COURSE_ADMIN] Cleanup notifications failed:', e?.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 8. COMPTABILISATION FINANCIÈRE OFFICIELLE — verifierEncoursLivreur
    // ═══════════════════════════════════════════════════════════════════════
    // CAS atomique (Compare-And-Set) : garantie qu'une seule commission est
    // comptabilisée, même en cas de double-clic. Si prix_a_confirmer, pas de
    // commission à comptabiliser (sera fait par confirmerPrixCourseAdmin).
    // ═══════════════════════════════════════════════════════════════════════
    let encoursResult = null;
    if (prixFinal !== null && prixFinal > 0 && !isEnterprise) {
      // Courses publiques : comptabiliser la commission dans le dû livreur
      try {
        const resp = await base44.asServiceRole.functions.invoke('verifierEncoursLivreur', {
          course_id,
        });
        encoursResult = resp?.data || resp;
      } catch (e: any) {
        console.error('[TERMINER_COURSE_ADMIN] verifierEncoursLivreur failed:', e?.message);
        encoursResult = { error: e?.message };
      }
    } else if (prixFinal !== null && prixFinal > 0 && isEnterprise) {
      // ── ENTERPRISE : comptabiliser dans EnterpriseLedger (pas le dû livreur) ──
      try {
        const entCourse = await base44.asServiceRole.entities.CourseExterne.get(course_id);
        if (entCourse?.enterprise_id) {
          await comptabiliserCommissionEnterprise(base44.asServiceRole, entCourse);
        }
      } catch (entErr: any) {
        console.error('[TERMINER_COURSE_ADMIN] enterprise accounting error:', entErr?.message);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 9. LIBÉRER LE LIVREUR — même logique que finaliserLivraisonLivreur
    // ═══════════════════════════════════════════════════════════════════════
    // Cas A : aucune autre course active → disponible
    // Cas B : autre course active → reste en_course
    // Cas C : manual_hors_ligne → reste hors_ligne
    // Cas D : admin_hors_ligne → reste hors_ligne
    // Cas E : bloque_encours → hors_ligne + admin_hors_ligne
    // ═══════════════════════════════════════════════════════════════════════
    let livreurLibere = false;
    let livreurStatut = null;
    if (livreurId) {
      const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
      if (livreur) {
        const STATUTS_ACTIFS = ["livreur_en_route", "client_contacte", "en_route_expediteur", "arrive_prise_en_charge", "colis_recupere", "passager_embarque", "pris_en_charge", "en_livraison", "arrivee"];
        const autresCourses = await base44.asServiceRole.entities.CourseExterne.filter(
          { livreur_id: livreurId },
          "-created_date", 10
        ).catch(() => []);
        const aAutreCourseActive = (autresCourses || []).some((c: any) =>
          c.id !== course_id && STATUTS_ACTIFS.includes(c.statut)
        );

        let nouveauStatut: string;
        if (livreur.bloque_encours) {
          nouveauStatut = 'hors_ligne';
        } else if (livreur.manual_hors_ligne === true) {
          nouveauStatut = 'hors_ligne';
        } else if (livreur.admin_hors_ligne === true) {
          nouveauStatut = 'hors_ligne';
        } else if (aAutreCourseActive) {
          nouveauStatut = 'en_course';
        } else {
          nouveauStatut = 'disponible';
        }

        await base44.asServiceRole.entities.Livreur.update(livreurId, {
          statut: nouveauStatut,
          courses_du_jour: (Number(livreur.courses_du_jour) || 0) + 1,
        });
        livreurLibere = nouveauStatut === 'disponible';
        livreurStatut = nouveauStatut;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 10. ECO MISSION — mettre à jour le route plan
    // ═══════════════════════════════════════════════════════════════════════
    await updateEcoMissionRouteProgress(base44, course_id).catch(() => null);
    await completeEcoMissionIfNeeded(base44, course_id).catch(() => null);

    console.log(`[TERMINER_COURSE_ADMIN] Course ${course_id} clôturée par ${user.email} — prix=${prixFinal} commission=${commissionSilga} source=${prixSource}`);

    return Response.json({
      success: true,
      course_id,
      ancien_statut: course.statut,
      nouveau_statut: 'livree',
      prix_final: prixFinal,
      commission_silga: commissionSilga,
      montant_livreur: montantLivreur,
      prix_source: prixSource,
      commission_mode: course.commission_mode || 'normal',
      commission_taux_applique: course.commission_taux_applique,
      delivery_confirmed_by: 'admin',
      delivery_confirmed_at: now,
      livreur_id: livreurId,
      livreur_libere: livreurLibere,
      livreur_statut: livreurStatut,
      notifs_expirees: notifsExpired,
      encours_result: encoursResult,
      is_enterprise: isEnterprise,
      admin_email: user.email,
      message: 'Course terminée avec succès.',
    });

  } catch (error: any) {
    console.error('[TERMINER_COURSE_ADMIN] Erreur:', error);
    return Response.json({ error: error?.message || 'Erreur interne' }, { status: 500 });
  }
}