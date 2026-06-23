import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Automation: synchronise le statut d'une CourseExterne vers la commande partenaire liée.
 * Déclenché à chaque update de CourseExterne.
 * Mappe les statuts course → commande:
 *   livreur_en_route / arrive_prise_en_charge → livreur_assigne
 *   colis_recupere                           → commande_recuperee
 *   en_livraison                             → en_livraison
 *   livree                                    → livree
 *   annulee                                   → annulee
 */
const STATUS_MAP = {
  'livreur_en_route': 'livreur_assigne',
  'arrive_prise_en_charge': 'livreur_assigne',
  'colis_recupere': 'commande_recuperee',
  'en_livraison': 'en_livraison',
  'livree': 'livree',
  'annulee': 'annulee',
};

// Notifications à envoyer au client selon le statut de la course
const CLIENT_NOTIFS = {
  'livreur_en_route': { titre: 'Livreur en route ', msg: 'Un livreur a accepté votre commande et se dirige vers le partenaire.', type: 'livreur_assigne' },
  'arrive_prise_en_charge': { titre: 'Livreur arrivé chez le partenaire', msg: 'Le livreur est arrivé chez le partenaire pour récupérer votre commande.', type: 'livreur_arrive_partenaire' },
  'colis_recupere': { titre: 'Commande récupérée ', msg: 'Le livreur a récupéré votre commande et se dirige vers vous.', type: 'colis_recupere' },
  'en_livraison': { titre: 'Commande en livraison ', msg: 'Votre commande est en cours de livraison.', type: 'en_livraison' },
  'livree': { titre: 'Commande livrée ', msg: 'Votre commande a été livrée. Merci d\'utiliser SILGAPP !', type: 'commande_livree' },
  'annulee': { titre: 'Commande annulée', msg: 'Votre commande a été annulée.', type: 'commande_annulee' },
};

const PARTNER_NOTIFS = {
  'livreur_en_route': { titre: 'Livreur assigne', msg: 'Un livreur a accepte la mission et se dirige vers votre etablissement.', type: 'livreur_assigne' },
  'colis_recupere': { titre: 'Commande recuperee', msg: 'Le livreur a recupere la commande chez vous et part vers le client.', type: 'colis_recupere' },
  'en_livraison': { titre: 'Commande en livraison', msg: 'La commande est en route vers le client.', type: 'en_livraison' },
  'livree': { titre: 'Commande livree', msg: 'La commande a ete livree au client.', type: 'commande_livree' },
  'annulee': { titre: 'Commande annulee', msg: 'La livraison de cette commande a ete annulee.', type: 'commande_annulee' },
};

const ADMIN_NOTIFS = {
  'colis_recupere': { titre: 'Commande partenaire recuperee', msg: 'Un livreur a recupere une commande partenaire.', type: 'colis_recupere' },
  'livree': { titre: 'Commande partenaire livree', msg: 'Une commande partenaire a ete livree au client.', type: 'commande_livree' },
  'annulee': { titre: 'Commande partenaire annulee', msg: 'Une commande partenaire a ete annulee.', type: 'commande_annulee' },
};

async function notifyPush(base44, payload) {
  try {
    await base44.functions.invoke('envoiNotificationPush', payload);
  } catch (err) {
    console.error(`[syncCommandeFromCourse] Erreur notif push: ${err.message}`);
  }
}

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

    async function notifyPartner(partnerEmail, commande) {
      const info = PARTNER_NOTIFS[course.statut];
      if (!info || !partnerEmail) return;
      const ref = String(commande?.id || course.id || '').slice(-6).toUpperCase();
      const clientNom = commande?.client_nom || course.client_nom || 'client';
      const titre = course.statut === 'livree' ? 'Commande livree' : info.titre;
      const message = course.statut === 'livree'
        ? `La commande #${ref} de ${clientNom} a ete livree.`
        : info.msg;
      await notifyPush(base44, {
        titre,
        message,
        type: info.type,
        destinataire_email: partnerEmail,
        user_type: 'partenaire',
        course_id: course.id || '',
      });
    }

    async function notifyAdmins() {
      const info = ADMIN_NOTIFS[course.statut];
      if (!info) return;
      const admins = await asService.entities.User.filter({ role: 'admin' }).catch(() => []);
      for (const admin of admins || []) {
        if (!admin.email) continue;
        if (admin.admin_type === 'pays' && admin.country_code && admin.country_code !== course.country_code) continue;
        await asService.entities.Notification.create({
          titre: info.titre,
          message: info.msg,
          type: info.type,
          destinataire_email: admin.email,
          lue: false,
          course_id: course.id || '',
          country_code: course.country_code || '',
        }).catch(() => null);
        await notifyPush(base44, {
          titre: info.titre,
          message: info.msg,
          type: info.type,
          destinataire_email: admin.email,
          user_type: 'admin',
          course_id: course.id || '',
        });
      }
    }

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
          console.log(`[syncCommandeFromCourse]  Client notifié: ${notifInfo.titre}`);
        }
      } catch (err) {
        console.error(`[syncCommandeFromCourse]  Erreur notif client: ${err.message}`);
      }
    }

    // Mettre à jour la commande boutique liée
    if (course.commande_boutique_id) {
      try {
        const cmd = await asService.entities.CommandeBoutique.get(course.commande_boutique_id);
        if (cmd && cmd.statut !== newCommandStatut && !['livree', 'annulee'].includes(cmd.statut)) {
          await asService.entities.CommandeBoutique.update(course.commande_boutique_id, { statut: newCommandStatut });
          const boutique = cmd.boutique_id ? await asService.entities.Boutique.get(cmd.boutique_id).catch(() => null) : null;
          await notifyPartner(boutique?.user_email || '', cmd);
          await notifyAdmins();
          console.log(`[syncCommandeFromCourse]  Commande boutique ${course.commande_boutique_id} → ${newCommandStatut}`);
        }
      } catch (err) {
        console.error(`[syncCommandeFromCourse]  Erreur sync boutique: ${err.message}`);
      }
    }

    // Mettre à jour la commande restaurant liée
    if (course.commande_restaurant_id) {
      try {
        const cmd = await asService.entities.CommandeRestaurant.get(course.commande_restaurant_id);
        if (cmd && cmd.statut !== newCommandStatut && !['livree', 'annulee'].includes(cmd.statut)) {
          await asService.entities.CommandeRestaurant.update(course.commande_restaurant_id, { statut: newCommandStatut });
          const restaurant = cmd.restaurant_id ? await asService.entities.Restaurant.get(cmd.restaurant_id).catch(() => null) : null;
          await notifyPartner(restaurant?.user_email || '', cmd);
          await notifyAdmins();
          console.log(`[syncCommandeFromCourse]  Commande restaurant ${course.commande_restaurant_id} → ${newCommandStatut}`);
        }
      } catch (err) {
        console.error(`[syncCommandeFromCourse]  Erreur sync restaurant: ${err.message}`);
      }
    }

    return Response.json({ success: true, updated: true, new_statut: newCommandStatut });
  } catch (error) {
    console.error('[syncCommandeFromCourse] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
