import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
    if (!paiement) return Response.json({ error: 'Paiement introuvable' }, { status: 404 });
    if (paiement.statut !== 'en_attente') {
      return Response.json({ error: 'Paiement déjà traité' }, { status: 400 });
    }

    const update = {
      statut: action === 'confirmer' ? 'confirme' : 'refuse',
      traite_par: user.email,
      traite_at: new Date().toISOString(),
    };
    if (action === 'refuser' && motif_refus) update.motif_refus = motif_refus;

    const updated = await base44.asServiceRole.entities.PaiementPartenaire.update(paiement_id, update);

    return Response.json({ success: true, paiement: updated });
  } catch (error) {
    console.error('[validerPaiementPartenaire] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
