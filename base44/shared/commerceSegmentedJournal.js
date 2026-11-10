// DORMANT local preparation: not wired to handlers, not provisioned or deployed.
// All adapter calls are privileged and configured server-side, never supplied by a caller.
const fields=['request_id','actor_id','scope_id','operation','payload_hash'];
const key=x=>typeof x==='string'&&x.length>0&&x.length<=200;
const size=x=>new TextEncoder().encode(x).length;
const stop=reason=>({decision:'reconcile',reason,may_execute:false});
function fail(code){throw Object.assign(new Error(code),{code});}
function binding(x){if(!x||fields.some(k=>!key(x[k])))fail('INVALID_BINDING');return Object.fromEntries(fields.map(k=>[k,x[k]]));}
const same=(a,b)=>fields.every(k=>a[k]===b[k]);
const confirmed=r=>r?.success===true&&r.updated===1&&r.has_more!==true;
export function createCommerceSegmentedJournal({storage,rootId,authorize,newClaimId,maxEntries=200,maxBytes=65536,maxSegments=64,maxManifestBytes=16384}){
 if(!key(rootId)||!storage||['get','create','updateMany'].some(k=>typeof storage[k]!=='function')||typeof authorize!=='function'||typeof newClaimId!=='function')fail('CONFIG_REQUIRED');
 if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>1000||!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>1048576||!Number.isSafeInteger(maxSegments)||maxSegments<2||maxSegments>256||!Number.isSafeInteger(maxManifestBytes)||maxManifestBytes<1024||maxManifestBytes>65536)fail('INVALID_LIMITS');
 function revision(x){if(!Number.isSafeInteger(x)||x<0||x>=Number.MAX_SAFE_INTEGER)fail('INVALID_REVISION');}
 function entries(row){
  revision(row.revision);if(typeof row.ledger!=='string'||size(row.ledger)>maxBytes)fail('INVALID_LEDGER');
  let a;try{a=JSON.parse(row.ledger);}catch{fail('INVALID_LEDGER');}
  if(!Array.isArray(a)||a.length>maxEntries)fail('INVALID_LEDGER');
  const ids=new Set(),claims=new Set();
  for(const e of a){binding(e);if(!key(e.claim_id)||ids.has(e.request_id)||claims.has(e.claim_id)||!['running','completed','unknown'].includes(e.state)||(e.state==='completed'&&!key(e.result_id)))fail('INVALID_LEDGER');ids.add(e.request_id);claims.add(e.claim_id);}
  return a;
 }
 // Reserve enough serialized space for completion before permitting the business effect.
 function fits(a){return a.length<=maxEntries&&size(JSON.stringify(a.map(e=>e.state==='completed'?e:{...e,state:'completed',result_id:'\u0000'.repeat(200)})))<=maxBytes;}
 async function access(x){const req=binding(x);if(await authorize(req)!==true)fail('AUTHORIZATION_REQUIRED');return req;}
 async function root(){const r=await storage.get(rootId);if(!r||r.id!==rootId||r.state!=='segmented'||r.journal_version!==2)fail('SEGMENTED_ROOT_REQUIRED');revision(r.revision);let ids;try{ids=JSON.parse(r.segment_ids);}catch{fail('INVALID_MANIFEST');}if(typeof r.segment_ids!=='string'||size(r.segment_ids)>maxManifestBytes||!Array.isArray(ids)||ids.length<1||ids.length>maxSegments||ids.some(x=>!key(x)||x===rootId)||new Set(ids).size!==ids.length)fail('INVALID_MANIFEST');return {row:r,ids};}
 async function segment(id){const r=await storage.get(id);if(!r||r.id!==id||r.root_id!==rootId||r.journal_version!==2||!['open','sealed'].includes(r.state))fail('INVALID_SEGMENT');return {row:r,entries:entries(r)};}
 async function scan(){
  const manifest=await root();const segments=[];const requests=new Set(),claims=new Set();
  for(const id of manifest.ids){const s=await segment(id);for(const e of s.entries){if(requests.has(e.request_id)||claims.has(e.claim_id))fail('DUPLICATE_BINDING');requests.add(e.request_id);claims.add(e.claim_id);}segments.push(s);}
  if(segments.slice(0,-1).some(s=>s.row.state!=='sealed'))fail('INVALID_SEGMENT_ORDER');
  return {...manifest,segments,claims};
 }
 function found(s,req){for(const seg of s.segments){const e=seg.entries.find(e=>e.request_id===req.request_id);if(!e)continue;if(!same(e,req))fail('REQUEST_BINDING_CONFLICT');return e.state==='completed'?{decision:'replay_receipt',result_id:e.result_id,requires_authorized_result_read:true,may_execute:false}:stop('REQUEST_ALREADY_RESERVED');}return null;}
 async function segmentCas(row,a,state=row.state){if(!fits(a))fail('SEGMENT_CAPACITY');return confirmed(await storage.updateMany({id:row.id,root_id:rootId,journal_version:2,revision:row.revision,state:row.state,ledger:row.ledger},{$set:{revision:row.revision+1,state,ledger:JSON.stringify(a)}}));}
 async function newSegment(state,ledger){
  const expected={root_id:rootId,journal_version:2,state,revision:0,ledger};const created=await storage.create(expected);
  if(!created||!key(created.id)||created.id===rootId||Object.entries(expected).some(([k,v])=>created[k]!==v))fail('SEGMENT_CREATE_UNCERTAIN');
  return created.id;
 }
 async function rotate(snapshot){
  const tail=snapshot.segments.at(-1);
  if(snapshot.ids.length>=maxSegments)return stop('JOURNAL_SEGMENT_LIMIT');
  if(tail.row.state==='open'&&!await segmentCas(tail.row,tail.entries,'sealed'))return stop('SEAL_NOT_CONFIRMED');
  // Re-read after seal: completing old claims remains allowed and may change revisions.
  const fresh=await root();if(fresh.row.revision!==snapshot.row.revision||fresh.row.segment_ids!==snapshot.row.segment_ids)return stop('MANIFEST_CHANGED');
  const id=await newSegment('open','[]');if(fresh.ids.includes(id))return stop('SEGMENT_ID_COLLISION');
  const segment_ids=JSON.stringify([...fresh.ids,id]);if(size(segment_ids)>maxManifestBytes)return stop('MANIFEST_CAPACITY');
  const ok=confirmed(await storage.updateMany({id:rootId,state:'segmented',journal_version:2,revision:fresh.row.revision,segment_ids:fresh.row.segment_ids},{$set:{revision:fresh.row.revision+1,segment_ids}}));
  return ok?{decision:'rotated',may_execute:false}:stop('ROTATION_NOT_CONFIRMED');
 }
 async function inspect(request){const req=await access(request);const s=await scan();return found(s,req)||{decision:'unreserved',may_execute:false};}
 async function execute(request,perform){
  if(typeof perform!=='function')fail('EFFECT_REQUIRED');const req=await access(request);let s;
  try{s=await scan();}catch(e){return stop(e.code||'READ_UNCERTAIN');}
  const prior=found(s,req);if(prior)return prior;
  const claim_id=newClaimId();if(!key(claim_id)||s.claims.has(claim_id))fail('CLAIM_ID_CONFLICT');
  const entry={...req,claim_id,state:'running'};let tail=s.segments.at(-1);
  if(tail.row.state==='sealed'||!fits([...tail.entries,entry])){
   try{const r=await rotate(s);if(r.decision!=='rotated')return r;s=await scan();}catch(e){return stop(e.code||'ROTATION_UNCERTAIN');}
   const competing=found(s,req);if(competing)return competing;if(s.claims.has(claim_id))fail('CLAIM_ID_CONFLICT');tail=s.segments.at(-1);
  }
  if(tail.row.state!=='open'||!fits([...tail.entries,entry]))return stop('SEGMENT_CAPACITY');
  try{if(!await segmentCas(tail.row,[...tail.entries,entry]))return stop('CLAIM_NOT_CONFIRMED');}catch(e){return stop(e.code||'CLAIM_UNCERTAIN');}
  let result;try{result=await perform(Object.freeze({...req,claim_id}));}catch{return stop('EFFECT_UNCERTAIN');}
  if(!key(result?.result_id))return stop('EFFECT_RECEIPT_INVALID');
  try{
   // A sealed segment still accepts completion, never new reservations.
   const currentRoot=await root();if(!currentRoot.ids.includes(tail.row.id))return stop('SEGMENT_UNREFERENCED');
   const latest=await segment(tail.row.id);const current=latest.entries.find(e=>e.request_id===req.request_id);
   if(!current||!same(current,req)||current.claim_id!==claim_id||current.state!=='running')return stop('RESERVATION_CHANGED');
   if(!await segmentCas(latest.row,latest.entries.map(e=>e.request_id===req.request_id?{...e,state:'completed',result_id:result.result_id}:e)))return stop('RECEIPT_NOT_CONFIRMED');
   return {decision:'completed',result_id:result.result_id,requires_authorized_result_read:true,may_execute:false};
  }catch(e){return stop(e.code||'RECEIPT_UNCERTAIN');}
 }
 // Explicit maintenance only; do NOT call during requests or while legacy effects are in flight.
 // root.state changes atomically to segmented, so old singleton code fails closed afterwards.
 async function migrateCompletedLegacy(){
  if(await authorize({operation:'migrate_journal',root_id:rootId})!==true)fail('MIGRATION_AUTHORIZATION_REQUIRED');
  try{
   const old=await storage.get(rootId);if(!old||old.id!==rootId||old.state!=='ready')return stop('LEGACY_ROOT_REQUIRED');
   const a=entries(old);if(a.some(e=>e.state!=='completed'))return stop('LEGACY_UNRESOLVED');
   const archive=await newSegment('sealed',old.ledger);const active=await newSegment('open','[]');if(archive===active)return stop('SEGMENT_ID_COLLISION');
   const segment_ids=JSON.stringify([archive,active]);
   const ok=confirmed(await storage.updateMany({id:rootId,state:'ready',revision:old.revision,ledger:old.ledger},{$set:{state:'segmented',journal_version:2,revision:old.revision+1,segment_ids}}));
   return ok?{decision:'migrated',may_execute:false}:stop('MIGRATION_NOT_CONFIRMED');
  }catch(e){return stop(e.code||'MIGRATION_UNCERTAIN');}
 }
 return Object.freeze({inspect,execute,migrateCompletedLegacy});
}
