import { createCommerceSingletonJournal as createLegacyJournal } from './commerceSingletonJournal.js';
import { createCommerceSegmentedJournal } from './commerceSegmentedJournal.js';
// Select only from the protected root state. Never auto-migrate or accept routing from requests.
// The retained export keeps the existing handler contract during coordinated deployment.
export function createCommerceSingletonJournal(options) {
  const legacy=createLegacyJournal(options);
  const required=['request_id','actor_id','scope_id','operation','payload_hash'];
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  async function run(action,request,perform) {
    if(!request||required.some(k=>typeof request[k]!=='string'||!request[k]||request[k].length>200))fail('REQUEST_BINDING_INVALID');
    if(await options.authorize(request)!==true)fail('AUTHORIZATION_REQUIRED');
    try {
      const root=await options.storage.get(options.singletonId);
      if(!root||root.id!==options.singletonId)fail('JOURNAL_UNAVAILABLE');
      const journal=root.state==='ready'?legacy:root.state==='segmented'?createCommerceSegmentedJournal({...options,rootId:options.singletonId}):null;
      if(!journal)fail('JOURNAL_UNAVAILABLE');
      return action==='inspect'?await journal.inspect(request):await journal.execute(request,perform);
    } catch(error) {
      if(error?.code==='AUTHORIZATION_REQUIRED'||error?.code==='REQUEST_BINDING_CONFLICT')throw error;
      return {decision:'reconcile',reason:error?.code||'JOURNAL_READ_UNCERTAIN',may_execute:false};
    }
  }
  return Object.freeze({inspect:request=>run('inspect',request),execute:(request,perform)=>run('execute',request,perform)});
}
