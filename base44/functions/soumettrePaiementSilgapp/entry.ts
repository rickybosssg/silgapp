import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Non autorisé' }, { status: 401 });

    const { user_type, user_id, user_nom, user_telephone, type_dette, montant_du, montant_paye, preuve_url, country_code } = await req.json();

    if (!user_type || !user_id || !montant_paye || !preuve_url) {
      return Response.json({ success: false, error: 'Champs manquants' }, { status: 400 });
    }

    // Le montant payé ne peut pas dépasser le montant dû
    if (montant_du && montant_paye > montant_du) {
      return Response.json({ success: false, error: `Le montant payé (${montant_paye} F) ne peut pas dépasser le montant dû (${montant_du} F)` }, { status: 400 });
    }

    const paiement = await base44.asServiceRole.entities.PaiementSilgapp.create({
      user_email: user.email,
      user_type,
      user_id,
      user_nom,
      user_telephone: user_telephone || '',
      type_dette: type_dette || (user_type === 'livreur' ? 'commission_livreur' : user_type === 'client' ? 'frais_annulation_client' : user_type === 'boutique' ? 'commission_boutique' : 'commission_restaurant'),
      montant_du: montant_du || 0,
      montant_paye,
      numero_depot: '+226 66 92 51 90',
      preuve_url,
      statut: 'en_attente',
      date_envoi: new Date().toISOString(),
      country_code: country_code || 'BF',
    });

    return Response.json({ success: true, paiement });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});