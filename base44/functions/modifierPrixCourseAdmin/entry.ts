import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * MODIFIER_PRIX_COURSE_ADMIN — Phase 2 Prix
 *
 * Règle métier verrouillée :
 *   Phase A (avant acceptation livreur) : modifie prix_propose_admin uniquement.
 *   Phase B (après acceptation, avant livraison) : modifie prix_propose_admin + notifie livreur + client.
 *   Phase C (après livraison / annulée) : REFUS — édition verrouillée.
 *   Si manual_price accepté : REFUS — prix_propose_admin verrouillé.
 *
 * Ne recalculer JAMAIS commission_silga / montant_livreur ici.
 * Toute correction post-livraison doit passer par un flux comptable dédié.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Réservé admin' }, { status: 403 });

    const body = await req.json();
    const { course_id, nouveau_prix } = body;

    if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });
    const montant = Number(nouveau_prix);
    if (!Number.isFinite(montant) || montant < 100) {
      return Response.json({ error: 'Le prix doit être d\'au moins 100 FCFA' }, { status: 400 });
    }

    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

    // ── Phase C : course livrée ou annulée → verrouillé ──
    if (['livree', 'annulee'].includes(course.statut)) {
      return Response.json({
        error: 'Édition verrouillée — course livrée ou annulée',
        phase: 'C',
        blocked: true,
      }, { status: 403 });
    }

    // ── Prix manuel accepté → verrouillé ──
    if (course.pricing_mode === 'manual' &&
        course.manual_price_status === 'accepted') {
      return Response.json({
        error: 'Prix manuel accepté — prix_propose_admin verrouillé',
        blocked: true,
        block_reason: 'manual_price_accepted',
      }, { status: 403 });
    }

    const ancienPrix = Number(course.prix_propose_admin || course.prix_estimate || 0);
    const isBaisse = montant < ancienPrix;

    // ── Mise à jour prix_propose_admin uniquement ──
    await base44.asServiceRole.entities.CourseExterne.update(course_id, {
      prix_propose_admin: montant,
      pricing_mode: 'admin_manuel',
    });

    // ── Phase B : course acceptée (livreur_id présent) → notification ──
    const isPhaseB = !!course.livreur_id;
    let notificationResult = null;

    if (isPhaseB) {
      const variation = montant - ancienPrix;
      const sens = variation > 0 ? 'augmenté' : 'diminué';
      const messageLivreur = `Le prix de la course a été ${sens} : ${ancienPrix.toLocaleString()} → ${montant.toLocaleString()} FCFA`;
      const messageClient = `Le prix de votre course a été ajusté : ${montant.toLocaleString()} FCFA`;

      // Notifier le livreur
      if (course.livreur_id && course.user_email) {
        try {
          await base44.functions.invoke('envoiNotificationPush', {
            titre: 'Ajustement de prix',
            message: messageLivreur,
            type: 'prix_modifie',
            category: 'course',
            destinataire_email: course.user_email,
            livreur_id: course.livreur_id,
            course_id: course_id,
          });
        } catch (e) {
          console.error('[modifierPrixCourseAdmin] notif livreur échouée', e);
        }
      }

      // Notifier le client
      if (course.client_telephone) {
        try {
          // Recherche du client par téléphone normalisé
          const clients = await base44.asServiceRole.entities.ClientExterne.filter({
            telephone_normalized: course.client_phone_normalized,
          });
          if (clients?.[0]?.user_email) {
            await base44.functions.invoke('envoiNotificationPush', {
              titre: 'Ajustement de prix',
              message: messageClient,
              type: 'prix_modifie',
              category: 'course',
              destinataire_email: clients[0].user_email,
              client_id: clients[0].id,
              course_id: course_id,
            });
          }
        } catch (e) {
          console.error('[modifierPrixCourseAdmin] notif client échouée', e);
        }
      }

      notificationResult = {
        notified: true,
        is_baisse: isBaisse,
        ancien_prix: ancienPrix,
        nouveau_prix: montant,
      };
    }

    return Response.json({
      success: true,
      phase: isPhaseB ? 'B' : 'A',
      ancien_prix: ancienPrix,
      nouveau_prix: montant,
      notification: notificationResult,
      message: isPhaseB
        ? 'Prix mis à jour — livreur et client notifiés'
        : 'Prix mis à jour',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
