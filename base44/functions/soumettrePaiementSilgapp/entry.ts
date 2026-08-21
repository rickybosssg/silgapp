import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Non autorisé' }, { status: 401 });

    const { user_type, user_id, user_nom, user_telephone, type_dette, montant_du, montant_paye, preuve_url, preuve_type, request_id, country_code } = await req.json();

    if (!user_type || !user_id || !montant_paye || !preuve_url) {
      return Response.json({ success: false, error: 'Champs manquants' }, { status: 400 });
    }

    if (!country_code) {
      return Response.json({ success: false, error: 'COUNTRY_REQUIRED: Le pays est obligatoire pour créer un paiement' }, { status: 400 });
    }

    if (request_id) {
      const existing = await base44.asServiceRole.entities.PaiementSilgapp.filter({ request_id }, '-created_date', 1);
      if (existing?.[0]) return Response.json({ success: true, paiement: existing[0], duplicate: true });
    }

    // L'utilisateur peut payer plus que sa dette (avance/crédit) — pas de plafond ici

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
      preuve_type: preuve_type || 'image',
      request_id: request_id || crypto.randomUUID(),
      statut: 'en_attente',
      date_envoi: new Date().toISOString(),
      country_code,
    });

    return Response.json({ success: true, paiement });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});