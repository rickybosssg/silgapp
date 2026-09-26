import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { ensureCodePromo } from '../../shared/codePromoUtils.ts';

// ═══════════════════════════════════════════════════════════════════════════
// ensureLivreurCodePromo — Garantit qu'un livreur authentifié possède
// son CodePromo personnel. Idempotent : si le code existe déjà, il est
// conservé tel quel. Aucun doublon possible.
//
// SÉCURITÉ :
//   1. Authentification obligatoire (base44.auth.me()).
//   2. Le Livreur est retrouvé via user_email (résolu backend, jamais frontend).
//   3. Aucune confiance dans un proprietaire_livreur_id envoyé par le frontend.
//   4. Appelle ensureCodePromo (idempotent, unicité par proprietaire_livreur_id).
//
// Utilisé par :
//   - LivreurRegistrationForm (inscription self-service)
//   - Tout parcours frontend post-création de livreur
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // Retrouver le profil Livreur via user_email (résolu backend)
    const normalizedEmail = String(user.email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return Response.json({ error: 'Email utilisateur manquant' }, { status: 400 });
    }

    const livreurs = await base44.asServiceRole.entities.Livreur.filter({
      user_email: normalizedEmail,
    });

    if (!livreurs || livreurs.length === 0) {
      return Response.json({ error: 'Aucun profil livreur trouvé' }, { status: 404 });
    }

    const livreur = livreurs[0];

    // Garantir le CodePromo (idempotent)
    const result = await ensureCodePromo(base44.asServiceRole, {
      proprietaire_type: 'livreur',
      proprietaire_id: livreur.id,
      proprietaire_nom: livreur.nom || livreur.prenom || normalizedEmail,
      proprietaire_email: normalizedEmail,
      country_code: livreur.country_code || 'BF',
    });

    return Response.json({
      success: true,
      code: result.code,
      code_promo_id: result.code_promo_id,
      created: result.created,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}