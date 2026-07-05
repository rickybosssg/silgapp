import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
          const nouveauSolde = Math.max(0, (livreurs[0].montant_du_silga || 0) - paiement.montant_paye);
          await base44.asServiceRole.entities.Livreur.update(livreurs[0].id, {
            montant_du_silga: nouveauSolde,
            dernier_paiement_date: new Date().toISOString(),
          });
        }
      } else if (paiement.user_type === 'client') {
        const frais = await base44.asServiceRole.entities.FraisAnnulation.filter({ client_id: paiement.user_id, statut_paiement: 'non_paye' });
        for (const f of (frais || [])) {
          await base44.asServiceRole.entities.FraisAnnulation.update(f.id, { statut_paiement: 'paye', paye_at: new Date().toISOString() });
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

    return Response.json({ success: true, statut: isRefus ? 'refuse' : 'traite' });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});