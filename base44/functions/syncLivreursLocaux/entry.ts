import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Fonction ADMIN pour synchroniser tous les codes livreurs
 * Doit être appelée uniquement par un admin
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Vérifier que c'est un admin
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ 
        success: false, 
        error: 'Accès réservé aux administrateurs' 
      }, { status: 403 });
    }
    
    console.log('[syncLivreursLocaux] Admin', user.full_name, 'requested sync');
    
    // Récupérer TOUS les livreurs
    const allLivreurs = await base44.asServiceRole.entities.Livreur.list('-created_date', 1000);
    
    console.log('[syncLivreursLocaux] Total livreurs:', allLivreurs.length);
    
    // Filtrer les actifs avec code
    const activeLivreurs = allLivreurs
      .filter(livreur => 
        livreur.actif === true && 
        livreur.validation === 'valide' && 
        livreur.code_identification
      )
      .map(livreur => ({
        livreur_id: livreur.id,
        nom: livreur.nom,
        prenom: livreur.prenom,
        telephone: livreur.telephone,
        code_identification: livreur.code_identification.toUpperCase().trim(),
        quartier: livreur.quartier,
        vehicule: livreur.vehicule,
        user_email: livreur.user_email,
        validation: livreur.validation,
        actif: livreur.actif
      }));
    
    console.log('[syncLivreursLocaux] Active livreurs with codes:', activeLivreurs.length);
    
    // Mettre à jour un record de configuration pour que le frontend puisse le lire
    // ou simplement retourner les données
    const cacheData = {
      livreurs: activeLivreurs,
      synced_at: new Date().toISOString(),
      synced_by: user.full_name,
      count: activeLivreurs.length
    };
    
    // Optionnel: stocker dans une entité de configuration
    // await base44.asServiceRole.entities.LivreursCache.create(cacheData);
    
    return Response.json({
      success: true,
      count: activeLivreurs.length,
      livreurs: activeLivreurs,
      synced_at: cacheData.synced_at
    });
  } catch (error) {
    console.error('[syncLivreursLocaux] Error:', error.message);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});