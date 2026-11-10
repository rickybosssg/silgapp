// LOCAL PREPARATION. Used by local manageCommerce create paths; not deployed or provisioned.
// Requires an explicitly provisioned singleton, denied direct access, and live CAS verification.
// No bootstrap, pruning, lease takeover, effect retry, or atomicity across journal and business rows.
// authorize MUST derive actor/scope/operation authorization and canonical payload_hash server-side.
// A client-supplied hash or actor is never sufficient. Results are IDs requiring fresh authorized reads.
// The singleton ID and storage adapter are protected server configuration, never request parameters.
const bindingKeys=['request_id','actor_id','scope_id','operation','payload_hash'];
const validKey=value=>typeof value==='string'&&value.length>0&&value.length<=200;
const same=(a,b)=>bindingKeys.every(k=>a[k]===b[k]);
const bytes=value=>new TextEncoder().encode(value).length;
const reconcile=reason=>({decision:'reconcile',reason,may_execute:false});
function fail(code){throw Object.assign(new Error(code),{code});}
function binding(request){
  if(!request||bindingKeys.some(k=>!validKey(request[k])))fail('REQUEST_BINDING_INVALID');
  return Object.fromEntries(bindingKeys.map(k=>[k,request[k]]));
}
export function createCommerceSingletonJournal({storage,singletonId,authorize,newClaimId,maxEntries=200,maxBytes=65536}) {
  if(!validKey(singletonId)||!storage||typeof storage.get!=='function'||typeof storage.updateMany!=='function'||typeof authorize!=='function'||typeof newClaimId!=='function')fail('PROVISIONED_JOURNAL_REQUIRED');
  if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>1000||!Number.isSafeInteger(maxBytes)||maxBytes<256||maxBytes>1048576)fail('JOURNAL_LIMITS_INVALID');
  async function access(request){const req=binding(request);if(await authorize(req)!==true)fail('AUTHORIZATION_REQUIRED');return req;}
  async function read(){
    const root=await storage.get(singletonId);
    if(!root||root.id!==singletonId||root.state!=='ready'||!Number.isSafeInteger(root.revision)||root.revision<0||root.revision>=Number.MAX_SAFE_INTEGER||typeof root.ledger!=='string'||bytes(root.ledger)>maxBytes)fail('JOURNAL_UNAVAILABLE');
    let entries;try{entries=JSON.parse(root.ledger);}catch{fail('JOURNAL_INVALID');}
    if(!Array.isArray(entries)||entries.length>maxEntries)fail('JOURNAL_INVALID');
    const ids=new Set();
    for(const e of entries){binding(e);if(ids.has(e.request_id)||!validKey(e.claim_id)||!['running','completed','unknown'].includes(e.state)||e.state==='completed'&&!validKey(e.result_id))fail('JOURNAL_INVALID');ids.add(e.request_id);}
    return {root,entries};
  }
  function existing(entries,req){
    const entry=entries.find(e=>e.request_id===req.request_id);
    if(!entry)return null;
    if(!same(entry,req))fail('REQUEST_BINDING_CONFLICT');
    return entry.state==='completed'?{decision:'replay_receipt',result_id:entry.result_id,requires_authorized_result_read:true,may_execute:false}:reconcile('REQUEST_ALREADY_RESERVED');
  }
  async function cas(root,entries){
    const ledger=JSON.stringify(entries);if(entries.length>maxEntries||bytes(ledger)>maxBytes)fail('JOURNAL_CAPACITY_REACHED');
    // Exact scalar ID is essential: Base44 only rechecks conditions atomically in this form.
    const receipt=await storage.updateMany({id:singletonId,revision:root.revision,state:'ready',ledger:root.ledger},{$set:{revision:root.revision+1,ledger}});
    return receipt?.success===true&&receipt.updated===1&&receipt.has_more!==true;
  }
  async function inspect(request){
    const req=await access(request);const {entries}=await read();
    return existing(entries,req)||{decision:'unreserved',may_execute:false};
  }
  async function execute(request,perform){
    if(typeof perform!=='function')fail('EFFECT_REQUIRED');
    const req=await access(request);let snapshot;
    try{snapshot=await read();}catch(e){return reconcile(e.code||'JOURNAL_READ_UNCERTAIN');}
    const found=existing(snapshot.entries,req);if(found)return found;
    if(snapshot.entries.length>=maxEntries)return reconcile('JOURNAL_CAPACITY_REACHED');
    const claim_id=newClaimId();if(!validKey(claim_id))fail('CLAIM_ID_INVALID');
    const entry={...req,claim_id,state:'running'};
    try{if(!await cas(snapshot.root,[...snapshot.entries,entry]))return reconcile('CLAIM_NOT_CONFIRMED');}
    catch(e){return reconcile(e.code||'CLAIM_OUTCOME_UNCERTAIN');}
    // Successful CAS is the sole point allowing one effect attempt.
    let result;
    try{result=await perform(Object.freeze({...req,claim_id}));}catch{return reconcile('EFFECT_OUTCOME_UNCERTAIN');}
    if(!validKey(result?.result_id))return reconcile('EFFECT_RECEIPT_INVALID');
    try{
      // Never repeat perform, even if another operation changed the singleton revision.
      const latest=await read();const current=latest.entries.find(e=>e.request_id===req.request_id);
      if(!current||!same(current,req)||current.claim_id!==claim_id||current.state!=='running')return reconcile('RESERVATION_CHANGED');
      const completed=latest.entries.map(e=>e.request_id===req.request_id?{...e,state:'completed',result_id:result.result_id}:e);
      if(!await cas(latest.root,completed))return reconcile('RECEIPT_NOT_CONFIRMED');
      return {decision:'completed',result_id:result.result_id,requires_authorized_result_read:true,may_execute:false};
    }catch(e){return reconcile(e.code||'RECEIPT_OUTCOME_UNCERTAIN');}
  }
  return Object.freeze({inspect,execute});
}
