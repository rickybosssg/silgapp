import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Vérifie si une conversation est autorisée selon les règles métier :
 * - client↔client : OK
 * - livreur↔livreur : OK
 * - client↔livreur : UNIQUEMENT si une course active les relie
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { participants } = await req.json();
    if (!participants || !Array.isArray(participants) || participants.length < 2) {
      return Response.json({ autorise: false, raison: 'Participants invalides' }, { status: 400 });
    }

    // Identifier les types
    const types = participants.map(p => p.type);
    const ids = participants.map(p => p.id);

    const hasClient = types.includes('client');
    const hasLivreur = types.includes('livreur');
    const hasPartenaire = types.includes('partenaire');

    // client↔partenaire : toujours autorisé (renseignements ou cadre d'une commande)
    if (hasClient && hasPartenaire && !hasLivreur) {
      return Response.json({ autorise: true });
    }

    // Même type → toujours autorisé
    if (!(hasClient && hasLivreur)) {
      return Response.json({ autorise: true });
    }

    // Client↔Livreur → vérifier qu'une course active existe
    const clientId = participants.find(p => p.type === 'client')?.id;
    const livreurId = participants.find(p => p.type === 'livreur')?.id;

    if (!clientId || !livreurId) {
      return Response.json({ autorise: false, raison: 'IDs manquants' });
    }

    // Chercher toutes les courses actives (tous statuts sauf livree/annulee)
    const courses = await base44.asServiceRole.entities.CourseExterne.filter({}, '-created_date', 200);
    const active = (courses || []).filter(c => !['livree', 'annulee'].includes(c.statut));

    const lienExiste = active.some(c => {
      const clientMatch = c.expediteur_client_id === clientId || c.destinataire_client_id === clientId;
      const livreurMatch = c.livreur_id === livreurId;
      return clientMatch && livreurMatch;
    });

    if (!lienExiste) {
      return Response.json({
        autorise: false,
        raison: 'Aucune course active ne relie ce client et ce livreur',
      });
    }

    return Response.json({ autorise: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});