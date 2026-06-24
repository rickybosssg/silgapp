import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const STATUS_MAP = {
  livreur_en_route: 'livreur_assigne',
  arrive_prise_en_charge: 'livreur_assigne',
  colis_recupere: 'commande_recuperee',
  en_livraison: 'en_livraison',
  livree: 'livree',
  annulee: 'annulee',
};

const CLIENT_NOTIFS = {
  livreur_en_route: { titre: 'Livreur en route', msg: 'Un livreur a accepte votre commande et se dirige vers le partenaire.', type: 'livreur_assigne' },
  arrive_prise_en_charge: { titre: 'Livreur arrive chez le partenaire', msg: 'Le livreur est arrive chez le partenaire pour recuperer votre commande.', type: 'livreur_arrive_partenaire' },
  colis_recupere: { titre: 'Commande recuperee', msg: 'Le livreur a recupere votre commande et se dirige vers vous.', type: 'colis_recupere' },
  en_livraison: { titre: 'Commande en livraison', msg: 'Votre commande est en cours de livraison.', type: 'en_livraison' },
  livree: { titre: 'Commande livree', msg: "Votre commande a ete livree. Merci d'utiliser SILGAPP.", type: 'commande_livree' },
  annulee: { titre: 'Commande annulee', msg: 'Votre commande a ete annulee.', type: 'commande_annulee' },
};

const PARTNER_NOTIFS = {
  livreur_en_route: { titre: 'Livreur assigne', msg: 'Un livreur a accepte la mission et se dirige vers votre etablissement.', type: 'livreur_assigne' },
  arrive_prise_en_charge: { titre: 'Livreur arrive', msg: 'Le livreur est arrive pour recuperer la commande.', type: 'livreur_arrive_partenaire' },
  colis_recupere: { titre: 'Commande recuperee', msg: 'Le livreur a recupere la commande chez vous et part vers le client.', type: 'colis_recupere' },
  en_livraison: { titre: 'Commande en livraison', msg: 'La commande est en route vers le client.', type: 'en_livraison' },
  livree: { titre: 'Commande livree', msg: 'La commande a ete livree au client.', type: 'commande_livree' },
  annulee: { titre: 'Commande annulee', msg: 'La livraison de cette commande a ete annulee.', type: 'commande_annulee' },
};

const ADMIN_NOTIFS = {
  colis_recupere: { titre: 'Commande partenaire recuperee', msg: 'Un livreur a recupere une commande partenaire.', type: 'colis_recupere' },
  livree: { titre: 'Commande partenaire livree', msg: 'Une commande partenaire a ete livree au client.', type: 'commande_livree' },
  annulee: { titre: 'Commande partenaire annulee', msg: 'Une commande partenaire a ete annulee.', type: 'commande_annulee' },
};

async function notifyPush(base44, payload) {
  if (!payload?.destinataire_email) return;
  try {
    await base44.functions.invoke('envoiNotificationPush', payload);
    console.log(`[syncCommandeFromCourse] push envoye: ${payload.type} -> ${payload.destinataire_email}`);
  } catch (error) {
    console.error(`[syncCommandeFromCourse] erreur push: ${error?.message || error}`);
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
    if (course.statut === oldCourse.statut) {
      return Response.json({ success: true, skip: true, reason: 'status_unchanged' });
    }

    const newCommandStatut = STATUS_MAP[course.statut];
    if (!newCommandStatut) {
      return Response.json({ success: true, skip: true, reason: 'no_mapping' });
    }

    const asService = base44.asServiceRole;

    async function notifyClient() {
      const info = CLIENT_NOTIFS[course.statut];
      if (!info || !course.destinataire_client_id) return;
      const client = await asService.entities.ClientExterne.get(course.destinataire_client_id).catch(() => null);
      if (!client?.user_email) return;
      await notifyPush(base44, {
        titre: info.titre,
        message: info.msg,
        type: info.type,
        destinataire_email: client.user_email,
        user_type: 'client',
        client_id: client.id,
        course_id: course.id || '',
      });
    }

    async function notifyPartner(partnerEmail, commandeOrCourse) {
      const info = PARTNER_NOTIFS[course.statut];
      if (!info || !partnerEmail) return;
      const ref = String(commandeOrCourse?.id || course.id || '').slice(-6).toUpperCase();
      const clientNom = commandeOrCourse?.client_nom || course.client_nom || course.destinataire_nom || 'client';
      const titre = course.statut === 'livree' ? 'Commande livree' : info.titre;
      const message = course.statut === 'livree'
        ? `La commande #${ref} de ${clientNom} a ete livree avec succes.`
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

    await notifyClient();

    if (course.commande_boutique_id) {
      const cmd = await asService.entities.CommandeBoutique.get(course.commande_boutique_id).catch(() => null);
      if (cmd && cmd.statut !== newCommandStatut && !['livree', 'annulee'].includes(cmd.statut)) {
        await asService.entities.CommandeBoutique.update(course.commande_boutique_id, { statut: newCommandStatut });
        const boutique = cmd.boutique_id ? await asService.entities.Boutique.get(cmd.boutique_id).catch(() => null) : null;
        await notifyPartner(boutique?.user_email || '', cmd);
        await notifyAdmins();
      }
    }

    if (course.commande_restaurant_id) {
      const cmd = await asService.entities.CommandeRestaurant.get(course.commande_restaurant_id).catch(() => null);
      if (cmd && cmd.statut !== newCommandStatut && !['livree', 'annulee'].includes(cmd.statut)) {
        await asService.entities.CommandeRestaurant.update(course.commande_restaurant_id, { statut: newCommandStatut });
        const restaurant = cmd.restaurant_id ? await asService.entities.Restaurant.get(cmd.restaurant_id).catch(() => null) : null;
        await notifyPartner(restaurant?.user_email || '', cmd);
        await notifyAdmins();
      }
    }

    if (course.pharmacie_id) {
      const pharmacie = await asService.entities.Pharmacie.get(course.pharmacie_id).catch(() => null);
      await notifyPartner(pharmacie?.user_email || '', course);
      await notifyAdmins();
    }

    return Response.json({ success: true, updated: true, new_statut: newCommandStatut });
  } catch (error) {
    console.error('[syncCommandeFromCourse] erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
