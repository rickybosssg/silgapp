// ═══════════════════════════════════════════════════════════════════════════
// Helper idempotent pour la création du message système contenant les codes
// de récupération et de livraison d'une course admin/VENUS.
//
// Règles :
//   1. client_message_id déterministe : course-codes-{courseId}-{livreurId}
//   2. Vérifie l'existence avant création (idempotence).
//   3. Retry unique avec re-vérification avant retry (anti-doublon).
//   4. Échec définitif → console.error uniquement. N'échoue jamais l'acceptation.
//   5. Utilise resolveCourseParticipantUserIds (résolution officielle existante).
//   6. Contient systématiquement les deux codes + prix si disponible.
// ═══════════════════════════════════════════════════════════════════════════

import { resolveCourseParticipantUserIds } from './conversationSecurity.ts';

const RETRY_DELAY_MS = 500;
const IDEMPOTENCY_PREFIX = 'course-codes';

/**
 * Construit le client_message_id déterministe pour le message des codes.
 * Format : course-codes-{courseId}-{livreurId}
 */
export function buildCodeMessageIdempotencyKey(courseId: string, livreurId: string): string {
  return `${IDEMPOTENCY_PREFIX}-${courseId}-${livreurId}`;
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
  devise?: string
): string {
  const parts: string[] = [
    `🔑 Code de récupération : ${pickupPIN}`,
    `📦 Code de livraison : ${deliveryPIN}`,
  ];
  if (prixProposeAdmin && Number(prixProposeAdmin) > 0) {
    parts.push(`💰 Prix de la course : ${Number(prixProposeAdmin).toLocaleString()} ${devise || 'FCFA'}`);
  } else if (prixEstimate && Number(prixEstimate) > 0) {
    parts.push(`💰 Prix estimé : ${Number(prixEstimate).toLocaleString()} ${devise || 'FCFA'}`);
  }
  return parts.join('\n');
}

async function findExistingMessage(base44: any, idempotencyKey: string): Promise<any[]> {
  try {
    const existing = await base44.asServiceRole.entities.Message.filter({
      client_message_id: idempotencyKey,
    });
    return existing || [];
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
  livreurId: string,
  pickupPIN: string,
  deliveryPIN: string,
  logPrefix = '[CODE_MSG]'
): Promise<{ created: boolean; idempotent: boolean; error?: string }> {
  const courseId = course?.id;
  if (!courseId || !livreurId || !pickupPIN || !deliveryPIN) {
    console.error(`${logPrefix} Paramètres manquants — courseId=${courseId} livreurId=${livreurId} pickup=${pickupPIN} delivery=${deliveryPIN}`);
    return { created: false, idempotent: false, error: 'missing_params' };
  }

  const idempotencyKey = buildCodeMessageIdempotencyKey(courseId, livreurId);

  // 1. Vérifier si le message existe déjà
  const existing = await findExistingMessage(base44, idempotencyKey);
  if (existing.length > 0) {
    return { created: false, idempotent: true };
  }

  // 2. Construire le contenu standardisé (deux codes + prix)
  const messageContent = buildCodeMessageContent(
    pickupPIN,
    deliveryPIN,
    course.prix_propose_admin,
    course.prix_estimate,
    course.devise
  );

  // 3. Résoudre les participants (résolution officielle existante)
  let participantUserIds: string[] = [];
  let securityStatus: 'secured' | 'pending' = 'pending';
  try {
    const clientId = course.expediteur_client_id || course.destinataire_client_id;
    participantUserIds = await resolveCourseParticipantUserIds(base44, livreurId, clientId);
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
    const recheckExisting = await findExistingMessage(base44, idempotencyKey);
    if (recheckExisting.length > 0) {
      console.log(`${logPrefix} ✅ Message codes retrouvé après retry check pour course ${courseId} — idempotent`);
      return { created: false, idempotent: true };
    }

    // 6. Retry unique après délai court
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

    // Re-vérifier encore une fois avant le retry (au cas où le message a été créé
    // entre le premier check et le retry)
    const recheckBeforeRetry = await findExistingMessage(base44, idempotencyKey);
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