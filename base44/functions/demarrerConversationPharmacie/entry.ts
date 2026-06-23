import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Démarre ou récupère une conversation entre un client et une pharmacie.
 * - Authentifie le client
 * - Vérifie la pharmacie (actif)
 * - Cherche une conversation existante entre les deux
 * - Crée la conversation si inexistante
 * - Retourne l'ID de la conversation
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { pharmacie_id } = body;
    if (!pharmacie_id) return Response.json({ error: 'pharmacie_id requis' }, { status: 400 });

    const asService = base44.asServiceRole;

    // ── Récupérer la pharmacie ──
    const pharmacie = await asService.entities.Pharmacie.get(pharmacie_id);
    if (!pharmacie) return Response.json({ error: 'Pharmacie introuvable' }, { status: 404 });
    if (!pharmacie.actif) return Response.json({ error: 'Pharmacie inactive' }, { status: 400 });

    // ── Récupérer le profil client ──
    const clients = await asService.entities.ClientExterne.filter({ user_email: user.email });
    const client = clients?.[0];
    if (!client) return Response.json({ error: 'Profil client introuvable' }, { status: 404 });

    const clientName = `${client.prenom || ''} ${client.nom || ''}`.trim() || client.telephone || 'Client';

    // ── Chercher une conversation existante ──
    const allConvs = await asService.entities.Conversation.list('-created_date', 200);
    const existing = (allConvs || []).find(c => {
      try {
        const parts = JSON.parse(c.participants || '[]');
        const hasPharmacie = parts.some(p => p.type === 'partenaire' && p.id === pharmacie_id);
        const hasClient = parts.some(p => p.type === 'client' && p.id === client.id);
        return hasPharmacie && hasClient;
      } catch { return false; }
    });

    if (existing) {
      return Response.json({ success: true, conversation_id: existing.id });
    }

    // ── Créer la conversation ──
    const participants = JSON.stringify([
      { type: 'partenaire', id: pharmacie_id, name: pharmacie.nom || 'Pharmacie' },
      { type: 'client', id: client.id, name: clientName },
    ]);

    const conv = await asService.entities.Conversation.create({
      participants,
      title: `${pharmacie.nom || 'Pharmacie'} · ${clientName}`,
      group_type: 'direct',
      last_message: '',
    });

    console.log(`[demarrerConversationPharmacie] ✅ Conversation créée: ${conv.id}`);

    // ── Notification push à la pharmacie ──
    try {
      await base44.functions.invoke('envoiNotificationPush', {
        titre: 'Nouveau message client',
        message: `${clientName} a démarré une conversation avec votre pharmacie.`,
        type: 'nouveau_message_pharmacie',
        destinataire_email: pharmacie.user_email,
        user_type: 'partenaire',
      });
    } catch (notifErr) {
      console.error(`[demarrerConversationPharmacie] ⚠️ Erreur notification: ${notifErr.message}`);
    }

    return Response.json({ success: true, conversation_id: conv.id });
  } catch (error) {
    console.error('[demarrerConversationPharmacie] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});