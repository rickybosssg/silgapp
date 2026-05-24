import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { code, livreur_id } = body;

    // Recherche par ID (pour restauration de session)
    if (livreur_id) {
      const livreurs = await base44.asServiceRole.entities.Livreur.filter({ id: livreur_id });
      const livreur = livreurs?.[0] || null;

      if (!livreur) {
        return Response.json({ success: false, error: 'Livreur introuvable' }, { status: 404 });
      }

      return Response.json({
        success: true,
        livreur: {
          id: livreur.id,
          nom: livreur.nom,
          prenom: livreur.prenom,
          code_identification: livreur.code_identification,
          validation: livreur.validation,
          actif: livreur.actif,
          user_email: livreur.user_email,
          quartier: livreur.quartier,
          telephone: livreur.telephone,
          vehicule: livreur.vehicule,
        }
      });
    }

    // Recherche par code d'identification
    if (!code || typeof code !== 'string') {
      return Response.json({ success: false, error: 'Code ou livreur_id requis' }, { status: 400 });
    }

    const normalizedCode = code.trim().toUpperCase();
    console.log('[findLivreurByCode] Searching for code:', normalizedCode);

    const livreurs = await base44.asServiceRole.entities.Livreur.filter({ code_identification: normalizedCode });
    const livreur = livreurs?.find(l => l.code_identification?.toUpperCase() === normalizedCode) || null;

    if (!livreur) {
      return Response.json({ success: false, error: 'Code incorrect' }, { status: 404 });
    }

    console.log('[findLivreurByCode] ✅ Found:', livreur.nom, livreur.prenom);

    return Response.json({
      success: true,
      livreur: {
        id: livreur.id,
        nom: livreur.nom,
        prenom: livreur.prenom,
        code_identification: livreur.code_identification,
        validation: livreur.validation,
        actif: livreur.actif,
        user_email: livreur.user_email,
        quartier: livreur.quartier,
        telephone: livreur.telephone,
        vehicule: livreur.vehicule,
      }
    });

  } catch (error) {
    console.error('[findLivreurByCode] Error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});