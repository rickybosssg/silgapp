import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// ═══════════════════════════════════════════════════════════════════════════
// GET AVAILABLE COURIERS COUNT — Retourne UNIQUEMENT le nombre de livreurs
// disponibles dans le pays du client. Aucune donnée privée n'est exposée.
// ═══════════════════════════════════════════════════════════════════════════
//
// Sécurité :
//   - Utilisateur authentifié obligatoire
//   - Résout le country_code du client via ClientExterne
//   - asServiceRole pour bypass RLS Livreur (lecture seule)
//   - Retourne UNIQUEMENT le count — aucun email, téléphone, GPS, finances
//
// Retour :
//   { count: number, country_code: string }
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    // 1. Résoudre le country_code du client
    let countryCode = null;
    try {
      const body = await req.json();
      countryCode = body?.country_code || null;
    } catch {
      // Pas de body — on résout via ClientExterne
    }

    if (!countryCode) {
      const clients = await base44.asServiceRole.entities.ClientExterne.filter({
        user_email: user.email,
      });
      countryCode = clients?.[0]?.country_code || null;
    }

    if (!countryCode) {
      return Response.json({ count: 0, country_code: null });
    }

    // 2. Compter les livreurs disponibles (asServiceRole = bypass RLS)
    const filter = {
      type_livreur: 'externe',
      statut: 'disponible',
      actif: true,
      validation: 'valide',
      country_code: countryCode,
    };
    const livreurs = await base44.asServiceRole.entities.Livreur.filter(filter);

    // 3. Retourner UNIQUEMENT le count
    return Response.json({
      count: livreurs?.length || 0,
      country_code: countryCode,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}