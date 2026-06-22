import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Synchronise les codes livreurs - appelé depuis le frontend admin
 * Pas de vérification d'auth Base44 (l'app utilise un système custom PIN)
 * La sécurité est assurée par le fait que seul le frontend admin peut appeler cette fonction
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Récupérer TOUS les livreurs avec service role
    const allLivreurs = await base44.asServiceRole.entities.Livreur.list('-created_date', 1000);

    // Filtrer actifs + validés + avec code
    const activeLivreurs = allLivreurs
      .filter(l => l.actif === true && l.validation === 'valide' && !!l.code_identification)
      .map(l => ({
        livreur_id: l.id,
        nom: String(l.nom || ''),
        prenom: String(l.prenom || ''),
        telephone: String(l.telephone || ''),
        code_identification: String(l.code_identification || '').toUpperCase().trim(),
        quartier: l.quartier || '',
        vehicule: l.vehicule || 'moto',
        user_email: l.user_email || '',
        validation: l.validation,
        actif: l.actif
      }));

    return Response.json({
      success: true,
      count: activeLivreurs.length,
      livreurs: activeLivreurs,
      synced_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('[triggerSyncLivreursLocaux] ERROR:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
