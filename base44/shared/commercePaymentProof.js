// LOCAL PREPARATION. Requires protected provenance entity and coordinated order write restrictions.
import { adminFor } from './commerceAccess.js';
const kinds={boutique:['Boutique','CommandeBoutique','boutique_id'],restaurant:['Restaurant','CommandeRestaurant','restaurant_id']};
/** @returns {never} */
export function proofFail(code,status=403){throw Object.assign(new Error(code),{code,status});}
export function proofId(value){if(typeof value!=='string'||!value.trim()||value.length>200)proofFail('INVALID_ID',400);return value;}
export function proofKind(type){if(!Object.hasOwn(kinds,type))proofFail('INVALID_TYPE',400);return kinds[type];}
export function proofUser(user){if(!user?.id||!user?.email)proofFail('AUTH_REQUIRED',401);if(user.enterprise_id)proofFail('PROOF_FORBIDDEN');}
function validCountry(value){return typeof value==='string'&&/^[A-Z]{2}$/.test(value);}
export function privateProofUri(uri){
  // Storage returns a relative object key, not necessarily the SDK example's private/ prefix.
  // Accept only a safe relative key returned by UploadPrivateFile and held in protected provenance.
  // The shape never grants ownership or makes a caller-supplied URI trustworthy.
  if(typeof uri!=='string'||uri.length>2048||! /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/.test(uri)
    ||uri.split('/').some(p=>p==='.'||p==='..'))proofFail('INVALID_PRIVATE_PROOF',503);
  return uri;
}

export async function proofClient(api,user){
  proofUser(user);
  const rows=await api.entities.ClientExterne.filter({user_email:user.email});
  const client=rows?.[0];
  if(!Array.isArray(rows)||rows.length!==1||!client?.id||client.user_email!==user.email||client.actif===false||client.enterprise_id||!validCountry(client.country_code))proofFail('PROOF_FORBIDDEN');
  return client;
}
export function assertProofBinding(proof,{proofId:expectedId,type,parent,clientId,actorId}){
  if(!proof||proof.id!==expectedId||proof.provenance!=='server_private_upload_v1'||proof.state!=='ready'
    ||proof.type!==type||proof.parent_id!==parent.id||proof.country_code!==parent.pays_code
    ||!validCountry(proof.country_code)||!proof.actor_user_id||!proof.client_id||!proof.merchant_owner_id
    ||proof.merchant_owner_id!==parent.partenaire_id||parent.enterprise_id
    ||(clientId!==undefined&&proof.client_id!==clientId)||(actorId!==undefined&&proof.actor_user_id!==actorId))proofFail('PROOF_FORBIDDEN');
  proofId(proof.upload_request_id);privateProofUri(proof.file_uri);
  return proof;
}
export async function validateCommerceOrderProof({api,user,client,type,parent,proofId:requestedId}){
  proofUser(user);proofKind(type);proofId(requestedId);
  if(!client?.id||client.user_email!==user.email||client.actif===false||client.enterprise_id
    ||!parent?.id||!validCountry(parent.pays_code)||parent.pays_code!==client.country_code||parent.enterprise_id)proofFail('PROOF_FORBIDDEN');
  const proof=await api.asServiceRole.entities.CommercePaymentProof.get(requestedId);
  assertProofBinding(proof,{proofId:requestedId,type,parent,clientId:client.id,actorId:user.id});
  return {commerce_payment_proof_id:proof.id};
}
export async function authorizedCommerceProof({api,user,type,orderId,adminScope}){
  proofUser(user);proofId(orderId);const[parentEntity,orderEntity,parentKey]=proofKind(type);
  // The client profile must remain a normal-RLS read, never service-role.
  const client=user.role==='admin'?null:await proofClient(api,user).catch(()=>null);
  const sr=api.asServiceRole.entities;
  const order=await sr[orderEntity].get(orderId);
  if(!order||order.id!==orderId||order.enterprise_id||!validCountry(order.pays_code))proofFail('PROOF_NOT_FOUND',404);
  const parent=await sr[parentEntity].get(proofId(order[parentKey]));
  if(!parent||parent.id!==order[parentKey]||parent.enterprise_id||parent.pays_code!==order.pays_code)proofFail('PROOF_FORBIDDEN');
  if(user.role==='admin')adminFor(user,order.pays_code,adminScope);
  else if(parent.partenaire_id!==user.id&&(!client||client.id!==order.client_id||client.country_code!==order.pays_code))proofFail('PROOF_FORBIDDEN');
  if(!order.commerce_payment_proof_id)proofFail('PRIVATE_PROOF_UNAVAILABLE',404);
  const proof=await sr.CommercePaymentProof.get(proofId(order.commerce_payment_proof_id));
  assertProofBinding(proof,{proofId:order.commerce_payment_proof_id,type,parent,clientId:order.client_id});
  if(user.role!=='admin'){
    const owner=parent.partenaire_id===user.id&&proof.merchant_owner_id===user.id;
    const uploader=client&&client.id===proof.client_id&&client.country_code===proof.country_code&&proof.actor_user_id===user.id;
    if(!owner&&!uploader)proofFail('PROOF_FORBIDDEN');
  }
  return proof;
}
