import { readCommercePage } from './commerceGateway.js';

export function ownerReadScope(context,type,parentId,countryCode) {
  if(context?.enabled!==true || !context.userId || !['boutique','restaurant'].includes(type) || !parentId || !/^[A-Z]{2}$/.test(countryCode||'')) throw new Error('OWNER_READ_SCOPE_REQUIRED');
  return {sessionId:context.userId,parentId,type,countryCode,audience:'partner'};
}
export function ownerReadInvoke(sdk,scope) {
  return async(name,body)=>{
    const user=await sdk.auth.me();
    if(user?.id!==scope.sessionId || user?.role==='admin' || user?.enterprise_id) throw new Error('OWNER_SESSION_CHANGED');
    if(name!=='readCommerce' || body.audience!=='partner' || body.type!==scope.type || body.parent_id!==scope.parentId || body.country_code!==scope.countryCode) throw new Error('OWNER_READ_SCOPE_MISMATCH');
    return sdk.functions.invoke(name,body);
  };
}
export async function readOwnerOrderPage(sdk,scope,offset=0) {
  const result=await readCommercePage(ownerReadInvoke(sdk,scope),{action:'orders',audience:'partner',type:scope.type,parent_id:scope.parentId,country_code:scope.countryCode,limit:50,offset});
  const ids=new Set();
  for(const row of result.rows) {
    if(!row?.id || ids.has(row.id) || row[scope.type==='boutique'?'boutique_id':'restaurant_id']!==scope.parentId || row.pays_code!==scope.countryCode) throw new Error('OWNER_ORDER_SCOPE_MISMATCH');
    ids.add(row.id);
  }
  return result;
}

export async function readOwnerOrder(sdk,scope,orderId) {
  if(typeof orderId!=='string'||!orderId)throw new Error('OWNER_ORDER_REQUIRED');
  const result=await readCommercePage(ownerReadInvoke(sdk,scope),{action:'order',order_id:orderId,audience:'partner',type:scope.type,parent_id:scope.parentId,country_code:scope.countryCode});
  const row=result.rows[0];
  if(result.rows.length!==1||result.hasMore||!row||row.id!==orderId||row[scope.type==='boutique'?'boutique_id':'restaurant_id']!==scope.parentId||row.pays_code!==scope.countryCode)throw new Error('OWNER_ORDER_SCOPE_MISMATCH');
  return row;
}
