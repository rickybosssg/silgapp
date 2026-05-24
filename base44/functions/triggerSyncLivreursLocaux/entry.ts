import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Synchronise les codes livreurs - appelé depuis le frontend admin
 * Fait directement le travail au lieu de re-appeler syncLivreursLocaux (évite le problème d'auth en cascade)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ success: false, error: 'Accès réservé aux administrateurs' }, { status: 403 });
    }

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
      synced_at: new Date().toISOString(),
      synced_by: user.full_name
    });
  } catch (error) {
    console.error('[triggerSyncLivreursLocaux] ERROR:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});