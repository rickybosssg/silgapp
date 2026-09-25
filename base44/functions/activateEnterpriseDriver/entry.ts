import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { normalizeEnterpriseId } from '../../shared/enterpriseFinance.ts';

// ═══════════════════════════════════════════════════════════════════════════
// activateEnterpriseDriver — Active le compte Livreur Enterprise après
// que l'utilisateur ait accepté son invitation email et se soit connecté.
//
// RÉSOUT : User.enterprise_id depuis le Livreur (backend uniquement).
// Le User est créé par Base44 après acceptation de l'invitation email.
// Cette fonction synchronise User.enterprise_id = Livreur.enterprise_id.
//
// SÉCURITÉ : enterprise_id résolu depuis le Livreur (backend), jamais frontend.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    // Skip if already has enterprise_id and silgapp_role=livreur
    if (user.enterprise_id && user.silgapp_role === 'livreur') {
      return Response.json({ success: true, activated: false, reason: 'already_activated' });
    }

    // Find Livreur by user_email (normalized comparison)
    const livreurs = await base44.asServiceRole.entities.Livreur.filter({
      user_email: String(user.email || '').trim().toLowerCase(),
    });

    if (!livreurs || livreurs.length === 0) {
      return Response.json({ success: true, activated: false, reason: 'no_livreur' });
    }

    const livreur = livreurs[0];
    const livreurEntId = normalizeEnterpriseId(livreur.enterprise_id);

    // Only activate for Enterprise drivers (not public)
    if (!livreurEntId) {
      return Response.json({ success: true, activated: false, reason: 'public_livreur' });
    }

    // Set User.enterprise_id and silgapp_role from Livreur (backend resolved)
    await base44.asServiceRole.entities.User.update(user.id, {
      enterprise_id: livreur.enterprise_id,
      silgapp_role: 'livreur',
    });

    return Response.json({
      success: true,
      activated: true,
      enterprise_id: livreur.enterprise_id,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}