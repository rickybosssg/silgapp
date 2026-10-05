// ═══════════════════════════════════════════════════════════════════════════
// Helper idempotent pour la création du message système contenant les codes
// de récupération et de livraison d'une course admin/VENUS.
//
// Règles :
//   1. Idempotence au niveau COURSE : course-codes-{courseId} (sans livreurId).
//      Un seul message de codes par course, quel que soit le livreur (création, dispatch, redispatch).
//   2. Vérifie l'existence avant création (idempotence) — backward compatible avec les anciennes clés.
//   3. Actualise les participant_user_ids à chaque appel (le nouveau livreur accède au message existant).
//   4. Retry unique avec re-vérification avant retry (anti-doublon).
//   5. Échec définitif → console.error uniquement. N'échoue jamais l'acceptation.
//   6. Utilise resolveCourseParticipantUserIds (résolution officielle existante).
//   7. Contient systématiquement les deux codes + prix si disponible.
// ═══════════════════════════════════════════════════════════════════════════

import { resolveCourseParticipantUserIds } from './conversationSecurity.ts';

const RETRY_DELAY_MS = 500;
const IDEMPOTENCY_PREFIX = 'course-codes';

/**
 * Construit le client_message_id déterministe pour le message des codes.
 * Format : course-codes-{courseId}  (idempotence au niveau COURSE)
 *
 * Le livreurId est volontairement ignoré : un seul message de codes par course,
 * quelle que soit l'évolution du livreur (création, dispatch, redispatch).
 * Les participants sont actualisés à chaque appel via ensureCourseCodeMessage.
 */
export function buildCodeMessageIdempotencyKey(courseId: string, _livreurId?: string): string {
  return `${IDEMPOTENCY_PREFIX}-${courseId}`;
}

/**
 * Construit le contenu standardisé du message des codes.
 * Inclut systématiquement les deux codes + prix si disponible.
 */
export function buildCodeMessageContent(
  pickupPIN: string,
  deliveryPIN: string,
  prixProposeAdmin?: number | null,
  prixEstimate?: number | null,
  devise?: string,
  prixFinal?: number | null,
  prixProposeClient?: number | null
): string {
  const parts: string[] = [
    `🔑 Code de récupération : ${pickupPIN}`,
    `📦 Code de livraison : ${deliveryPIN}`,
  ];
  // Priorité : prix final (livraison) > prix admin > prix client > prix estimé
  if (prixFinal && Number(prixFinal) > 0) {
    parts.push(`💰 Prix de la course : ${Number(prixFinal).toLocaleString()} ${devise || 'FCFA'}`);
  } else if (prixProposeAdmin && Number(prixProposeAdmin) > 0) {
    parts.push(`💰 Prix de la course : ${Number(prixProposeAdmin).toLocaleString()} ${devise || 'FCFA'}`);
  } else if (prixProposeClient && Number(prixProposeClient) > 0) {
    parts.push(`💰 Prix de la course : ${Number(prixProposeClient).toLocaleString()} ${devise || 'FCFA'}`);
  } else if (prixEstimate && Number(prixEstimate) > 0) {
    parts.push(`💰 Prix estimé : ${Number(prixEstimate).toLocaleString()} ${devise || 'FCFA'}`);
  }
  return parts.join('\n');
}

async function findExistingMessage(base44: any, courseId: string): Promise<any[]> {
  try {
    const messages = await base44.asServiceRole.entities.Message.filter({
      course_id: courseId,
    });
    // Backward compatible : matche les nouvelles clés (course-codes-{courseId})
    // ET les anciennes (course-codes-{courseId}-creation, course-codes-{courseId}-{livreurId}).
    const prefix = `${IDEMPOTENCY_PREFIX}-${courseId}`;
    return (messages || []).filter((m: any) =>
      m.client_message_id && m.client_message_id.startsWith(prefix)
    );
  } catch {
    return [];
  }
}

async function attemptCreateMessage(
  base44: any,
  courseId: string,
  livreurId: string,
  messageContent: string,
  idempotencyKey: string,
  participantUserIds: string[],
  securityStatus: 'secured' | 'pending'
): Promise<void> {
  await base44.asServiceRole.entities.Message.create({
    course_id: courseId,
    sender_type: 'admin',
    sender_id: 'silgapp_system',
    sender_name: 'SILGAPP',
    message_type: 'text',
    content: messageContent,
    source: 'app',
    client_message_id: idempotencyKey,
    participant_user_ids: participantUserIds,
    security_status: securityStatus,
  });
}

/**
 * Garantit la création idempotente du message système contenant les codes
 * de récupération et de livraison pour une course admin/VENUS.
 *
 * Ne lève JAMAIS d'exception — un échec est loggé et l'acceptation continue.
 *
 * @returns { created: boolean, idempotent: boolean, error?: string }
 */
