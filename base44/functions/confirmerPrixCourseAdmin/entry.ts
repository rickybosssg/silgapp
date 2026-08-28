import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { chargerConfigPays, normalizeCommissionPct, chargerTarifZone } from '../../shared/dispatchConstants.ts';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIRMER PRIX COURSE ADMIN — Confirme manuellement le prix d'une course
// ═══════════════════════════════════════════════════════════════════════════
//
// Utilisée quand une course a prix_a_confirmer=true (calcul automatique impossible).
// L'admin choisit le prix final → la fonction calcule commission + montant livreur.
//
// Sécurités :
//   - Vérifie les permissions admin (auth.me role)
//   - Vérifie que la course existe
//   - Vérifie que le montant > 0
//   - Idempotente : si prix_final déjà défini ET prix_a_confirmer=false → skip
//   - Calcule commission_silga avec le taux applicable (Country.commission_pct)
//   - Calcule montant_livreur
//   - Appelle verifierEncoursLivreur pour comptabiliser (idempotent via encours_comptabilise_at)
//
// Ne modifie JAMAIS :
//   - pricing_mode (reste "automatic" ou "manual" pour les courses client)
//   - Le dispatch V2
//   - La logique comptable existante
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    // ── Vérifier permissions admin ──
    if (user.role !== 'admin') {
      return Response.json({ error: 'Permissions admin requises' }, { status: 403 });
    }

    const body = await req.json();
    const { course_id, prix_final } = body;

    if (!course_id) {
      return Response.json({ error: 'course_id requis' }, { status: 400 });
    }

    const montant = Number(prix_final);
    if (!Number.isFinite(montant) || montant <= 0) {
      return Response.json({ error: 'Le prix doit être un nombre positif' }, { status: 400 });
    }

    // ── Récupérer la course ──
    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
    if (!course) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }

    // ── Idempotence : si déjà confirmé, ne pas recomptabiliser ──
    if (course.prix_final && course.prix_final > 0 && course.prix_a_confirmer === false) {
      return Response.json({
        success: true,
        skipped: 'already_confirmed',
        course_id,
        prix_final: course.prix_final,
        commission_silga: course.commission_silga,
        montant_livreur: course.montant_livreur,
      });
    }

    // ── Charger la commission du pays ──
    const countryConfig = await chargerConfigPays(base44, course.country_code || '');
    const commissionPct = normalizeCommissionPct(countryConfig?.commission_pct);
    if (commissionPct === null) {
      return Response.json({
        error: `Commission non configurée pour le pays ${course.country_code}`,
        blocked_reason: 'missing_country_commission_pct',
      }, { status: 400 });
    }

    // ── Calcul commission + montant livreur ──
    const commissionSilga = Math.round(montant * (commissionPct / 100));
    const montantLivreur = montant - commissionSilga;
    const now = new Date().toISOString();

    // ── Mettre à jour la course ──
    const updateData = {
      prix_final: montant,
      commission_silga: commissionSilga,
      montant_livreur: montantLivreur,
      prix_a_confirmer: false,
      prix_confirme_par_admin_at: now,
      prix_confirme_par_admin_id: user.email,
    };

    // Si la course est déjà livrée, on ne change pas le statut
    // (la commission est comptabilisée a posteriori)
    if (course.statut !== 'livree') {
      updateData['statut'] = course.statut; // garder le statut actuel
    }

    const updated = await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);

    // ── Comptabiliser la commission dans le solde du livreur ──
    // Idempotent via encours_comptabilise_at — ne comptabilise qu'une fois.
    if (course.livreur_id) {
      try {
        await base44.asServiceRole.functions.invoke('verifierEncoursLivreur', { course_id });
      } catch (encoursErr: any) {
        console.error('[confirmerPrixCourseAdmin] verifierEncoursLivreur error:', encoursErr?.message);
      }
    }

    return Response.json({
      success: true,
      course: updated,
      prix_final: montant,
      commission_silga: commissionSilga,
      montant_livreur: montantLivreur,
      confirmed_by: user.email,
      confirmed_at: now,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}