import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Fonction ADMIN pour synchroniser tous les codes livreurs
 * Doit être appelée uniquement par un admin
 */
Deno.serve(async (req) => {
  try {
    console.log('[syncLivreursLocaux] ========== SYNC START ==========');
    console.log('[syncLivreursLocaux] Request headers:', JSON.stringify(Object.fromEntries(req.headers)));
    
    const base44 = createClientFromRequest(req);
    
    // Vérifier que c'est un admin
    console.log('[syncLivreursLocaux] Checking admin auth...');
    const user = await base44.auth.me();
    console.log('[syncLivreursLocaux] User:', user ? user.full_name : 'NULL', 'Role:', user?.role);
    
    if (!user || user.role !== 'admin') {
      console.error('[syncLivreursLocaux] ❌ Not admin or not logged in');
      return Response.json({ 
        success: false, 
        error: 'Accès réservé aux administrateurs' 
      }, { status: 403 });
    }
    
    console.log('[syncLivreursLocaux] ✅ Admin authenticated:', user.full_name);
    
    // Récupérer TOUS les livreurs avec service role
    console.log('[syncLivreursLocaux] Fetching all livreurs...');
    const allLivreurs = await base44.asServiceRole.entities.Livreur.list('-created_date', 1000);
    
    console.log('[syncLivreursLocaux] Total livreurs:', allLivreurs.length);
    
    // Filtrer les actifs avec code
    console.log('[syncLivreursLocaux] Filtering active livreurs with codes...');
    const activeLivreurs = allLivreurs
      .filter(livreur => {
        const hasCode = !!livreur.code_identification;
        const isActive = livreur.actif === true;
        const isValidated = livreur.validation === 'valide';
        
        if (!hasCode) {
          console.log('[syncLivreursLocaux] Skipping (no code):', livreur.nom, livreur.prenom);
        }
        if (!isActive) {
          console.log('[syncLivreursLocaux] Skipping (inactive):', livreur.nom, livreur.prenom);
        }
        if (!isValidated) {
          console.log('[syncLivreursLocaux] Skipping (not validated):', livreur.nom, livreur.prenom);
        }
        
        return isActive && isValidated && hasCode;
      })
      .map(livreur => {
        const code = String(livreur.code_identification || '').toUpperCase().trim();
        return {
          livreur_id: livreur.id,
          nom: String(livreur.nom || ''),
          prenom: String(livreur.prenom || ''),
          telephone: String(livreur.telephone || ''),
          code_identification: code,
          quartier: livreur.quartier || '',
          vehicule: livreur.vehicule || 'moto',
          user_email: livreur.user_email || '',
          validation: livreur.validation,
          actif: livreur.actif
        };
      });
    
    console.log('[syncLivreursLocaux] Active livreurs with codes:', activeLivreurs.length);
    
    // Vérifier les données
    activeLivreurs.forEach((livreur, idx) => {
      console.log(`[syncLivreursLocaux] Livreur ${idx + 1}: ${livreur.nom} ${livreur.prenom} - Code: ${livreur.code_identification}`);
    });
    
    const cacheData = {
      livreurs: activeLivreurs,
      synced_at: new Date().toISOString(),
      synced_by: user.full_name,
      count: activeLivreurs.length
    };
    
    console.log('[syncLivreursLocaux] ========== SYNC SUCCESS ==========');
    console.log('[syncLivreursLocaux] Returning', activeLivreurs.length, 'livreurs');
    
    return Response.json({
      success: true,
      count: activeLivreurs.length,
      livreurs: activeLivreurs,
      synced_at: cacheData.synced_at,
      synced_by: cacheData.synced_by
    });
  } catch (error) {
    console.error('[syncLivreursLocaux] ❌ ERROR:', error.message);
    console.error('[syncLivreursLocaux] Stack:', error.stack);
    console.error('[syncLivreursLocaux] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    return Response.json({ 
      success: false, 
      error: error.message,
      details: 'Erreur de synchronisation. Vérifiez les logs serveur.'
    }, { status: 500 });
  }
});