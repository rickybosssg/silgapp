import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // ── Compter les notifications non lues de CET utilisateur uniquement ──
    // On filtre par destinataire_email pour ne JAMAIS modifier les notifications
    // d'un autre utilisateur. Le count évite de charger toutes les entités en
    // mémoire (N+1 éliminé).
    const unread = await base44.asServiceRole.entities.Notification.filter({
      lue: false,
      destinataire_email: user.email,
    }, '-created_date', 1);

    const count = unread.length;

    if (count === 0) {
      return Response.json({
        success: true,
        marquees: 0,
        message: 'Aucune notification non lue',
      });
    }

    // ── Opération bulk unique : 1 appel au lieu de N ──
    // Remplace la boucle N+1 (200 updates individuels → 1 updateMany).
    // Filtre double : lue=false ET destinataire_email=user.email pour
    // garantir l'isolation par utilisateur.
    await base44.asServiceRole.entities.Notification.updateMany(
      { lue: false, destinataire_email: user.email },
      { $set: { lue: true } }
    );

    console.log(`[MARQUER LUES] ${count} notifications marquées comme lues pour ${user.email}`);

    return Response.json({
      success: true,
      marquees: count,
      message: `${count} notifications marquées comme lues`,
    });
  } catch (error) {
    console.error('[MARQUER LUES] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});