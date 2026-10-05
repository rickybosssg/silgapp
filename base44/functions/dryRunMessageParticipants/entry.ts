import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// ═══════════════════════════════════════════════════════════════════════════
// DRY-RUN — Audit des participant_user_ids des messages historiques liés à
// une CourseExterne. AUCUNE écriture. Retourne des statistiques uniquement.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

    // 1. Récupérer tous les messages secured avec course_id
    const messages = await base44.asServiceRole.entities.Message.filter({
      security_status: 'secured',
    });

    const courseMessages = messages.filter(m => m.course_id);

    let analysed = 0;
    let alreadyCorrect = 0;
    let missingExpediteur = 0;
    let missingDestinataire = 0;
    let missingLivreur = 0;
    let unresolved = 0;

    const courseCache = new Map();

    for (const msg of courseMessages) {
      analysed++;

      let course = courseCache.get(msg.course_id);
      if (!course) {
        try {
          course = await base44.asServiceRole.entities.CourseExterne.get(msg.course_id);
          courseCache.set(msg.course_id, course);
        } catch {
          unresolved++;
          continue;
        }
      }
      if (!course) {
        unresolved++;
        continue;
      }

      const msgParticipants = new Set(msg.participant_user_ids || []);
      let allPresent = true;

      // Vérifier expéditeur
      if (course.expediteur_client_id) {
        let client = courseCache.get(`client_${course.expediteur_client_id}`);
        if (!client) {
          client = await base44.asServiceRole.entities.ClientExterne.get(course.expediteur_client_id).catch(() => null);
          courseCache.set(`client_${course.expediteur_client_id}`, client);
        }
        if (client?.user_email) {
          const users = await base44.asServiceRole.entities.User.filter({ email: client.user_email });
          if (users?.[0]?.id && !msgParticipants.has(users[0].id)) {
            missingExpediteur++;
            allPresent = false;
          }
        }
      }

      // Vérifier destinataire
      if (course.destinataire_client_id) {
        let client = courseCache.get(`client_${course.destinataire_client_id}`);
        if (!client) {
          client = await base44.asServiceRole.entities.ClientExterne.get(course.destinataire_client_id).catch(() => null);
          courseCache.set(`client_${course.destinataire_client_id}`, client);
        }
        if (client?.user_email) {
          const users = await base44.asServiceRole.entities.User.filter({ email: client.user_email });
          if (users?.[0]?.id && !msgParticipants.has(users[0].id)) {
            missingDestinataire++;
            allPresent = false;
          }
        }
      }

      // Vérifier livreur
      if (course.livreur_id) {
        let livreur = courseCache.get(`livreur_${course.livreur_id}`);
        if (!livreur) {
          livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id).catch(() => null);
          courseCache.set(`livreur_${course.livreur_id}`, livreur);
        }
        if (livreur?.user_email) {
          const users = await base44.asServiceRole.entities.User.filter({ email: livreur.user_email });
          if (users?.[0]?.id && !msgParticipants.has(users[0].id)) {
            missingLivreur++;
            allPresent = false;
          }
        }
      }

      if (allPresent) alreadyCorrect++;
    }

    return Response.json({
      status: 'dry-run',
      no_writes: true,
      messages_analysed: analysed,
      already_correct: alreadyCorrect,
      missing_expediteur: missingExpediteur,
      missing_destinataire: missingDestinataire,
      missing_livreur: missingLivreur,
      unresolved: unresolved,
      note: 'Aucune ecriture effectuee. En attente d autorisation pour le backfill.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}