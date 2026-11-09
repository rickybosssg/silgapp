// Durable, scoped browser intentions. Never clear pending/uncertain work on close or reload.
// Browser storage contains only the caller's allowlisted proposal, not credentials.
function fail(code, uncertain=false) { throw Object.assign(new Error(code),{uncertain}); }
function keyFor(scope) {
  if (!scope || !['actorId','operation','type'].every(k=>typeof scope[k]==='string'&&scope[k].trim())) fail('CREATION_SCOPE_REQUIRED');
  return 'silgapp-commerce-intent-v1:'+JSON.stringify([scope.actorId,scope.operation,scope.type,scope.parentId||'']);
}
function canonical(value) {
  if(value===null || ['string','boolean'].includes(typeof value))return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  fail('CREATION_DATA_INVALID');
}
/** @param {{storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">, uuid?: () => string, withLock?: (name: string, work: () => Promise<any>) => Promise<any>}} options */
export function createCommerceCreationIntent({storage,uuid=()=>crypto.randomUUID(),withLock}={}) {
  const lock=withLock || ((name,work)=>{
    if(!globalThis.navigator?.locks?.request)fail('CREATION_LOCK_UNAVAILABLE');
    return globalThis.navigator.locks.request(name,{mode:'exclusive'},work);
  });
  function read(scope) {
    const key=keyFor(scope);let raw;
    try{raw=storage.getItem(key);}catch{fail('CREATION_STORAGE_UNAVAILABLE');}
    if(!raw)return null;
    let value;try{value=JSON.parse(raw);}catch{fail('CREATION_STORAGE_INVALID',true);}
    if(value?.version!==1||typeof value.requestId!=='string'||!value.requestId||!['pending','uncertain','completed','rejected'].includes(value.status)||!value.data||typeof value.data!=='object'||Array.isArray(value.data))fail('CREATION_STORAGE_INVALID',true);
    return value;
  }
  function write(scope,value) {
    try {
      const raw=JSON.stringify(value);if(raw.length>200000)fail('CREATION_DATA_TOO_LARGE');
      storage.setItem(keyFor(scope),raw);
      if(storage.getItem(keyFor(scope))!==raw)fail('CREATION_STORAGE_UNAVAILABLE');
    } catch(error) { fail(error?.message==='CREATION_DATA_TOO_LARGE'?error.message:'CREATION_STORAGE_UNAVAILABLE',true); }
  }
  // Only a deliberate new-intention action may clear a confirmed old receipt.
  async function startNew(scope) {
    return lock(keyFor(scope),async()=>{
      const entry=read(scope);
      if(entry && !['completed','rejected'].includes(entry.status))fail('CREATION_RECONCILIATION_REQUIRED',true);
      if(entry) {try{storage.removeItem(keyFor(scope));}catch{fail('CREATION_STORAGE_UNAVAILABLE');}}
    });
  }
  async function run(scope,data,perform,{reconcile=false}={}) {
    return lock(keyFor(scope),async()=>{
      let entry=read(scope);
      if(entry && entry.status==='rejected' && !reconcile)entry=null;
      if(entry) {
        if(!reconcile)fail('CREATION_RECONCILIATION_REQUIRED',true);
        // Explicit reconciliation always submits the original persisted proposal.
      } else {
        if(reconcile)fail('CREATION_INTENT_MISSING');
        canonical(data);
        entry={version:1,requestId:uuid(),status:'pending',data:JSON.parse(canonical(data))};
        write(scope,entry); // Must persist and read back BEFORE any remote mutation.
      }
      try {
        const result=await perform({requestId:entry.requestId,data:structuredClone(entry.data)});
        if(!result?.record?.id)fail('CREATION_RECEIPT_INVALID',true);
        write(scope,{...entry,status:'completed',resultId:result.record.id});
        return result;
      } catch(error) {
        write(scope,{...entry,status:error?.uncertain===false?'rejected':'uncertain'});
        throw error;
      }
    });
  }
  return {read,startNew,run};
}

