import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { chargerConfigPays, normalizeCommissionPct } from '../../shared/dispatchConstants.ts';

// ═══════════════════════════════════════════════════════════════════════════
// FINALISER LIVRAISON LIVREUR — Source de vérité pour la livraison
// ═══════════════════════════════════════════════════════════════════════════
//
// RÈGLE FINANCIÈRE ABSOLUE :
//   Le frontend ne transmet QUE le montant brut saisi (prix_final_livreur).
//   Le backend calcule TOUJOURS commission_silga et montant_livreur.
//   Le frontend ne transmet JAMAIS commission_silga ou montant_livreur.
//
// Hiérarchie de calcul :
//   1. Courses admin (source=admin, pricing_mode=admin_manuel) :
//      → prix_final = prix_final_livreur (montant brut saisi par le livreur)
//      → commission_silga = Math.round(prix * (commissionPct / 100))
//      → montant_livreur = prix - commission_silga
//      → commissionPct chargé depuis Country via chargerConfigPays
//
//   2. Courses standard (automatic, manual) :
//      → DÉLÈGUE à calculPrixCourseExterne (source de vérité unique)
//      → calculPrixCourseExterne gère prix_propose_client, TarifZone, calcul auto
//      → calculPrixCourseExterne appelle verifierEncoursLivreur lui-même
//
// Sécurité :
//   - Valide l'identité du livreur (user.email → Livreur.user_email)
//   - Idempotent : si statut === "livree" → success sans réécriture
//   - Protection double livraison : check statut avant update
//   - Strip TOUS les champs sensibles non liés à la livraison
//   - verifierEncoursLivreur appelé après chaque finalisation (comptabilisation encours)
// ═══════════════════════════════════════════════════════════════════════════

