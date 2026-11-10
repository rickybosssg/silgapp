// Local transition preparation. CAS is not a transaction with course creation or dispatch.
export async function claimCommerceTransition(entity, order, parentKey, patch) {
  const fail=(code,uncertain)=>{throw Object.assign(new Error(code),{code,status:409,uncertain});};
  if (!entity || typeof entity.updateMany!=='function' || !order?.id || !['boutique_id','restaurant_id'].includes(parentKey) || !order[parentKey] || !order.pays_code || typeof order.statut!=='string' || typeof patch?.statut!=='string') fail('TRANSITION_CLAIM_INVALID',false);
  if(order.statut===patch.statut)return {already_applied:true};
  let result;
  try {result=await entity.updateMany({id:order.id,statut:order.statut,pays_code:order.pays_code,[parentKey]:order[parentKey]},{$set:patch});}
  catch {fail('TRANSITION_OUTCOME_UNCERTAIN',true);}
  if(result?.success===true&&result.updated===1&&result.has_more!==true)return {claimed:true};
  if(result?.success===true&&result.updated===0&&result.has_more!==true)fail('TRANSITION_CONFLICT',false);
  fail('TRANSITION_OUTCOME_UNCERTAIN',true);
}
