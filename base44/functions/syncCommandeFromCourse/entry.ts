import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Automation: synchronise le statut d'une CourseExterne vers la commande partenaire liée.
 * Déclenché à chaque update de CourseExterne.
 * Mappe les statuts course → commande:
 *   livreur_en_route / arrive_prise_en_charge → livreur_assigne
 *   colis_recupere / en_livraison            → en_livraison
 *   livree                                    → livree
 *   annulee                                   → annulee
 */
const STATUS_MAP = {
  'livreur_en_route': 'livreur_assigne',
  'arrive_prise_en_charge': 'livreur_assigne',
  'colis_recupere': 'en_livraison',
  'en_livraison': 'en_livraison',
  'livree': 'livree',
  'annulee': 'annulee',
};

// Notifications à envoyer au client selon le statut de la course
const CLIENT_NOTIFS = {
  'livreur_en_route': { titre: 'Livreur en route 🛵', msg: 'Un livreur a accepté votre commande et se dirige vers le partenaire.', type: 'livreur_assigne' },
  'arrive_prise_en_charge': { titre: 'Livreur arrivé chez le partenaire', msg: 'Le livreur est arrivé chez le partenaire pour récupérer votre commande.', type: 'livreur_arrive_partenaire' },
  'colis_recupere': { titre: 'Commande récupérée 📦', msg: 'Le livreur a récupéré votre commande et se dirige vers vous.', type: 'colis_recupere' },
  'en_livraison': { titre: 'Commande en livraison 🛵', msg: 'Votre commande est en cours de livraison.', type: 'en_livraison' },
  'livree': { titre: 'Commande livrée ✅', msg: 'Votre commande a été livrée. Merci d\'utiliser SILGAPP !', type: 'commande_livree' },
  'annulee': { titre: 'Commande annulée', msg: 'Votre commande a été annulée.', type: 'commande_annulee' },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event, data, old_data } = body;

    if (!data) return Response.json({ success: true, skip: true });
    if (event?.type !== 'update') return Response.json({ success: true, skip: true });

    const course = data;
    const oldCourse = old_data || {};

    // Skip si le statut n'a pas changé
    if (course.statut === oldCourse.statut) {
      return Response.json({ success: true, skip: true, reason: 'status_unchanged' });
    }

    // Mapper le statut
    const newCommandStatut = STATUS_MAP[course.statut];
    if (!newCommandStatut) {
      return Response.json({ success: true, skip: true, reason: 'no_mapping' });
    }

    const asService = base44.asServiceRole;

    // ── Envoyer notification push au client ──────────────────────────────
    const notifInfo = CLIENT_NOTIFS[course.statut];
    if (notifInfo && course.destinataire_client_id) {
      try {
        const client = await asService.entities.ClientExterne.get(course.destinataire_client_id);
        if (client?.user_email) {
          await base44.functions.invoke('envoiNotificationPush', {
            titre: notifInfo.titre,
            message: notifInfo.msg,
            type: notifInfo.type,
            destinataire_email: client.user_email,
            user_type: 'client',
            client_id: client.id,
            course_id: course.id || '',
          });
          console.log(`[syncCommandeFromCourse] 🔔 Client notifié: ${notifInfo.titre}`);
        }
      } catch (err) {
        console.error(`[syncCommandeFromCourse] ⚠️ Erreur notif client: ${err.message}`);
      }
    }

    // Mettre à jour la commande boutique liée
    if (course.commande_boutique_id) {
      try {
        const cmd = await asService.entities.CommandeBoutique.get(course.commande_boutique_id);
        if (cmd && cmd.statut !== newCommandStatut && !['livree', 'annulee'].includes(cmd.statut)) {
          await asService.entities.CommandeBoutique.update(course.commande_boutique_id, { statut: newCommandStatut });
          console.log(`[syncCommandeFromCourse] 🔄 Commande boutique ${course.commande_boutique_id} → ${newCommandStatut}`);
        }
      } catch (err) {
        console.error(`[syncCommandeFromCourse] ❌ Erreur sync boutique: ${err.message}`);
      }
    }

    // Mettre à jour la commande restaurant liée
    if (course.commande_restaurant_id) {
      try {
        const cmd = await asService.entities.CommandeRestaurant.get(course.commande_restaurant_id);
        if (cmd && cmd.statut !== newCommandStatut && !['livree', 'annulee'].includes(cmd.statut)) {
          await asService.entities.CommandeRestaurant.update(course.commande_restaurant_id, { statut: newCommandStatut });
          console.log(`[syncCommandeFromCourse] 🔄 Commande restaurant ${course.commande_restaurant_id} → ${newCommandStatut}`);
        }
      } catch (err) {
        console.error(`[syncCommandeFromCourse] ❌ Erreur sync restaurant: ${err.message}`);
      }
    }

    return Response.json({ success: true, updated: true, new_statut: newCommandStatut });
  } catch (error) {
    console.error('[syncCommandeFromCourse] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});