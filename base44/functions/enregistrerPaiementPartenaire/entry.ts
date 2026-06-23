import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Enregistre un paiement d'un partenaire vers SILGAPP (avec preuve de dépôt).
 * Le partenaire saisit un montant et upload une photo de preuve.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const { type, montant, preuve_url } = payload;

    if (!type || !['boutique', 'restaurant', 'pharmacie'].includes(type)) {
      return Response.json({ error: 'type requis' }, { status: 400 });
    }
    if (!montant || montant <= 0) {
      return Response.json({ error: 'montant invalide' }, { status: 400 });
    }
    if (!preuve_url) {
      return Response.json({ error: 'preuve de dépôt requise' }, { status: 400 });
    }

    // Vérifier que l'utilisateur possède bien l'établissement
    const entityName = type === 'restaurant' ? 'Restaurant' : type === 'pharmacie' ? 'Pharmacie' : 'Boutique';
    const etablissements = await base44.entities[entityName].filter({ partenaire_id: user.id });
    if (!etablissements || etablissements.length === 0) {
      return Response.json({ error: 'Aucun établissement trouvé' }, { status: 404 });
    }
    const etablissement = etablissements[0];

    const paiement = await base44.entities.PaiementPartenaire.create({
      partenaire_id: user.id,
      etablissement_id: etablissement.id,
      etablissement_nom: etablissement.nom,
      type,
      pays_code: etablissement.pays_code,
      montant,
      preuve_url,
      statut: 'en_attente',
    });

    return Response.json({ success: true, paiement });
  } catch (error) {
    console.error('[enregistrerPaiementPartenaire] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
