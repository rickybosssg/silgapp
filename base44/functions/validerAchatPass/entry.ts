import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ═══════════════════════════════════════════════════════════════════════════
// VALIDER ACHAT PASS — Admin valide un achat de Pass Zéro Commission
// ═══════════════════════════════════════════════════════════════════════════
//
// RÈGLE FINANCIÈRE ABSOLUE :
//   La validation d'un Pass NE RÉDUIT JAMAIS montant_du_silga.
//   Le Pass est un avantage séparé du dû SILGAPP existant.
//   → Ne marque pas d'anciennes courses comme paye
//   → Ne consomme pas credit_surplus
//   → Active uniquement le Pass (debut_at = now, expiration_at = now + duree_jours)
//
// Idempotence : CAS atomique sur statut en_attente → valide.
//   Une double validation ne crée jamais deux Pass actifs.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ success: false, error: 'Admin uniquement' }, { status: 403 });

    const { achat_id, action } = await req.json();
    if (!achat_id) return Response.json({ success: false, error: 'achat_id requis' }, { status: 400 });

    const achat = await base44.asServiceRole.entities.PassAchat.get(achat_id);
    if (!achat) return Response.json({ success: false, error: 'Achat introuvable' }, { status: 404 });

    // ── REFUS — CAS atomique ──
    if (action === 'refuser') {
      const refuseClaim = await base44.asServiceRole.entities.PassAchat.updateMany(
        { id: achat_id, statut: 'en_attente' },
        { $set: { statut: 'refuse', refuse_par: user.email, refuse_at: new Date().toISOString() } }
      );
      if (!refuseClaim || refuseClaim.updated !== 1) {
        return Response.json({ success: false, error: 'Déjà traité' }, { status: 409 });
      }

      // Push notification de refus
      try {
        const livreur = await base44.asServiceRole.entities.Livreur.get(achat.livreur_id).catch(() => null);
        if (livreur?.user_email) {
          await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
            destinataire_email: livreur.user_email,
            livreur_id: livreur.id,
            titre: 'Pass refusé',
            message: `Votre achat de Pass "${achat.pass_offer_nom}" n'a pas pu être validé. Contactez SILGAPP.`,
            type: 'generic',
          });
        }
      } catch (_) {}

      return Response.json({ success: true, statut: 'refuse' });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ACCEPTATION (validation)
    // ═══════════════════════════════════════════════════════════════════════

    // CAS atomique : en_attente → valide
    if (achat.statut === 'valide') {
      return Response.json({ success: false, error: 'Déjà validé' }, { status: 409 });
    }
    if (achat.statut !== 'en_attente') {
      return Response.json({ success: false, error: 'Statut invalide' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // CAS atomique pour empêcher la double validation
    const claimResult = await base44.asServiceRole.entities.PassAchat.updateMany(
      { id: achat_id, statut: 'en_attente' },
      { $set: { statut: 'valide', valide_par: user.email, valide_at: now } }
    );
    if (!claimResult || claimResult.updated !== 1) {
      return Response.json({ success: false, error: 'Déjà traité' }, { status: 409 });
    }

    // Activer le Pass : debut_at = now, expiration_at = now + duree_jours
    const dureeJours = Number(achat.duree_jours) || 1;
    const expirationDate = new Date(now);
    expirationDate.setDate(expirationDate.getDate() + dureeJours);
    const expirationAt = expirationDate.toISOString();

    await base44.asServiceRole.entities.PassAchat.update(achat_id, {
      debut_at: now,
      expiration_at: expirationAt,
    });

    // Push notification d'activation
    try {
      const livreur = await base44.asServiceRole.entities.Livreur.get(achat.livreur_id).catch(() => null);
      if (livreur?.user_email) {
        const dateFin = new Date(expirationAt).toLocaleString('fr-FR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });
        await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
          destinataire_email: livreur.user_email,
          livreur_id: livreur.id,
          titre: '🎫 PASS ZÉRO COMMISSION ACTIVÉ',
          message: `Votre Pass "${achat.pass_offer_nom}" est actif. Profitez de 0% de commission jusqu'au ${dateFin}.`,
          type: 'generic',
        });
      }
    } catch (_) {}

    return Response.json({
      success: true,
      statut: 'valide',
      debut_at: now,
      expiration_at: expirationAt,
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}