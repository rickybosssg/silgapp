import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { emitPaymentReceived } from '../../shared/venusAdminEventBus.ts';
import { recalculerSoldeLivreur } from '../../shared/recalculerSoldeLivreur.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ success: false, error: 'Admin uniquement' }, { status: 403 });

    const { payment_id, action } = await req.json();
    if (!payment_id) return Response.json({ success: false, error: 'payment_id requis' }, { status: 400 });

    const paiement = await base44.asServiceRole.entities.PaiementSilgapp.get(payment_id);
    if (!paiement) return Response.json({ success: false, error: 'Paiement introuvable' }, { status: 404 });
    if (paiement.statut !== 'en_attente') return Response.json({ success: false, error: 'Déjà traité' }, { status: 400 });

    const isRefus = action === 'refuser';

    // Update payment status
    await base44.asServiceRole.entities.PaiementSilgapp.update(payment_id, {
      statut: isRefus ? 'refuse' : 'traite',
      traite_par: user.email,
      traite_at: new Date().toISOString(),
    });

    // Apply regularization only if accepted
    if (!isRefus) {
      if (paiement.user_type === 'livreur') {
        const livreurs = await base44.asServiceRole.entities.Livreur.filter({ id: paiement.user_id });
        if (livreurs?.[0]) {
          const livreur = livreurs[0];

          // ── Marquer les courses livrées impayées comme payées (anciennes d'abord) ──
          // Le solde affiché au livreur est calculé depuis les courses impayées,
          // il faut donc les solder pour que le solde se mette à jour.
          const coursesImpayees = await base44.asServiceRole.entities.CourseExterne.filter(
            { livreur_id: livreur.id, statut: 'livree', statut_paiement_livreur: 'non_paye' },
            'heure_livraison', 200
          );

          let reste = paiement.montant_paye;
          const coursesAPayer = [];
          for (const c of (coursesImpayees || [])) {
            if (reste <= 0) break;
            const comm = c.commission_silga ?? 0;
            coursesAPayer.push(c.id);
            reste -= comm; // peut être négatif = surplus
          }

          // Marquer les courses sélectionnées comme payées (bulk)
          if (coursesAPayer.length > 0) {
            await base44.asServiceRole.entities.CourseExterne.updateMany(
              { id: { $in: coursesAPayer } },
              { $set: { statut_paiement_livreur: 'paye', heure_paiement: new Date().toISOString(), admin_paiement: user.email } }
            );
          }

          // ── Mettre à jour montant_paye et dernier_paiement_date ──
          await base44.asServiceRole.entities.Livreur.update(livreur.id, {
            montant_paye: (livreur.montant_paye || 0) + paiement.montant_paye,
            dernier_paiement_date: new Date().toISOString(),
          });

          // ── Recalculer le solde depuis les sources financières ──
          // montant_du_silga = projection = somme des commissions non payées
          // (les courses marquées payées ci-dessus ne sont plus comptées)
          const resultat = await recalculerSoldeLivreur(base44, livreur.id);
          const { solde: nouveauSolde, seuil, bloque: encoreBloque } = resultat;

          if (seuil === null || seuil <= 0) {
            return Response.json({
              success: false,
              error: `Seuil d'encours non configuré pour le pays ${livreur.country_code}`,
              blocked_reason: 'missing_country_seuil_encours_max',
            }, { status: 400 });
          }

          // Historique
          try {
            await base44.asServiceRole.entities.HistoriqueEncours.create({
              type_action: 'paiement_valide',
              livreur_id: livreur.id,
              livreur_nom: `${livreur.prenom || ''} ${livreur.nom || ''}`.trim(),
              livreur_telephone: livreur.telephone || '',
              pays_code: livreur.country_code,
              encours_avant: livreur.montant_du_silga ?? 0,
              encours_apres: nouveauSolde,
              seuil_applicable: seuil,
              pourcentage_atteint: seuil > 0 ? Math.round((nouveauSolde / seuil) * 100) : 0,
              action_par: user.email,
              commentaire: `Paiement de ${paiement.montant_paye} FCFA validé (${coursesAPayer.length} course(s) soldée(s))`,
              date_action: new Date().toISOString(),
            });
          } catch (_) {}
        }
      } else if (paiement.user_type === 'client') {
        const frais = await base44.asServiceRole.entities.FraisAnnulation.filter({ client_id: paiement.user_id, statut_paiement: 'non_paye' });
        let reste = paiement.montant_paye;
        for (const f of (frais || [])) {
          if (reste <= 0) break;
          const m = f.montant || 0;
          if (m <= reste) {
            await base44.asServiceRole.entities.FraisAnnulation.update(f.id, { statut_paiement: 'paye', paye_at: new Date().toISOString() });
            reste -= m;
          } else {
            await base44.asServiceRole.entities.FraisAnnulation.update(f.id, { montant: m - reste });
            reste = 0;
          }
        }
        // Débloquer le client si le reste à payer est sous le seuil de 2000 FCFA
        const remainingFrais = await base44.asServiceRole.entities.FraisAnnulation.filter({ client_id: paiement.user_id, statut_paiement: 'non_paye' });
        const totalRemaining = (remainingFrais || []).reduce((s, f) => s + (f.montant || 0), 0);
        if (totalRemaining < 2000) {
          await base44.asServiceRole.entities.ClientExterne.update(paiement.user_id, { bloque_frais_annulation: false });
        }
      } else if (paiement.user_type === 'boutique') {
        const boutiques = await base44.asServiceRole.entities.Boutique.filter({ id: paiement.user_id });
        if (boutiques?.[0]) {
          const nouveauSolde = Math.max(0, (boutiques[0].montant_du_silga || 0) - paiement.montant_paye);
          await base44.asServiceRole.entities.Boutique.update(boutiques[0].id, { montant_du_silga: nouveauSolde });
        }
      } else if (paiement.user_type === 'restaurant') {
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: paiement.user_id });
        if (restaurants?.[0]) {
          const nouveauSolde = Math.max(0, (restaurants[0].montant_du_silga || 0) - paiement.montant_paye);
          await base44.asServiceRole.entities.Restaurant.update(restaurants[0].id, { montant_du_silga: nouveauSolde });
        }
      }
    }

    // Send push notification to user
    try {
      const tokens = await base44.asServiceRole.entities.NotificationToken.filter({ user_email: paiement.user_email, actif: true });
      if (tokens && tokens.length > 0) {
        const titre = isRefus ? 'Paiement refusé' : 'Paiement validé ✅';
        const message = isRefus
          ? `Votre preuve de paiement de ${paiement.montant_paye} FCFA n'a pas pu être validée. Contactez SILGAPP.`
          : `Votre paiement de ${paiement.montant_paye} FCFA a été validé par SILGAPP. Merci !`;
        await base44.functions.invoke('envoiNotificationPush', {
          tokens: tokens.map(t => t.token),
          titre,
          message,
          type: 'paiement_traite',
          user_email: paiement.user_email,
        });
      }
    } catch (e) {
      console.error('Push notification error:', e?.message);
    }

    // VENUS Admin Event (non-bloquant)
    if (!isRefus) {
      await emitPaymentReceived(base44, paiement).catch(() => {});
    }

    return Response.json({ success: true, statut: isRefus ? 'refuse' : 'traite' });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});