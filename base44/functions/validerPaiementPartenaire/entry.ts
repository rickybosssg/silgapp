import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import { resolveCommerceAdminScope } from '../../shared/commerceAdminGrant.js';

/**
 * Admin valide ou refuse un paiement partenaire.
 * Si confirmé, le montant est déduit du "dû à SILGAPP" du partenaire.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

    const payload = await req.json().catch(() => ({}));
    const { paiement_id, action, motif_refus } = payload;

    if (!paiement_id || !['confirmer', 'refuser'].includes(action)) {
      return Response.json({ error: 'paiement_id et action requis' }, { status: 400 });
    }

    const paiement = await base44.asServiceRole.entities.PaiementPartenaire.get(paiement_id);
    if (!paiement || paiement.id !== paiement_id) return Response.json({ error: 'Paiement introuvable' }, { status: 404 });
    // Routing requires this initial service read, after authentication and the historical admin-role gate.
    // ONLY the persisted payment type chooses the branch. Caller-supplied type is ignored.
    if (paiement.type === 'pharmacie') {
      // Historical pharmacy behavior intentionally retained, NOT covered by commerce grants or CAS.
      if (paiement.statut !== 'en_attente') return Response.json({ error: 'Paiement deja traite' }, { status: 400 });
      const legacyUpdate: Record<string,unknown> = {
        statut: action === 'confirmer' ? 'confirme' : 'refuse',
        traite_par: user.email,
        traite_at: new Date().toISOString(),
      };
      if (action === 'refuser' && motif_refus) legacyUpdate.motif_refus = motif_refus;
      const updated = await base44.asServiceRole.entities.PaiementPartenaire.update(paiement_id, legacyUpdate);
      return Response.json({ success: true, paiement: updated });
    }
    let scope;
    try { scope = resolveCommerceAdminScope(user, Deno.env.get('COMMERCE_ADMIN_GRANTS_JSON')); }
    catch { return Response.json({ error: 'TRUSTED_ADMIN_SCOPE_REQUIRED' }, { status: 403 }); }
    // Commerce grants authorize boutiques/restaurants only.
    const parentEntities: Record<string,string> = { boutique: 'Boutique', restaurant: 'Restaurant' };
    if (!Object.hasOwn(parentEntities, paiement.type) || typeof paiement.etablissement_id !== 'string' || !paiement.etablissement_id
      || !/^[A-Z]{2}$/.test(paiement.pays_code || '') || paiement.enterprise_id
      || (scope.scope !== 'global' && scope.country_code !== paiement.pays_code)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
    const parent = await base44.asServiceRole.entities[parentEntities[paiement.type]].get(paiement.etablissement_id);
    if (!parent || parent.id !== paiement.etablissement_id || parent.pays_code !== paiement.pays_code || parent.enterprise_id
      || !paiement.partenaire_id || parent.partenaire_id !== paiement.partenaire_id) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
    if (paiement.statut !== 'en_attente') {
      return Response.json({ error: 'Paiement déjà traité' }, { status: 400 });
    }

    const update: Record<string,unknown> = {
      statut: action === 'confirmer' ? 'confirme' : 'refuse',
      traite_par: user.email,
      traite_at: new Date().toISOString(),
    };
    if (action === 'refuser' && motif_refus) update.motif_refus = motif_refus;

    const storage = base44.asServiceRole.entities.PaiementPartenaire;
    const condition = { id: paiement_id, statut: 'en_attente', pays_code: paiement.pays_code,
      type: paiement.type, etablissement_id: paiement.etablissement_id, partenaire_id: paiement.partenaire_id };
    const uncertain = () => Response.json({ success: false, error: 'PAYMENT_OUTCOME_UNCERTAIN', uncertain: true }, { status: 409 });
    let receipt;
    try { receipt = await storage.updateMany(condition, { $set: update }); }
    catch { return uncertain(); }
    if (receipt?.success === true && receipt.updated === 0 && receipt.has_more !== true) {
      return Response.json({ success: false, error: 'PAYMENT_STATE_CONFLICT', uncertain: false }, { status: 409 });
    }
    if (receipt?.success !== true || receipt.updated !== 1 || receipt.has_more === true) return uncertain();
    // A confirmed CAS is never repeated, including after a failed receipt read.
    let updated;
    try {
      updated = await storage.get(paiement_id);
      const currentParent = await base44.asServiceRole.entities[parentEntities[paiement.type]].get(paiement.etablissement_id);
      const currentScope = resolveCommerceAdminScope(user, Deno.env.get('COMMERCE_ADMIN_GRANTS_JSON'));
      if (!updated || updated.id !== paiement_id || updated.type !== paiement.type || updated.pays_code !== paiement.pays_code
        || updated.etablissement_id !== paiement.etablissement_id || updated.partenaire_id !== paiement.partenaire_id || updated.enterprise_id
        || updated.statut !== update.statut || updated.traite_par !== update.traite_par || updated.traite_at !== update.traite_at
        || (currentScope.scope !== 'global' && currentScope.country_code !== updated.pays_code)
        || !currentParent || currentParent.id !== paiement.etablissement_id || currentParent.pays_code !== updated.pays_code
        || currentParent.partenaire_id !== updated.partenaire_id || currentParent.enterprise_id) return uncertain();
    } catch { return uncertain(); }

    return Response.json({ success: true, paiement: updated });
  } catch (error) {
    console.error('[validerPaiementPartenaire] Erreur:', error);
    return Response.json({ error: error instanceof Error ? error.message : 'PAYMENT_FAILED' }, { status: 500 });
  }
});