const STATUTS_FINALISABLES = ['arrivee', 'en_livraison', 'colis_recupere', 'pris_en_charge'];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { course_id, prix_final_livreur, is_multi_colis, colis_data } = body;

    if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });

    // Récupérer la course
    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

    const isAdminCourse = course.pricing_mode === 'admin_manuel' || course.source === 'admin';

    // Idempotence: si déjà livrée, ne pas écraser le prix existant
    if (course.statut === 'livree') {
      // Courses admin : corriger le trou historique (prix_final = 0/null)
      // en écrivant prix_propose_admin comme source de vérité.
      if (isAdminCourse && (!course.prix_final || course.prix_final === 0) && Number(course.prix_propose_admin) > 0) {
        const prixFix = Number(course.prix_propose_admin);
        const countryFix = await chargerConfigPays(base44, course.country_code || '');
        const commissionPctFix = normalizeCommissionPct(countryFix?.commission_pct);
        if (commissionPctFix !== null) {
          const commissionFix = Math.round(prixFix * (commissionPctFix / 100));
          const montantFix = prixFix - commissionFix;
          await base44.asServiceRole.entities.CourseExterne.update(course_id, {
            prix_final: prixFix,
            commission_silga: commissionFix,
            montant_livreur: montantFix,
          });
          console.warn(`[finaliserLivraisonLivreur] TROU CORRIGÉ: course ${course_id} prix_final=${prixFix} (was 0/null, source=prix_propose_admin)`);
        }
      }
      return Response.json({ success: true, skipped: 'already_delivered', course_id });
    }

    // Vérifier statut finalisable
    if (!STATUTS_FINALISABLES.includes(course.statut)) {
      return Response.json({
        error: `Finalisation impossible depuis le statut: ${course.statut}`,
        statut_actuel: course.statut,
      }, { status: 400 });
    }

    // Vérifier identité livreur
    if (!course.livreur_id) return Response.json({ error: 'Aucun livreur assigné' }, { status: 403 });
    const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id).catch(() => null);
    if (!livreur) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });
    if (livreur.user_email !== user.email) {
      return Response.json({ error: 'Vous n\'êtes pas le livreur assigné' }, { status: 403 });
    }

    const now = new Date().toISOString();

    // ── CAS 1: Course admin — le livreur saisit le prix (montant brut) ──
    // Le backend calcule commission_silga et montant_livreur côté backend uniquement.
    if (isAdminCourse) {
      // ── RÈGLE MÉTIER : prix_propose_admin est la source de vérité ──
      // Le livreur ne peut jamais remplacer ce prix. prix_final_livreur est ignoré.
      const montant = Number(course.prix_propose_admin);
      if (!Number.isFinite(montant) || montant <= 0) {
        return Response.json({
          error: 'prix_propose_admin manquant pour cette course admin — impossible de finaliser',
          blocked_reason: 'missing_admin_price',
        }, { status: 400 });
      }

      // Charger la commission du pays (source de vérité: Country.commission_pct)
      const countryConfig = await chargerConfigPays(base44, course.country_code || livreur.country_code);
      const commissionPct = normalizeCommissionPct(countryConfig?.commission_pct);
      if (commissionPct === null) {
        return Response.json({
          error: `Commission non configurée pour le pays ${course.country_code}`,
          blocked_reason: 'missing_country_commission_pct',
        }, { status: 400 });
      }

      // Calcul côté backend uniquement — prix_propose_admin est la source
      const commissionSilga = Math.round(montant * (commissionPct / 100));
      const montantLivreur = montant - commissionSilga;

      const updateData = {
        statut: 'livree',
        heure_livraison: now,
        colis_livre_at: now,
        prix_final: montant,
        commission_silga: commissionSilga,
        montant_livreur: montantLivreur,
        // ── Identité financière immuable ──
        // Renseigné côté backend au moment de la livraison, JAMAIS modifié ensuite.
        // Si déjà présent (re-finalisation), on ne l'écrase pas.
        ...(course.livreur_financier_id ? {} : { livreur_financier_id: course.livreur_id }),
      };

      // Multi-colis: mettre à jour les colis individuels
      if (is_multi_colis && colis_data) {
        await handleMultiColis(base44, course_id, colis_data, now);
      }

      const updated = await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);

      // Comptabiliser l'encours (délègue à verifierEncoursLivreur — idempotent)
      try {
        await base44.asServiceRole.functions.invoke('verifierEncoursLivreur', { course_id });
      } catch (encoursErr: any) {
        console.error('[finaliserLivraisonLivreur] verifierEncoursLivreur error:', encoursErr?.message);
      }

      return Response.json({
        success: true,
        course: updated,
        prix_final: montant,
        commission_silga: commissionSilga,
        montant_livreur: montantLivreur,
        prix_source: 'admin_livreur_saisi',
      });
    }

    // ── CAS 2: Course standard — déléguer à calculPrixCourseExterne ──
    // calculPrixCourseExterne est la source de vérité pour:
    //   - prix_propose_client_locked (client a modifié le prix)
    //   - calcul automatique (distance × prix_par_km, min prix_minimum)
    //   - TarifZone (paliers Grand Ouaga)
    // Il appelle également verifierEncoursLivreur lui-même.
    //
    // ── CAS 2b: Course en "prix à confirmer" ──
    // Si le prix n'a pas pu être calculé automatiquement (GPS manquant, etc.),
    // le livreur PEUT terminer la livraison. La course passe en "livree" mais
    // SANS commission (prix_final reste null). L'admin confirmera le prix
    // ultérieurement via confirmerPrixCourseAdmin, qui calculera alors la
    // commission et appellera verifierEncoursLivreur.
    if (course.prix_a_confirmer) {
      const updateData = {
        statut: 'livree',
        heure_livraison: now,
        colis_livre_at: now,
        // prix_final reste null — sera défini par confirmerPrixCourseAdmin
        // commission_silga reste null — sera calculée par confirmerPrixCourseAdmin
        // montant_livreur reste null — sera calculé par confirmerPrixCourseAdmin
        ...(course.livreur_financier_id ? {} : { livreur_financier_id: course.livreur_id }),
      };

      if (is_multi_colis && colis_data) {
        await handleMultiColis(base44, course_id, colis_data, now);
      }

      const updated = await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);

      // NE PAS appeler verifierEncoursLivreur ici — il n'y a pas de commission à comptabiliser.
      // verifierEncoursLivreur sera appelé par confirmerPrixCourseAdmin après confirmation du prix.
      return Response.json({
        success: true,
        course: updated,
        prix_a_confirmer: true,
        prix_final: null,
        commission_silga: null,
        montant_livreur: null,
        prix_source: 'prix_a_confirmer_livraison',
        message: 'Course livrée. Le prix reste à confirmer par l\'admin. Aucune commission comptabilisée pour le moment.',
      });
    }

    try {
      const res = await base44.asServiceRole.functions.invoke('calculPrixCourseExterne', { course_id });
      if (res?.success) {
        // Multi-colis: mettre à jour les colis individuels
        if (is_multi_colis && colis_data) {
          await handleMultiColis(base44, course_id, colis_data, now);
        }
        return Response.json({
          success: true,
          course: res.course,
          delegated: 'calculPrixCourseExterne',
          prix_final: res.prix_final,
          commission_silga: res.commission_silga,
          montant_livreur: res.montant_livreur,
          prix_source: res.prix_source,
        });
      } else if (res?.prix_a_confirmer) {
        // calculPrixCourseExterne a mis la course en "prix à confirmer"
        // Le livreur peut quand même terminer la livraison.
        const updateData = {
          statut: 'livree',
          heure_livraison: now,
          colis_livre_at: now,
          ...(course.livreur_financier_id ? {} : { livreur_financier_id: course.livreur_id }),
        };

        if (is_multi_colis && colis_data) {
          await handleMultiColis(base44, course_id, colis_data, now);
        }

        const updated = await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);
        return Response.json({
          success: true,
          course: updated,
          prix_a_confirmer: true,
          prix_final: null,
          commission_silga: null,
          montant_livreur: null,
          prix_source: 'prix_a_confirmer_livraison',
          message: 'Course livrée. Le prix reste à confirmer par l\'admin.',
        });
      } else {
        return Response.json({ error: res?.error || 'Erreur calcul prix' }, { status: 400 });
      }
    } catch (calcErr: any) {
      return Response.json({ error: 'Erreur calculPrixCourseExterne: ' + (calcErr?.message || calcErr) }, { status: 500 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ── Helper multi-colis: mettre à jour les colis individuels ──
async function handleMultiColis(base44: any, courseId: string, colisData: any[], now: string) {
  for (const item of colisData) {
    if (!item.colis_id) continue;
    const statutColis = item.statut === 'annule' ? 'annule' : 'livre';
    await base44.asServiceRole.entities.ColisExterne.update(item.colis_id, {
      statut: statutColis,
      ...(statutColis === 'livre' ? { heure_livraison: now } : {}),
    }).catch(() => null);
  }
  // Recalculer les compteurs
  const colis = await base44.asServiceRole.entities.ColisExterne.filter({ course_id: courseId }, 'numero_ordre', 50).catch(() => []);
  const nbLivres = (colis || []).filter((c: any) => c.statut === 'livre').length;
  const nbAnnules = (colis || []).filter((c: any) => c.statut === 'annule').length;
  await base44.asServiceRole.entities.CourseExterne.update(courseId, {
    nb_colis_livres: nbLivres,
    nb_colis_annules: nbAnnules,
  }).catch(() => null);
}