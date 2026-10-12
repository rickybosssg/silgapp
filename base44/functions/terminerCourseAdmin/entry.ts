import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// ═══════════════════════════════════════════════════════════════════════════
// TERMINER COURSE ADMIN — Clôture administrative d'une course par l'admin
// ═══════════════════════════════════════════════════════════════════════════
//
// Permet à un admin de clôturer exceptionnellement une course active
// (lorsque le livreur ne peut pas le faire lui-même).
//
// Étapes :
// 1. Valide l'identité admin (base44.auth.me + role === 'admin')
// 2. Vérifie que la course n'est pas déjà terminée/annulée
// 3. Calcule la commission si non déjà figée (prix_final × taux / 100)
// 4. Passe la course au statut 'livree' avec delivery_confirmed_by='admin'
// 5. Expire les notifications de dispatch encore actives
// 6. Libère le livreur s'il n'a aucune autre course active
// 7. Comptabilise la commission via verifierEncoursLivreur (idempotent)
//
// Sécurité :
// - Admin uniquement (role === 'admin')
// - Ne modifie jamais les prix ni les commissions existantes
// - Ne réintroduit pas QR/PIN
// - Ne touche pas au Dispatch V2
// - Idempotent : double comptabilisation impossible
// ═══════════════════════════════════════════════════════════════════════════

const TERMINAL_STATUSES = ['livree', 'annulee'];

const ACTIVE_STATUSES = [
  'livreur_en_route', 'client_contacte', 'en_route_expediteur',
  'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque',
  'pris_en_charge', 'en_livraison', 'arrivee',
];

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

    // 2. Vérifier que la course n'est pas déjà terminée
    if (TERMINAL_STATUSES.includes(course.statut)) {
      return Response.json({
        success: false,
        error: `Course déjà au statut terminal: ${course.statut}`,
        course_id,
        current_status: course.statut,
      }, { status: 400 });
    }

    // 3. Calculer la commission si non déjà figée
    const taux = Number(course.commission_taux_applique) || 20;
    const prixFinal = Number(course.prix_final) || Number(course.prix_propose_admin) || Number(course.prix_propose_client) || 0;

    if (prixFinal <= 0) {
      return Response.json({
        success: false,
        error: 'Aucun prix défini sur cette course. Impossible de clôturer sans prix.',
        course_id,
      }, { status: 400 });
    }

    const commissionSilga = Number(course.commission_silga) || Math.round(prixFinal * (taux / 100));
    const montantLivreur = Number(course.montant_livreur) || (prixFinal - commissionSilga);
    const now = new Date().toISOString();
    const livreurId = course.livreur_id || course.accepted_by_livreur_id || null;

    // 4. Mettre à jour la course — ne PAS setter encours_comptabilise_at
    //    (verifierEncoursLivreur s'en charge, sinon il skip et le solde n'est pas recalculé)
    const updateData: any = {
      statut: 'livree',
      dispatch_status: 'accepte',
      heure_livraison: now,
      colis_livre_at: now,
      delivery_confirmed_by: 'admin',
      delivery_confirmed_at: now,
      prix_final: prixFinal,
      commission_silga: commissionSilga,
      montant_livreur: montantLivreur,
      statut_paiement_livreur: course.statut_paiement_livreur || 'non_paye',
    };

    if (livreurId) {
      updateData.livreur_financier_id = livreurId;
    }

    await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);

    // 5. Expire les notifications de dispatch encore actives
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

    // 6. Libérer le livreur s'il n'a aucune autre course active
    let livreurLibere = false;
    let livreurStatut = null;
    if (livreurId) {
      try {
        const autresCourses = await base44.asServiceRole.entities.CourseExterne.filter({
          livreur_id: livreurId,
          statut: { $in: ACTIVE_STATUSES },
        }, '-created_date', 10);

        const aAutreCourse = (autresCourses || []).some((c: any) => c.id !== course_id);
        const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);

        if (livreur) {
          const nouveauStatut = aAutreCourse ? 'en_course' : (livreur.manual_hors_ligne === true ? 'hors_ligne' : 'disponible');
          await base44.asServiceRole.entities.Livreur.update(livreurId, { statut: nouveauStatut });
          livreurLibere = !aAutreCourse;
          livreurStatut = nouveauStatut;
        }
      } catch (e: any) {
        console.error('[TERMINER_COURSE_ADMIN] Libération livreur failed:', e?.message);
      }
    }

    // 7. Comptabilisation idempotente de la commission via verifierEncoursLivreur
    let encoursResult = null;
    try {
      const resp = await base44.asServiceRole.functions.invoke('verifierEncoursLivreur', {
        course_id,
      });
      encoursResult = resp?.data || resp;
    } catch (e: any) {
      console.error('[TERMINER_COURSE_ADMIN] verifierEncoursLivreur failed:', e?.message);
      encoursResult = { error: e?.message };
    }

    console.log(`[TERMINER_COURSE_ADMIN] Course ${course_id} clôturée par ${user.email} — commission: ${commissionSilga} FCFA`);

    return Response.json({
      success: true,
      course_id,
      ancien_statut: course.statut,
      nouveau_statut: 'livree',
      prix_final: prixFinal,
      commission_silga: commissionSilga,
      montant_livreur: montantLivreur,
      delivery_confirmed_by: 'admin',
      delivery_confirmed_at: now,
      livreur_id: livreurId,
      livreur_libere: livreurLibere,
      livreur_statut: livreurStatut,
      notifs_expirees: notifsExpired,
      encours_result: encoursResult,
      admin_email: user.email,
    });

  } catch (error: any) {
    console.error('[TERMINER_COURSE_ADMIN] Erreur:', error);
    return Response.json({ error: error?.message || 'Erreur interne' }, { status: 500 });
  }
}