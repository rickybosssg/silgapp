import { readPartnerOrderResult } from './partnerOrderResult.js';
// Source-controlled activation for the coordinated commerce test release.
export const PARTNER_ORDER_V2_ENABLED = true;
export async function submitPartnerOrderV2({invoke,intents,scope,payload,expected,reconcile=false}) {
  if (typeof invoke !== 'function' || typeof intents?.run !== 'function') throw new Error('ORDER_INTENT_STORAGE_REQUIRED');
  if (!scope?.actorId || scope.operation !== 'create_order' || scope.type !== expected?.type || scope.parentId !== expected?.etablissementId || !scope.countryCode) throw new Error('ORDER_INTENT_SCOPE_INVALID');
  let confirmedOrder=null;
  let requestId=null;
  try {
    const result=await intents.run(scope,payload,async intent=>{
      if(!intent?.requestId || !intent.data)throw new Error('ORDER_INTENT_NOT_PERSISTED');
      requestId=intent.requestId;
      const response=await invoke('creerCommandePartenaireV2',{...intent.data,request_id:requestId});
      const order=readPartnerOrderResult(response,{...expected,total:intent.data.total});
      // An older deployed V2 may ignore proof_id. Only the persisted proposal and
      // its server-confirmed binding establish success, including explicit recovery.
      if (Object.hasOwn(intent.data,'proof_id') && (!intent.data.proof_id || order.commerce_payment_proof_id !== intent.data.proof_id)) {
        throw Object.assign(new Error('ORDER_PRIVATE_PROOF_UNCONFIRMED'),{uncertain:true});
      }
      confirmedOrder=order;
      return {record:confirmedOrder};
    },{reconcile});
    return {order:result.record,localReceiptPending:false,requestId};
  } catch(error) {
    // Preserve a confirmed server receipt even if its local completion cannot be stored.
    if(confirmedOrder)return {order:confirmedOrder,localReceiptPending:true,requestId};
    throw error;
  }
}
