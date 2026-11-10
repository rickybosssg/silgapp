import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import { createCommerceSingletonJournal } from '../../shared/commerceJournal.js';
import { validateCommerceOrderProof } from '../../shared/commercePaymentProof.js';
import { hashCommerceCreation } from '../../shared/commerceCreationHash.js';

/**
 * Crée une commande partenaire (boutique ou restaurant).
 * - Authentifie le client
 * - Vérifie l'établissement (actif + ouvert)
 * - Calcule la commission
 * - Génère un numéro de commande unique
 * - Crée l'entité CommandeBoutique ou CommandeRestaurant
 */
Deno.serve(async (req) => {
  let creationRecorded = false;
  try {
    if (req.method !== 'POST') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    let user;
    try {
      user = await base44.auth.me();
    } catch (authError) {
      // Classify only authentication lookup failures, never downstream SDK errors.
      const status = authError && typeof authError === 'object'
        ? ('status' in authError ? authError.status : 'response' in authError && authError.response && typeof authError.response === 'object' && 'status' in authError.response ? authError.response.status : undefined)
        : undefined;
      if (status === 401 || status === 403) return Response.json({ error: status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN' }, { status });
      throw authError;
    }
    if (!user?.email || !user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { request_id, type, boutique_id, restaurant_id, items, total, adresse_livraison, quartier_livraison, gps_lat, gps_lng, note_client, preuve_paiement_url, proof_id } = body;

    if (!type || !['boutique', 'restaurant'].includes(type)) {
      return Response.json({ error: 'type requis (boutique ou restaurant)' }, { status: 400 });
    }

    if (typeof request_id !== 'string' || !request_id.trim() || request_id.length > 200) return Response.json({ error: 'REQUEST_ID_REQUIRED', client_upgrade_required: true }, { status: 400 });
    const privateProofRequested = Object.hasOwn(body,'proof_id');
    if (privateProofRequested && Deno.env.get('COMMERCE_PRIVATE_PROOFS_ENABLED') !== 'true') return Response.json({error:'PRIVATE_PROOFS_NOT_ENABLED'},{status:503});
    if (privateProofRequested && preuve_paiement_url) return Response.json({error:'PROOF_PAYLOAD_CONFLICT'},{status:400});
    const singletonId = Deno.env.get('COMMERCE_MUTATION_JOURNAL_ID');
    if (!singletonId) return Response.json({ error: 'COMMERCE_JOURNAL_NOT_PROVISIONED' }, { status: 503 });
    const isRestaurant = type === 'restaurant';
    const idField = isRestaurant ? 'restaurant_id' : 'boutique_id';
    const etablissementId = isRestaurant ? restaurant_id : boutique_id;
    if (!etablissementId) return Response.json({ error: 'etablissementId requis' }, { status: 400 });

    // Normal client RLS and ownership precede all privileged commerce reads.
    const clients = await base44.entities.ClientExterne.filter({ user_email: user.email });
    if (!clients?.length) return Response.json({ error: 'Profil client introuvable' }, { status: 404 });
    const client = clients[0];
    if (clients.length !== 1 || !client.id || client.user_email !== user.email || client.actif === false || user.enterprise_id || client.enterprise_id
      || !/^[A-Z]{2}$/.test(client.country_code || '')) return Response.json({ error: 'Profil client non autorise' }, { status: 403 });
    const sr = base44.asServiceRole.entities;
    const entityName = isRestaurant ? 'Restaurant' : 'Boutique';
    const etablissement = await sr[entityName].get(etablissementId);
    if (!etablissement || etablissement.id !== etablissementId) return Response.json({ error: 'Etablissement introuvable' }, { status: 404 });
    if (client.country_code !== etablissement.pays_code || etablissement.enterprise_id) return Response.json({ error: 'Pays non autorise' }, { status: 403 });
    if (!etablissement.actif) return Response.json({ error: 'Etablissement inactif' }, { status: 400 });
    if (!etablissement.ouvert) return Response.json({ error: 'Etablissement ferme' }, { status: 400 });
    if (!Array.isArray(items) || items.length === 0 || items.length > 200 || !Number.isFinite(total) || total < 0) {
      return Response.json({ error: 'Panier ou montant invalide' }, { status: 400 });
    }
    if ((gps_lat != null && (!Number.isFinite(gps_lat) || gps_lat < -90 || gps_lat > 90))
      || (gps_lng != null && (!Number.isFinite(gps_lng) || gps_lng < -180 || gps_lng > 180))) {
      return Response.json({ error: 'INVALID_GPS_COORDINATES' }, { status: 400 });
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
      const product = await sr[productEntity].get(item.id);
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
    const proofFields = privateProofRequested ? await validateCommerceOrderProof({api:base44,user,client,type,parent:etablissement,proofId:proof_id}) : {};
    const payload = {
      ...proofFields,
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
      gps_lat: gps_lat ?? null,
      gps_lng: gps_lng ?? null,
      note_client: note_client || '',
      preuve_paiement_url: privateProofRequested ? '' : preuve_paiement_url || '',
      statut: 'commande_envoyee',
      partenaire_id: etablissement.partenaire_id,
      commission_pct: commissionPct,
      commission_montant: commissionMontant,
    };
    const normalizedPayload = JSON.parse(JSON.stringify(payload));
    const expected: Record<string,string> = { request_id, actor_id: user.id,
      scope_id: client.country_code + ':' + etablissementId, operation: 'create_order:' + type,
      payload_hash: await hashCommerceCreation({ actor_id: user.id, type, parent_id: etablissementId, payload: normalizedPayload }) };
    const journal = createCommerceSingletonJournal({ storage: sr.CommerceMutationJournal, singletonId,
      authorize: async (candidate: Record<string,string>) => Object.keys(expected).every(key => candidate[key] === expected[key]),
      newClaimId: () => crypto.randomUUID() });
    const result = await journal.execute(expected, async () => {
      const freshClients = await base44.entities.ClientExterne.filter({ user_email: user.email });
      const fresh = freshClients?.[0];
      const parent = await sr[entityName].get(etablissementId);
      if (freshClients?.length !== 1 || fresh?.id !== client.id || fresh.user_email !== user.email || fresh.actif === false
        || fresh.enterprise_id || fresh.country_code !== client.country_code || parent?.id !== etablissementId
        || parent.pays_code !== client.country_code || parent.enterprise_id || !parent.actif || !parent.ouvert) throw Error('AUTHORIZATION_CHANGED');
      if (privateProofRequested) await validateCommerceOrderProof({api:base44,user,client:fresh,type,parent,proofId:proof_id});
      const created = await sr[commandeEntity].create(normalizedPayload);
      return { result_id: created?.id };
    });
    if (!('result_id' in result) || typeof result.result_id !== 'string' || !result.result_id) return Response.json({ error: 'ORDER_RECONCILIATION_REQUIRED', uncertain: true, request_id,
      reason: 'reason' in result ? result.reason : 'RECEIPT_MISSING' }, { status: 503 });
    creationRecorded = true;
    const commande = await sr[commandeEntity].get(result.result_id);
    const currentClients = await base44.entities.ClientExterne.filter({ user_email: user.email });
    const current = currentClients?.[0];
    if (currentClients?.length !== 1 || current?.id !== client.id || current.user_email !== user.email || current.actif === false
      || current.enterprise_id || current.country_code !== client.country_code || commande?.id !== result.result_id
      || commande.client_id !== client.id || commande[idField] !== etablissementId || commande.pays_code !== client.country_code || (privateProofRequested && commande.commerce_payment_proof_id !== proof_id)) {
      return Response.json({ error: 'ORDER_RECEIPT_NOT_AUTHORIZED', uncertain: true, creation_recorded: true, request_id }, { status: 403 });
    }


    console.log(`[creerCommandePartenaire]  Commande ${type} créée: ${commande.id} (num: ${numeroCommande})`);

    // ── Notification push au partenaire ─────────────────────────────────
    try {
      if (result.decision === 'completed') await base44.functions.invoke('envoiNotificationPush', {
        titre: 'Nouvelle commande reçue',
        message: `Client: ${commande.client_nom} — Montant: ${(commande.total || 0).toLocaleString()} FCFA`,
        type: 'nouvelle_commande_partenaire',
        destinataire_email: etablissement.user_email,
        user_type: 'partenaire',
      });
      console.log(`[creerCommandePartenaire]  Notification envoyée au partenaire: ${etablissement.user_email}`);
    } catch (notifErr) {
      console.error(`[creerCommandePartenaire]  Erreur notification partenaire: ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`);
    }

    return Response.json({ success: true, commande, numero_commande: commande.id, replayed: result.decision === 'replay_receipt' });
  } catch (error) {
    const proofError = error && typeof error === 'object' ? error as {code?:string;status?:number} : {};
    if (['PROOF_FORBIDDEN','INVALID_ID','INVALID_TYPE','INVALID_PRIVATE_PROOF','AUTH_REQUIRED'].includes(proofError.code || '')) return Response.json({error:proofError.code},{status:[400,401,403,404,503].includes(proofError.status || 0)?proofError.status:503});
    console.error('[creerCommandePartenaire] Operation failed without confirmed receipt');
    const code = error instanceof Error && error.message === 'REQUEST_BINDING_CONFLICT' ? 'REQUEST_BINDING_CONFLICT' : 'ORDER_FAILED';
    return Response.json({ error: code, ...(creationRecorded ? { uncertain: true, creation_recorded: true } : {}) }, { status: code === 'REQUEST_BINDING_CONFLICT' ? 409 : 500 });
  }
});