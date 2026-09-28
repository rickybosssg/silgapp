import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';

// ═══════════════════════════════════════════════════════════════════════════
// activatePendingEnterpriseAdmin — Active le compte Admin Entreprise après
// que l'utilisateur ait accepté son invitation et se soit connecté.
//
// RÉSOUT LE PROBLÈME : base44.users.inviteUser() crée le User seulement
// après acceptation de l'invitation. Le PendingEnterpriseAdmin stocke
// l'assignment enterprise_id + silgapp_role en attendant.
//
// SÉCURITÉ : enterprise_id est résolu côté backend depuis le PendingEnterpriseAdmin.
// L'utilisateur ne peut PAS fournir son propre enterprise_id.
//
// [CORRECTION 12] Améliorations :
// - Normalisation email (trim + lowercase) pour éviter les mismatch de casse/espaces
// - Idempotence : si User déjà rattaché (silgapp_role + enterprise_id corrects),
//   on marque juste le pending comme activated sans re-updater le User
// - Gestion du cas "compte existant avant invitation" : fonctionne aussi si
//   le User existait déjà avant la création du PendingEnterpriseAdmin
// - Erreurs retournées (non avalées) pour permettre au AuthGate de logger
// ═══════════════════════════════════════════════════════════════════════════

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const normalizedUserEmail = normalizeEmail(user.email);

    // Vérifier s'il y a un pending pour cet email (normalisé)
    const pendings = await base44.asServiceRole.entities.PendingEnterpriseAdmin.filter({
      email: normalizedUserEmail,
      status: 'pending',
    });

    if (!pendings || pendings.length === 0) {
      return Response.json({ success: true, activated: false, reason: 'no_pending' });
    }

    const pending = pendings[0];

    // ── Idempotence : si le User est déjà rattaché à la bonne entreprise ──
    // On marque juste le pending comme activated sans re-updater le User.
    const userAlreadyActivated =
      user.silgapp_role === 'admin_entreprise' &&
      user.enterprise_id === pending.enterprise_id;

    if (!userAlreadyActivated) {
      // Appliquer l'assignment sur le User
      await base44.asServiceRole.entities.User.update(user.id, {
        enterprise_id: pending.enterprise_id,
        silgapp_role: 'admin_entreprise',
      });
    }

    // Marquer le pending comme activé (même si déjà fait — idempotent)
    if (pending.status !== 'activated') {
      await base44.asServiceRole.entities.PendingEnterpriseAdmin.update(pending.id, {
        status: 'activated',
        activated_at: new Date().toISOString(),
      });
    }

    // Incrémenter le compteur d'admins de l'entreprise (une seule fois par activation)
    if (!userAlreadyActivated) {
      const enterprises = await base44.asServiceRole.entities.Enterprise.filter({
        enterprise_financier_id: pending.enterprise_id,
      });
      if (enterprises?.[0]) {
        const ent = enterprises[0];
        await base44.asServiceRole.entities.Enterprise.update(ent.id, {
          nb_admins: Number(ent.nb_admins || 0) + 1,
        });
      }
    }

    return Response.json({
      success: true,
      activated: true,
      enterprise_id: pending.enterprise_id,
      enterprise_name: pending.enterprise_name,
      idempotent: userAlreadyActivated,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}