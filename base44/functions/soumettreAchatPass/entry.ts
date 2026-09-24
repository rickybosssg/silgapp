import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ═══════════════════════════════════════════════════════════════════════════
// SOUMETTRE ACHAT PASS — Livreur soumet une preuve d'achat de Pass
// ═══════════════════════════════════════════════════════════════════════════
//
// RÈGLE FINANCIÈRE : un achat de Pass N'EST PAS un paiement du dû SILGAPP.
//   → Ne réduit JAMAIS montant_du_silga
//   → Ne marque JAMAIS d'anciennes courses comme paye
//   → Ne consomme JAMAIS credit_surplus
//   → La validation admin active le Pass (debut_at, expiration_at)
//
// Idempotence : request_id unique par tentative. Un doublon retourne le premier.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Non autorisé' }, { status: 401 });

    const { pass_offer_id, montant_paye, preuve_url, preuve_type, request_id } = await req.json();

    if (!pass_offer_id || !montant_paye || !preuve_url) {
      return Response.json({ success: false, error: 'Champs manquants: pass_offer_id, montant_paye, preuve_url' }, { status: 400 });
    }

    // Récupérer le livreur depuis l'email utilisateur
    const livreurs = await base44.asServiceRole.entities.Livreur.filter({ user_email: user.email }).catch(() => []);
    if (!livreurs || livreurs.length === 0) {
      return Response.json({ success: false, error: 'Aucun profil livreur trouvé' }, { status: 404 });
    }
    const livreur = livreurs[0];
    if (!livreur.country_code) {
      return Response.json({ success: false, error: 'Code pays manquant sur le profil livreur' }, { status: 400 });
    }

    // Récupérer le PassOffer
    const passOffer = await base44.asServiceRole.entities.PassOffer.get(pass_offer_id).catch(() => null);
    if (!passOffer) {
      return Response.json({ success: false, error: 'Pass introuvable' }, { status: 404 });
    }
    if (!passOffer.actif) {
      return Response.json({ success: false, error: 'Ce Pass n\'est plus disponible' }, { status: 400 });
    }
    if (passOffer.country_code !== livreur.country_code) {
      return Response.json({ success: false, error: 'Ce Pass n\'est pas disponible dans votre pays' }, { status: 403 });
    }

    // Idempotence: vérifier request_id
    if (request_id) {
      const existing = await base44.asServiceRole.entities.PassAchat.filter({ request_id }, '-created_date', 1).catch(() => []);
      if (existing?.[0]) {
        return Response.json({ success: true, achat: existing[0], duplicate: true });
      }
    }

    // Créer l'achat en attente
    const now = new Date().toISOString();
    const achat = await base44.asServiceRole.entities.PassAchat.create({
      livreur_id: livreur.id,
      livreur_user_email: user.email,
      pass_offer_id: passOffer.id,
      pass_offer_nom: passOffer.nom,
      duree_jours: passOffer.duree_jours,
      montant_paye: Number(montant_paye),
      devise: passOffer.devise || 'FCFA',
      preuve_url,
      preuve_type: preuve_type || 'image',
      request_id: request_id || crypto.randomUUID(),
      country_code: livreur.country_code,
      statut: 'en_attente',
      date_demande: now,
    });

    return Response.json({ success: true, achat });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}