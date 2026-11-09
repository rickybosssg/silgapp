import {createCommerceQueries} from './commerceQueries.js';
import {readCommercePage} from './commerceGateway.js';
export const COMMERCE_ADMIN_MIGRATION_ENABLED=true;
export function commerceAdminScope(context) {
  if(!context?.sessionId || !/^[A-Z]{2}$/.test(context.countryCode||'')) throw new Error('ADMIN_COUNTRY_SELECTION_REQUIRED');
  return {sessionId:context.sessionId,countryCode:context.countryCode};
}
export function createCommerceAdmin({sdk,context}) {
  const scope=commerceAdminScope(context);
  const invoke=async(name,body)=>{
    const user=await sdk.auth.me();
    if(user?.id!==scope.sessionId || user.role!=='admin' || user.enterprise_id) throw Object.assign(new Error('ADMIN_SESSION_CHANGED'),{uncertain:false});
    return sdk.functions.invoke(name,body);
  };
  const q=createCommerceQueries(invoke);
  const kind=type=>{if(!['boutique','restaurant'].includes(type))throw new Error('ADMIN_TYPE_INVALID');};
  function shops(page) {for(const row of page.rows)if(!row?.id||row.pays_code!==scope.countryCode)throw new Error('ADMIN_COUNTRY_MISMATCH');return page;}
  async function detail(type,id) {
    kind(type);if(!id)throw new Error('ADMIN_TARGET_REQUIRED');
    const page=shops(await readCommercePage(invoke,{type,action:'catalogue',audience:'admin',country_code:scope.countryCode,parent_id:id,offset:0,limit:1}));
    if(page.rows.length!==1||page.hasMore||page.rows[0].id!==id)throw new Error('ADMIN_TARGET_UNAVAILABLE');
    return page.rows[0];
  }
  let pending=false,uncertain=false;
  return {
    scope,
    async list(type,{offset=0,validation=undefined,newOnly=false}={}) {kind(type);return shops(await q.adminEstablishments({type,countryCode:scope.countryCode,offset,validation,newOnly}));},
    detail,
    async commission(type,id) {await detail(type,id);const page=shops(await q.financialFacts({type,audience:'admin',parentId:id,countryCode:scope.countryCode}));if(page.rows.length!==1||page.rows[0].id!==id||page.hasMore)throw new Error('ADMIN_TARGET_UNAVAILABLE');return page.rows[0].commission_pct;},
    async products(type,id,offset=0) {await detail(type,id);const page=await q.adminProducts({type,parentId:id,countryCode:scope.countryCode,offset});if(page.rows.some(row=>!row?.id||row[type==='boutique'?'boutique_id':'restaurant_id']!==id))throw new Error('ADMIN_PARENT_MISMATCH');return page;},
    async mutate({type,id,operation,productId,action,motif='',commission}) {
      if(pending||uncertain)throw new Error(uncertain?'ADMIN_OUTCOME_UNCERTAIN':'ADMIN_MUTATION_PENDING');
      kind(type);
      if(!['commission','moderate','acknowledge'].includes(operation))throw new Error('ADMIN_OPERATION_UNAVAILABLE');
      if(operation==='commission' && (typeof commission!=='number'||!Number.isFinite(commission)||commission<0||commission>100))throw new Error('INVALID_COMMISSION');
      if(operation==='moderate' && (!['valider','refuser','suspendre','reactiver'].includes(action)||productId&&(type!=='boutique'||action==='suspendre')))throw new Error('ADMIN_MODERATION_UNAVAILABLE');
      if(operation==='acknowledge'&&type!=='boutique')throw new Error('ADMIN_OPERATION_UNAVAILABLE');
      pending=true;let writing=false;
      try {
        const shop=await detail(type,id);
        if(operation==='acknowledge'&&shop.creation_directe!==true)throw new Error('ADMIN_NOTICE_UNAVAILABLE');
        writing=true;
        const result=operation==='commission'?await q.setCommission({type,establishmentId:id,commission}):operation==='acknowledge'?await q.acknowledgeCreation(id):await q.moderate({type,establishmentId:id,productId,action,motif});
        const record=result.record;
        if(productId?record.boutique_id!==id:record.pays_code!==scope.countryCode)throw new Error('ADMIN_RECEIPT_SCOPE_MISMATCH');
        if(operation==='commission'&&record.commission_pct!==commission || operation==='acknowledge'&&record.creation_admin_notifiee!==true || operation==='moderate'&&record.validation!==({valider:'valide',reactiver:'valide',refuser:'refuse',suspendre:'suspendu'})[action])throw new Error('ADMIN_RECEIPT_UNCONFIRMED');
        return result;
      } catch(error) {
        const explicitlyRejected=error?.uncertain===false||error?.response?.data?.uncertain===false;
        if(writing&&!explicitlyRejected){uncertain=true;throw Object.assign(new Error('ADMIN_OUTCOME_UNCERTAIN'),{cause:error,uncertain:true});}
        throw error;
      } finally {pending=false;}
    },
  };
}
