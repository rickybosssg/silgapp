import { loadCommerceClientContext, readClientCommercePage } from './commerceClientMigration.js';

// FUTURE CANDIDATE ONLY. Requires provisioned private-proof storage, server functions
// and COMMERCE_PRIVATE_PROOFS_ENABLED=true before distribution. Never a public fallback.
export const COMMERCE_PRIVATE_PROOFS_ENABLED = true;
export const COMMERCE_PROOF_MAX_BYTES = 5 * 1024 * 1024;
const mimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
function fail(message) { throw new Error(message); }
function validId(value) { return typeof value === 'string' && !!value.trim() && value.length <= 200 && !/[\s/\\?#]/.test(value); }
export function validateCommerceProofFile(file) {
  if (!(file instanceof File) || !mimeTypes.includes(file.type) || file.size < 1 || file.size > COMMERCE_PROOF_MAX_BYTES) {
    fail('Choisissez une image PNG, JPEG ou WebP de 5 Mio maximum.');
  }
}
export async function verifyCommerceProofClient(sdk, profile, expectedActorId = undefined) {
  const context = await loadCommerceClientContext(sdk, true);
  if (!profile?.id || context.profile.id !== profile.id || context.userEmail !== profile.user_email
    || context.profile.country_code !== profile.country_code || (expectedActorId && context.userId !== expectedActorId)) {
    fail('Le profil ou le pays a change. Fermez puis rouvrez la commande.');
  }
  const current = await sdk.auth.me();
  if (current?.id !== context.userId || current.email !== context.userEmail || current.enterprise_id) {
    fail('La session a change. Fermez puis rouvrez la commande.');
  }
  return context;
}
// The SDK converts an OBJECT containing File to multipart; passing FormData directly
// would lose its fields in the installed SDK. Never send a client URI or signed URL.
export async function uploadCommercePaymentProof({ sdk, file, type, parentId, profile, isCurrent = () => true, uuid = () => crypto.randomUUID() }) {
  validateCommerceProofFile(file);
  if (!['boutique', 'restaurant'].includes(type) || !validId(parentId)) fail('Commerce invalide.');
  const context = await verifyCommerceProofClient(sdk, profile);
  const page = await readClientCommercePage(sdk, context, { type, action: 'catalogue', parentId, secure: true });
  if (page.rows.length !== 1 || page.hasMore) fail('Ce commerce est indisponible pour votre profil.');
  if (!isCurrent()) fail('Envoi annule : la commande a change.');
  const current = await sdk.auth.me();
  if (current?.id !== context.userId || current.email !== context.userEmail || current.enterprise_id || !isCurrent()) fail('La session a change.');
  const uploadRequestId = uuid();
  if (!validId(uploadRequestId)) fail('Identifiant de transfert indisponible.');
  const response = await sdk.functions.invoke('uploadCommerceProof', { file, type, parent_id: parentId, upload_request_id: uploadRequestId });
  const body = response?.data ?? response;
  if ((response?.status !== undefined && (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300))
    || !body || typeof body !== 'object' || Array.isArray(body) || body.success !== true || body.error || body.skipped || !validId(body.proof_id)
    || body.mime_type !== file.type || body.byte_size !== file.size
    || Object.keys(body).some(key => !['success', 'proof_id', 'mime_type', 'byte_size'].includes(key))) {
    fail(body?.error === 'PRIVATE_PROOFS_NOT_ENABLED'
      ? 'Le depot prive des preuves n’est pas encore disponible. Aucun fichier public ne sera cree.'
      : 'Le depot de la preuve n’est pas confirme. Aucun nouvel envoi automatique.');
  }
  if (!isCurrent()) fail('Envoi termine apres fermeture ou changement de commande.');
  await verifyCommerceProofClient(sdk, profile, context.userId);
  if (!isCurrent()) fail('La commande a change.');
  return { proofId: body.proof_id, actorId: context.userId, profileId: context.profile.id, countryCode: context.profile.country_code };
}
