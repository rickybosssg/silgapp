import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { attributeConversions } from '../../shared/reactivationEngine.ts';

// ═══════════════════════════════════════════════════════════════════════════
// attributeConversions — Attribution automatique des courses aux campagnes
//
// Appelée par automation (toutes les heures) ou manuellement par l'admin.
// Traite uniquement les campagnes "completed" encore dans leur fenêtre d'attribution.
// Idempotente : ne re-traite pas les recipients déjà convertis.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // ── Auth : accepter les appels service-role (Workflow Base44) ET les appels admin manuels ──
    // Le Workflow "Attribution automatique des conversions réactivation" appelle cette fonction
    // toutes les heures sans contexte utilisateur. On utilise le même pattern que syncCrmOnLivraison.
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Admin requis' }, { status: 403 });
      }
    } catch {
      // Appel depuis un Workflow Base44 (service role) — pas de contexte utilisateur
    }

    const result = await attributeConversions(base44);

    return Response.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[attributeConversions] Error:', error);
    return Response.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}