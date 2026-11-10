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
  // Explicit retirement switch: stop before authentication, reads, writes or notifications.
  if (Deno.env.get('COMMERCE_LEGACY_ORDER_DISABLED') === 'true') {
    return Response.json({ error: 'CLIENT_UPGRADE_REQUIRED' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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
    const etablissement = await base44.entities[entityName].get(etablissementId);
    if (!etablissement) return Response.json({ error: 'Établissement introuvable' }, { status: 404 });

    // Vérifier actif + ouvert
    if (!etablissement.actif) return Response.json({ error: 'Établissement inactif' }, { status: 400 });
    if (!etablissement.ouvert) return Response.json({ error: 'Établissement fermé' }, { status: 400 });

    // ── Récupérer le profil client ──────────────────────────────────────
    const clients = await base44.entities.ClientExterne.filter({ user_email: user.email });
    const client = clients?.[0];
    if (!client) return Response.json({ error: 'Profil client introuvable' }, { status: 404 });

    // ── Calcul commission ──────────────────────────────────────────────
    // Re-read the authenticated profile through normal RLS, never infer a country.
    if (client.user_email !== user.email || client.actif === false) {
      return Response.json({ error: 'Profil client non autorise' }, { status: 403 });
    }
    if (!/^[A-Z]{2}$/.test(client.country_code || '') || client.country_code !== etablissement.pays_code) {
      return Response.json({ error: 'Le pays du profil client ne correspond pas a cet etablissement' }, { status: 403 });
    }
    if (!Array.isArray(items) || items.length === 0 || !Number.isFinite(total) || total < 0) {
      return Response.json({ error: 'Panier ou montant invalide' }, { status: 400 });
    }
    const productEntity = isRestaurant ? 'PlatRestaurant' : 'ProduitBoutique';
    const authoritativeItems = [];
    const seenProductIds = new Set();
    let authoritativeTotal = 0;
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || !item.id.trim() || seenProductIds.has(item.id)
        || !Number.isSafeInteger(item.quantite) || item.quantite <= 0 || !Number.isFinite(item.prix) || item.prix < 0) {
        return Response.json({ error: 'Article ou quantite invalide' }, { status: 400 });
      }
      seenProductIds.add(item.id);
      const product = await base44.entities[productEntity].get(item.id);
      if (!product || product.id !== item.id || product[idField] !== etablissementId
        || product.actif !== true || product.disponible !== true) {
        return Response.json({ error: 'Article indisponible pour cet etablissement' }, { status: 409 });
      }
      if (!Number.isFinite(product.prix) || product.prix < 0) {
        return Response.json({ error: 'Prix catalogue invalide' }, { status: 409 });
      }
      if (item.prix !== product.prix) {
        return Response.json({ error: 'Le prix a change. Actualisez le panier et confirmez a nouveau.' }, { status: 409 });
      }
      authoritativeTotal += product.prix * item.quantite;
      if (!Number.isFinite(authoritativeTotal) || authoritativeTotal > Number.MAX_SAFE_INTEGER) {
        return Response.json({ error: 'Montant du panier invalide' }, { status: 400 });
      }
      authoritativeItems.push({ id: product.id, nom: product.nom, prix: product.prix, quantite: item.quantite, photo_url: product.photo_url || '' });
    }
    if (total !== authoritativeTotal) {
      return Response.json({ error: 'Le montant a change. Actualisez le panier et confirmez a nouveau.' }, { status: 409 });
    }

    let commissionPct = etablissement.commission_pct;
    if (commissionPct == null) {
      try {
        const configs = await base44.asServiceRole.entities.CommissionConfig.filter({ pays_code: etablissement.pays_code });
        commissionPct = configs?.[0]?.[`commission_${type}_defaut`] ?? null;
      } catch (_) {
        return Response.json({ error: 'Configuration de commission temporairement indisponible. Reessayez plus tard.' }, { status: 503 });
      }
    }
    // Boutique Burkina Faso: 10% only when no individual or boutique-country rate exists.
    if (commissionPct == null && !isRestaurant && etablissement.pays_code === 'BF') {
      commissionPct = 10;
    }
    // Other cases retain the existing Country commission fallback.
    if (commissionPct == null) {
      try {
        const countries = await base44.asServiceRole.entities.Country.filter({ code: etablissement.pays_code, actif: true });
        commissionPct = countries?.[0]?.commission_pct ?? null;
      } catch (_) {
        return Response.json({ error: 'Configuration de commission temporairement indisponible. Reessayez plus tard.' }, { status: 503 });
      }
    }
    if (commissionPct == null) {
      return Response.json({ error: `Commission non configurée pour le pays ${etablissement.pays_code}` }, { status: 400 });
    }
    if (!Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 100) {
      return Response.json({ error: 'Taux de commission invalide' }, { status: 400 });
    }
    const commissionMontant = Math.round(authoritativeTotal * (commissionPct / 100));

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
      items: JSON.stringify(authoritativeItems),
      total: authoritativeTotal,
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

    console.log(`[creerCommandePartenaire]  Commande ${type} créée: ${commande.id} (num: ${numeroCommande})`);

    // ── Notification push au partenaire ─────────────────────────────────
    try {
      await base44.functions.invoke('envoiNotificationPush', {
        titre: 'Nouvelle commande reçue',
        message: `Client: ${commande.client_nom} — Montant: ${(commande.total || 0).toLocaleString()} FCFA`,
        type: 'nouvelle_commande_partenaire',
        destinataire_email: etablissement.user_email,
        user_type: 'partenaire',
      });
      console.log(`[creerCommandePartenaire]  Notification envoyée au partenaire: ${etablissement.user_email}`);
    } catch (notifErr) {
      console.error(`[creerCommandePartenaire]  Erreur notification partenaire: ${notifErr instanceof Error ? notifErr.message : 'Notification failed'}`);
    }

    return Response.json({ success: true, commande, numero_commande: numeroCommande });
  } catch (error) {
    console.error('[creerCommandePartenaire] Erreur:', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Order request failed' }, { status: 500 });
  }
});