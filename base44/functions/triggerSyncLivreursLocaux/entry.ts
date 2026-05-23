import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Wrapper pour appeler syncLivreursLocaux depuis le frontend
 * Cette fonction vérifie l'authentification et délègue à la fonction principale
 */
Deno.serve(async (req) => {
  try {
    console.log('[triggerSyncLivreursLocaux] ========== TRIGGER START ==========');
    
    const base44 = createClientFromRequest(req);
    
    // Vérifier l'authentification
    const user = await base44.auth.me();
    console.log('[triggerSyncLivreursLocaux] User:', user?.full_name, 'Role:', user?.role);
    
    if (!user || user.role !== 'admin') {
      console.error('[triggerSyncLivreursLocaux] ❌ Not admin or not logged in');
      return Response.json({ 
        success: false, 
        error: 'Accès réservé aux administrateurs' 
      }, { status: 403 });
    }
    
    // Appeler la fonction principale via le SDK service role
    console.log('[triggerSyncLivreursLocaux] Calling syncLivreursLocaux...');
    const result = await base44.asServiceRole.functions.invoke('syncLivreursLocaux', {});
    
    console.log('[triggerSyncLivreursLocaux] Result:', result);
    console.log('[triggerSyncLivreursLocaux] ========== TRIGGER SUCCESS ==========');
    
    return Response.json(result);
  } catch (error) {
    console.error('[triggerSyncLivreursLocaux] ❌ ERROR:', error.message);
    console.error('[triggerSyncLivreursLocaux] Stack:', error.stack);
    
    return Response.json({ 
      success: false, 
      error: error.message,
      details: 'Erreur lors de la synchronisation'
    }, { status: 500 });
  }
});