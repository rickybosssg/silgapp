import {readOwnerOrder,ownerReadScope} from './commerceOwnerReadView.js';
const transitions=Object.freeze({verifier_paiement:['commande_envoyee','paiement_verification'],valider_paiement:['paiement_verification','paiement_valide'],refuser_paiement:['paiement_verification','paiement_refuse'],commencer_preparation:['paiement_valide','en_preparation'],prete_recuperation:['en_preparation','prete_recuperation']});
const paymentActions=new Set(['valider_paiement','refuser_paiement']);
function fail(code){throw new Error(code);}
export function ownerOrderActions(row,{proofConsulted=false}={}) {
  return Object.entries(transitions).filter(([action,[from]])=>row?.statut===from&&(!paymentActions.has(action)||proofConsulted)).map(([action])=>action);
}
export function browserOrderIntentStorage(){return {getItem:key=>globalThis.localStorage.getItem(key),setItem:(key,value)=>globalThis.localStorage.setItem(key,value)};}
export function createOwnerOrderActions({sdk,scope,storage,withLock=undefined,now=()=>Date.now()}) {
  ownerReadScope({enabled:true,userId:scope.sessionId},scope.type,scope.parentId,scope.countryCode);
  const proofs=new Map(),inflight=new Set();let disposed=false;
  const key=id=>'silgapp-commerce-order-action-v1:'+JSON.stringify([scope.sessionId,scope.type,scope.parentId,scope.countryCode,id]);
  const lock=withLock||((name,work)=>{if(!globalThis.navigator?.locks?.request)fail('ORDER_LOCK_UNAVAILABLE');return navigator.locks.request(name,{mode:'exclusive'},work);});
  async function auth(){if(disposed)fail('ORDER_SCOPE_CLOSED');const u=await sdk.auth.me();if(u?.id!==scope.sessionId||u.role==='admin'||u.enterprise_id)fail('OWNER_SESSION_CHANGED');}
  function intent(id){let raw;try{raw=storage.getItem(key(id));}catch{fail('ORDER_STORAGE_UNAVAILABLE');}if(!raw)return null;let value;try{value=JSON.parse(raw);}catch{fail('ORDER_STORAGE_INVALID');}if(value?.version!==1||value.orderId!==id||!Object.hasOwn(transitions,value.action)||!['pending','uncertain','confirmed','rejected'].includes(value.phase))fail('ORDER_STORAGE_INVALID');return value;}
  function persist(id,value){try{const raw=JSON.stringify(value);storage.setItem(key(id),raw);if(storage.getItem(key(id))!==raw)fail('ORDER_STORAGE_UNAVAILABLE');}catch{fail('ORDER_STORAGE_UNAVAILABLE');}}
  function consulted(id){const p=proofs.get(id);return !!p&&p.consulted===true&&p.expiresAt>now();}
  function complete(entry,row){const target=transitions[entry.action][1];if(row.statut!==target)return false;if(entry.action==='commencer_preparation'&&scope.type==='restaurant'&&row.preparation_time_minutes!==entry.preparationTime)return false;if(entry.action==='prete_recuperation'||entry.action==='commencer_preparation'&&scope.type==='restaurant')return typeof row.course_id==='string'&&!!row.course_id&&row.delivery_verification==='verified';return true;}
  async function reread(id){await auth();return readOwnerOrder(sdk,scope,id);}
  return {
    intent,consulted,
    async proof(id){
      await auth();const row=await reread(id);if(row.has_private_payment_proof!==true)fail('PRIVATE_PROOF_UNAVAILABLE');
      const requestedAt=now();
      let response;try{response=await sdk.functions.invoke('readCommerceProof',{type:scope.type,commande_id:id});}catch{fail('PRIVATE_PROOF_UNAVAILABLE');}
      const body=response?.data??response;
      if(response?.status>=400||body?.success!==true||body.commande_id!==id||!Number.isFinite(body.expires_in)||body.expires_in<=0||body.expires_in>60)fail('PRIVATE_PROOF_UNAVAILABLE');
      let url;try{url=new URL(body.signed_url);}catch{fail('PRIVATE_PROOF_UNAVAILABLE');}
      if(url.protocol!=='https:'||url.username||url.password||disposed)fail('PRIVATE_PROOF_UNAVAILABLE');
      await auth();const expiresAt=requestedAt+body.expires_in*1000;if(expiresAt<=now())fail('PRIVATE_PROOF_UNAVAILABLE');const value={url:url.href,token:crypto.randomUUID(),expiresAt,loaded:false,consulted:false};proofs.set(id,value);return {...value};
    },
    proofLoaded(id,token){const p=proofs.get(id);if(p?.token===token&&p.expiresAt>now())p.loaded=true;},
    acknowledgeProof(id,token){const p=proofs.get(id);if(!p||p.token!==token||!p.loaded||p.expiresAt<=now())fail('PRIVATE_PROOF_NOT_CONSULTED');p.consulted=true;},
    clearProof(id){proofs.delete(id);},
    async reconcile(id){
      if(inflight.has(id))fail('ORDER_ACTION_PENDING');
      return lock(key(id),async()=>{const entry=intent(id),row=await reread(id);if(entry&&['pending','uncertain'].includes(entry.phase)&&complete(entry,row))persist(id,{...entry,phase:'confirmed'});return {row,confirmed:entry?complete(entry,row):false};});
    },
    async perform({id,action,preparationTime}) {
      if(inflight.has(id))fail('ORDER_ACTION_PENDING');
      if(!Object.hasOwn(transitions,action))fail('ORDER_ACTION_UNAVAILABLE');
      inflight.add(id);
      try{return await lock(key(id),async()=>{
        await auth();const previous=intent(id);if(previous&&['pending','uncertain'].includes(previous.phase))fail('ORDER_RECONCILIATION_REQUIRED');
        const row=await reread(id);if(!ownerOrderActions(row,{proofConsulted:consulted(id)}).includes(action))fail('ORDER_ACTION_UNAVAILABLE');
        if(action==='commencer_preparation'&&scope.type==='restaurant'&&![5,10,15,20,30].includes(preparationTime))fail('PREPARATION_TIME_REQUIRED');
        const entry={version:1,orderId:id,action,fromStatus:row.statut,phase:'pending',startedAt:now(),...(action==='commencer_preparation'&&scope.type==='restaurant'?{preparationTime}: {})};
        persist(id,entry);
        let response;
        try {
          // Local intention is not a server idempotency key. Never replay this call.
          response=await sdk.functions.invoke('changerStatutCommande',{commande_id:id,type:scope.type,action,...(entry.preparationTime?{preparation_time_minutes:entry.preparationTime}:{})});
          const body=response?.data??response;
          if(response?.status>=400||body?.success!==true||body.error||body.skipped){const explicit=body?.uncertain===false||body?.success===false&&typeof body?.current_statut==='string';throw Object.assign(new Error('ORDER_ACTION_NOT_CONFIRMED'),{definitive:explicit});}
        }catch(error){
          const status=error?.response?.status;
          const rejected=error?.definitive===true||error?.response?.data?.uncertain===false||[400,401,403,404].includes(status);
          persist(id,{...entry,phase:rejected?'rejected':'uncertain'});fail(rejected?'ORDER_ACTION_REJECTED':'ORDER_OUTCOME_UNCERTAIN');
        }
        proofs.delete(id);
        try {const updated=await reread(id);if(!complete(entry,updated))fail('ORDER_OUTCOME_UNCERTAIN');persist(id,{...entry,phase:'confirmed'});return {row:updated,confirmed:true};}
        catch{persist(id,{...entry,phase:'uncertain'});fail('ORDER_OUTCOME_UNCERTAIN');}
      });}finally{inflight.delete(id);}
    },
    dispose(){disposed=true;proofs.clear();},
  };
}
