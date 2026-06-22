import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Crée une commande partenaire (boutique ou restaurant).
 * - Authentifie le client
 * - Vérifie l'établissement (actif + ouvert)
 * - Calcule la commission
 * - Génère un numéro de commande unique
 * - Crée l'entité CommandeBoutique ou CommandeRestaurant
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { type, boutique_id, restaurant_id, items, total, adresse_livraison, quartier_livraison, gps_lat, gps_lng, note_client, preuve_paiement_url } = body;

    if (!type || !['boutique', 'restaurant'].includes(type)) {
      return Response.json({ error: 'type requis (boutique ou restaurant)' }, { status: 400 });
    }

    const isRestaurant = type === 'restaurant';
    const idField = isRestaurant ? 'restaurant_id' : 'boutique_id';
    const etablissementId = isRestaurant ? restaurant_id : boutique_id;
    if (!etablissementId) return Response.json({ error: 'etablissementId requis' }, { status: 400 });

    // ── Récupérer l'établissement ──────────────────────────────────────
    const entityName = isRestaurant ? 'Restaurant' : 'Boutique';
    const etablissement = await base44.asServiceRole.entities[entityName].get(etablissementId);
    if (!etablissement) return Response.json({ error: 'Établissement introuvable' }, { status: 404 });

    // Vérifier actif + ouvert
    if (!etablissement.actif) return Response.json({ error: 'Établissement inactif' }, { status: 400 });
    if (!etablissement.ouvert) return Response.json({ error: 'Établissement fermé' }, { status: 400 });

    // ── Récupérer le profil client ──────────────────────────────────────
    const clients = await base44.asServiceRole.entities.ClientExterne.filter({ user_email: user.email });
    const client = clients?.[0];
    if (!client) return Response.json({ error: 'Profil client introuvable' }, { status: 404 });

    // ── Calcul commission ──────────────────────────────────────────────
    let commissionPct = etablissement.commission_pct;
    if (commissionPct == null) {
      try {
        const configs = await base44.asServiceRole.entities.CommissionConfig.filter({ pays_code: etablissement.pays_code });
        commissionPct = configs?.[0]?.[`commission_${type}_defaut`] ?? 10;
      } catch (_) { commissionPct = 10; }
    }
    const commissionMontant = Math.round((total || 0) * (commissionPct / 100));

    // ── Numéro de commande unique ───────────────────────────────────────
    const prefix = isRestaurant ? 'RST' : 'BTQ';
    const numeroCommande = `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    // ── Créer la commande ───────────────────────────────────────────────
    const commandeEntity = isRestaurant ? 'CommandeRestaurant' : 'CommandeBoutique';
    const commande = await base44.asServiceRole.entities[commandeEntity].create({
      [idField]: etablissementId,
      boutique_nom: !isRestaurant ? etablissement.nom : undefined,
      restaurant_nom: isRestaurant ? etablissement.nom : undefined,
      client_id: client.id,
      client_nom: `${client.prenom || ''} ${client.nom || ''}`.trim(),
      client_telephone: client.telephone,
      pays_code: etablissement.pays_code,
      items: JSON.stringify(items || []),
      total: total || 0,
      adresse_livraison: adresse_livraison || '',
      quartier_livraison: quartier_livraison || '',
      gps_lat: gps_lat || null,
      gps_lng: gps_lng || null,
      note_client: note_client || '',
      preuve_paiement_url: preuve_paiement_url || '',
      statut: 'commande_envoyee',
      partenaire_id: etablissement.partenaire_id,
      commission_pct: commissionPct,
      commission_montant: commissionMontant,
    });

    console.log(`[creerCommandePartenaire] ✅ Commande ${type} créée: ${commande.id} (num: ${numeroCommande})`);

    return Response.json({ success: true, commande, numero_commande: numeroCommande });
  } catch (error) {
    console.error('[creerCommandePartenaire] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});