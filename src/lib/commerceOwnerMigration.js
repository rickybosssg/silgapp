import { readCommercePage, manageCommerceRecord } from './commerceGateway.js';
import { createCommerceCreationIntent } from './commerceCreationIntent.js';

// Explicit release gate. No localStorage/query-string/remote fallback can enable this.
export const COMMERCE_OWNER_MIGRATION_ENABLED = true;
export function ownerMigrationActive(enabled,user,type='boutique') {
  return enabled===true && !!user?.id && user.role!=='admin' && !user.enterprise_id && ['boutique','restaurant'].includes(type);
}
export function ownerCreationScope(actorId,type,parentId='') {
  return {actorId,type,parentId,operation:parentId?'create_product':'create_establishment'};
}
export function browserCommerceIntents() {
  let storage;try{storage=globalThis.localStorage;}catch{throw new Error('CREATION_STORAGE_UNAVAILABLE');}
  return createCommerceCreationIntent({storage});
}
const shopKeys=['nom','logo_url','description','ville','quartier','adresse','latitude','longitude','telephone','telephone_depot','horaires','ouvert'];
export function ownerShopData(type,data,{creating=false}={}) {
  const keys=[...shopKeys,...(type==='restaurant'?['specialite','temps_preparation_min']:['categorie']),...(creating&&type==='boutique'?['pays_code']:[])];
  return Object.fromEntries(keys.filter(k=>data[k]!==undefined).map(k=>[k,data[k]]));
}
export function ownerProductData(data) {
  const keys=['nom','description','photo_url','photos_urls','video_url','prix','categorie','disponible'];
  return Object.fromEntries(keys.filter(k=>data[k]!==undefined).map(k=>[k,data[k]]));
}
export function createOwnerCommerce({sdk,actorId,intents=undefined}) {
  const invoke=async(name,payload)=>{
    try {return await sdk.functions.invoke(name,payload);}
    catch(error) {
      const body=error?.response?.data;
      // Preserve only an explicit structured server outcome. Transport failures stay uncertain.
      if(body?.success===false && typeof body.error==='string' && typeof body.uncertain==='boolean') {
        throw Object.assign(new Error(body.error),{uncertain:body.uncertain,status:error.response.status});
      }
      throw error;
    }
  };
  async function auth() {
    const user=await sdk.auth.me();
    if(!user?.id||user.id!==actorId||user.role==='admin'||user.enterprise_id)throw Object.assign(new Error('OWNER_SESSION_CHANGED'),{uncertain:false});
    return user;
  }
  const read=async request=>{await auth();return readCommercePage(invoke,{...request,audience:'partner'});};
  const write=async request=>{await auth();return manageCommerceRecord(invoke,request);};
  return {
    establishments:async(type,offset=0)=>read({type,action:'catalogue',offset,limit:50}),
    async allEstablishments(type) {
      const rows=[],seen=new Set();let offset=0;
      for(let page=0;page<20;page++) {
        const result=await read({type,action:'catalogue',offset,limit:50});
        for(const row of result.rows) {if(!row?.id||seen.has(row.id))throw new Error('OWNER_PAGINATION_CHANGED');seen.add(row.id);rows.push(row);}
        if(!result.hasMore)return rows;
        offset=result.nextOffset;
      }
      throw new Error('OWNER_PAGINATION_INCOMPLETE');
    },
    products:async(type,parentId,offset=0)=>read({type,action:'products',parent_id:parentId,offset,limit:50}),
    orders:async(type,parentId,offset=0)=>read({type,action:'orders',parent_id:parentId,offset,limit:50}),
    async saveShop({type,existing,data,reconcile=false}) {
      const user=await auth();
      if(existing?.id) {
        if(data.pays_code && data.pays_code!==existing.pays_code)throw Object.assign(new Error('OWNER_COUNTRY_CHANGE_UNAVAILABLE'),{uncertain:false});
        return write({type,action:'update_establishment',establishment_id:existing.id,data:ownerShopData(type,data)});
      }
      if(!intents)throw Object.assign(new Error('CREATION_STORAGE_UNAVAILABLE'),{uncertain:false});
      if(type==='restaurant'&&!reconcile) {
        const profiles=await sdk.entities.ClientExterne.filter({user_email:user.email});
        if(!Array.isArray(profiles)||profiles.length!==1||profiles[0].user_email!==user.email||profiles[0].country_code!==data.pays_code)throw Object.assign(new Error('OWNER_PROFILE_COUNTRY_MISMATCH'),{uncertain:false});
      }
      const proposal={...ownerShopData(type,data,{creating:true}),pays_code:data.pays_code};
      return intents.run(ownerCreationScope(actorId,type),proposal,async intent=>{
        const result=await write({type,action:'create_establishment',request_id:intent.requestId,data:ownerShopData(type,intent.data,{creating:true})});
        if(result.record.partenaire_id!==actorId || result.record.pays_code!==intent.data.pays_code)throw Object.assign(new Error('CREATION_RECEIPT_INVALID'),{uncertain:true});
        return result;
      },{reconcile});
    },
    async saveProduct({type,parentId,existing,data,reconcile=false}) {
      await auth();
      const perform=async intent=>{
        const result=await write({type,action:existing?.id?'update_product':'create_product',establishment_id:parentId,...(existing?.id?{product_id:existing.id}:{request_id:intent.requestId}),data:intent.data});
        if(result.record[type==='restaurant'?'restaurant_id':'boutique_id']!==parentId)throw Object.assign(new Error('CREATION_RECEIPT_INVALID'),{uncertain:true});
        return result;
      };
      if(existing?.id)return perform({data:ownerProductData(data)});
      if(!intents)throw Object.assign(new Error('CREATION_STORAGE_UNAVAILABLE'),{uncertain:false});
      return intents.run(ownerCreationScope(actorId,type,parentId),ownerProductData(data),perform,{reconcile});
    },
    setAvailable:({type,parentId,id,available})=>write({type,action:'update_product',establishment_id:parentId,product_id:id,data:{disponible:available}}),
    removeProduct:({type,parentId,id})=>write({type,action:'delete_product',establishment_id:parentId,product_id:id,data:{}}),
  };
}

