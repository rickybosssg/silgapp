import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Renvoie les données comptables d'un partenaire (boutique ou restaurant) :
 * - CA total, commission due à Silga, net partenaire
 * - Commandes par statut, par jour
 * - Top produits
 * - Paiements vers SILGAPP et solde dû restant
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const { type, date_debut, date_fin } = payload;

    if (!type || !['boutique', 'restaurant'].includes(type)) {
      return Response.json({ error: 'type requis (boutique ou restaurant)' }, { status: 400 });
    }

    // Vérifier que l'utilisateur possède bien un établissement de ce type
    const entityName = type === 'restaurant' ? 'Restaurant' : 'Boutique';
    const etablissements = await base44.entities[entityName].filter({ partenaire_id: user.id });
    if (!etablissements || etablissements.length === 0) {
      return Response.json({ error: 'Aucun établissement trouvé' }, { status: 404 });
    }
    const etablissement = etablissements[0];

    const now = new Date();
    const debut = date_debut ? new Date(date_debut) : new Date(now.getFullYear(), now.getMonth(), 1);
    const fin = date_fin ? new Date(date_fin + 'T23:59:59.999Z') : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Récupérer toutes les commandes du partenaire
    const commandeEntity = type === 'restaurant' ? 'CommandeRestaurant' : 'CommandeBoutique';
    const idField = type === 'restaurant' ? 'restaurant_id' : 'boutique_id';
    const commandes = await base44.entities[commandeEntity].filter({ [idField]: etablissement.id }, '-created_date', 5000);

    // Filtrer par période (created_date)
    const commandesPeriode = commandes.filter(c => {
      const d = new Date(c.created_date);
      return d >= debut && d <= fin;
    });

    // Agrégations
    let caTotal = 0, commissionSilga = 0, netPartenaire = 0;
    const parStatut = {}, parJour = {}, parProduit = {};
    let nbCommandes = 0, nbLivrees = 0, nbAnnulees = 0;

    commandesPeriode.forEach(c => {
      const total = c.total || 0;
      const commission = c.commission_montant || 0;
      const net = total - commission;

      caTotal += total;
      commissionSilga += commission;
      netPartenaire += net;
      nbCommandes++;

      if (c.statut === 'livree') nbLivrees++;
      if (c.statut === 'annulee') nbAnnulees++;

      // Par statut
      const st = c.statut || 'inconnu';
      if (!parStatut[st]) parStatut[st] = { nb: 0, ca: 0, commission: 0 };
      parStatut[st].nb++;
      parStatut[st].ca += total;
      parStatut[st].commission += commission;

      // Par jour
      const jour = c.created_date?.slice(0, 10) || 'inconnu';
      if (!parJour[jour]) parJour[jour] = { ca: 0, commission: 0, nb: 0 };
      parJour[jour].ca += total;
      parJour[jour].commission += commission;
      parJour[jour].nb++;

      // Top produits
      try {
        const items = JSON.parse(c.items || '[]');
        items.forEach(it => {
          const nom = it.nom || 'Inconnu';
          if (!parProduit[nom]) parProduit[nom] = { nom, quantite: 0, ca: 0 };
          parProduit[nom].quantite += (it.quantite || 1);
          parProduit[nom].ca += ((it.prix || 0) * (it.quantite || 1));
        });
      } catch (_) {}
    });

    // Évolution triée par jour
    const evolution = Object.keys(parJour).sort().map(j => ({
      date: j, ca: parJour[j].ca, commission: parJour[j].commission, nb: parJour[j].nb,
    }));

    // Top produits
    const topProduits = Object.values(parProduit).sort((a, b) => b.ca - a.ca).slice(0, 10);

    // ── Paiements partenaire vers SILGAPP ──
    const paiements = await base44.entities.PaiementPartenaire.filter({ partenaire_id: user.id }, '-created_date', 500);
    let totalPayeConfirme = 0, totalPayeEnAttente = 0;
    paiements.forEach(p => {
      if (p.statut === 'confirme') totalPayeConfirme += (p.montant || 0);
      else if (p.statut === 'en_attente') totalPayeEnAttente += (p.montant || 0);
    });
    const duSilgaRestant = Math.max(0, commissionSilga - totalPayeConfirme);

    // Période précédente pour comparaison
    const dureeJours = Math.max(1, Math.round((fin - debut) / (24 * 3600 * 1000)));
    const debutPrec = new Date(debut.getTime() - dureeJours * 24 * 3600 * 1000);
    const finPrec = new Date(debut.getTime() - 1);
    const commandesPrev = commandes.filter(c => {
      const d = new Date(c.created_date);
      return d >= debutPrec && d <= finPrec;
    });
    const caPrev = commandesPrev.reduce((s, c) => s + (c.total || 0), 0);
    const pctCa = caPrev > 0 ? Math.round(((caTotal - caPrev) / caPrev) * 100) : null;

    return Response.json({
      success: true,
      etablissement: { id: etablissement.id, nom: etablissement.nom, type },
      periode: { debut: debut.toISOString(), fin: fin.toISOString() },
      kpis: {
        ca_total: caTotal,
        commission_silga: commissionSilga,
        net_partenaire: netPartenaire,
        nb_commandes: nbCommandes,
        nb_livrees: nbLivrees,
        nb_annulees: nbAnnulees,
        ca_precedent: caPrev,
        pct_ca: pctCa,
        taux_commission_moyen: caTotal > 0 ? Math.round((commissionSilga / caTotal) * 100) : 0,
        du_silga_restant: duSilgaRestant,
        total_paye_confirme: totalPayeConfirme,
        total_paye_en_attente: totalPayeEnAttente,
      },
      par_statut: parStatut,
      evolution,
      top_produits: topProduits,
      paiements: paiements.slice(0, 50),
    });
  } catch (error) {
    console.error('[getComptabilitePartenaire] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