export async function ensureCourseCodeMessage(
  base44: any,
  course: any,
  livreurId: string | null | undefined,
  pickupPIN: string,
  deliveryPIN: string,
  logPrefix = '[CODE_MSG]'
): Promise<{ created: boolean; idempotent: boolean; error?: string }> {
  const courseId = course?.id;
  if (!courseId || !pickupPIN || !deliveryPIN) {
    console.error(`${logPrefix} Paramètres manquants — courseId=${courseId} livreurId=${livreurId} pickup=${pickupPIN} delivery=${deliveryPIN}`);
    return { created: false, idempotent: false, error: 'missing_params' };
  }

  const idempotencyKey = buildCodeMessageIdempotencyKey(courseId, livreurId || undefined);

  // 1. Vérifier si le message existe déjà (idempotence au niveau COURSE)
  const existing = await findExistingMessage(base44, courseId);
  if (existing.length > 0) {
    // Remplacer les participants par la liste fraîche : seul le livreur courant
    // (livreurId) + client + admins conservent l'accès. L'ancien livreur d'un
    // redispatch est automatiquement retiré — il ne peut plus consulter les PIN.
    try {
      const clientId = course.expediteur_client_id || course.destinataire_client_id;
      const freshParticipants = await resolveCourseParticipantUserIds(base44, livreurId || undefined, clientId);
      if (freshParticipants.length > 0) {
        await base44.asServiceRole.entities.Message.update(existing[0].id, {
          participant_user_ids: freshParticipants,
        });
        console.log(`${logPrefix} ✅ Participants remplacés pour course ${courseId} (${freshParticipants.length} autorisé(s))`);
      }
    } catch (err: any) {
      console.warn(`${logPrefix} Erreur mise à jour participants course ${courseId}: ${err?.message}`);
    }
    return { created: false, idempotent: true };
  }

  // 2. Construire le contenu standardisé (deux codes + prix)
  const messageContent = buildCodeMessageContent(
    pickupPIN,
    deliveryPIN,
    course.prix_propose_admin,
    course.prix_estimate,
    course.devise,
    course.prix_final,
    course.prix_propose_client
  );

  // 3. Résoudre les participants (résolution officielle existante)
  //    livreurId optionnel : à la création, aucun livreur n'est assigné.
  //    resolveCourseParticipantUserIds gère un livreurId null (résout client + admins uniquement).
  let participantUserIds: string[] = [];
  let securityStatus: 'secured' | 'pending' = 'pending';
  try {
    const clientId = course.expediteur_client_id || course.destinataire_client_id;
    participantUserIds = await resolveCourseParticipantUserIds(base44, livreurId || undefined, clientId);
    if (participantUserIds.length > 0) {
      securityStatus = 'secured';
    } else {
      console.warn(`${logPrefix} resolveCourseParticipantUserIds a retourné 0 User.id pour course ${courseId} — message créé en pending`);
    }
  } catch (err: any) {
    console.error(`${logPrefix} Échec résolution participants course ${courseId}: ${err?.message} — message créé en pending`);
  }

  // 4. Première tentative de création
  try {
    await attemptCreateMessage(base44, courseId, livreurId, messageContent, idempotencyKey, participantUserIds, securityStatus);
    console.log(`${logPrefix} ✅ Message codes créé pour course ${courseId} (livreur ${livreurId})`);
    return { created: true, idempotent: false };
  } catch (firstErr: any) {
    const firstErrMsg = firstErr?.message || String(firstErr);
    console.warn(`${logPrefix} ⚠️ Première tentative échouée pour course ${courseId}: ${firstErrMsg} — retry dans ${RETRY_DELAY_MS}ms`);

    // 5. Avant le retry : re-vérifier que le message n'a pas été créé par la première tentative
    //    (évite un doublon si l'erreur s'est produite après l'écriture en base)
    const recheckExisting = await findExistingMessage(base44, courseId);
    if (recheckExisting.length > 0) {
      console.log(`${logPrefix} ✅ Message codes retrouvé après retry check pour course ${courseId} — idempotent`);
      return { created: false, idempotent: true };
    }

    // 6. Retry unique après délai court
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

    // Re-vérifier encore une fois avant le retry (au cas où le message a été créé
    // entre le premier check et le retry)
    const recheckBeforeRetry = await findExistingMessage(base44, courseId);
    if (recheckBeforeRetry.length > 0) {
      console.log(`${logPrefix} ✅ Message codes retrouvé avant retry pour course ${courseId} — idempotent`);
      return { created: false, idempotent: true };
    }

    try {
      await attemptCreateMessage(base44, courseId, livreurId, messageContent, idempotencyKey, participantUserIds, securityStatus);
      console.log(`${logPrefix} ✅ Message codes créé au retry pour course ${courseId} (livreur ${livreurId})`);
      return { created: true, idempotent: false };
    } catch (retryErr: any) {
      const retryErrMsg = retryErr?.message || String(retryErr);
      // 7. Échec définitif — logguer uniquement, ne pas lever d'exception
      console.error(`${logPrefix} ❌ Échec définitif création message codes pour course ${courseId} (livreur ${livreurId}): ${retryErrMsg}`);
      return { created: false, idempotent: false, error: retryErrMsg };
    }
  }
}