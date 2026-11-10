// INACTIVE MIGRATION PREPARATION: no frontend consumer, no production deployment.
// Requires coordinated entity RLS restrictions before it can secure direct SDK writes.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import { createCommerceSingletonJournal } from '../../shared/commerceJournal.js';
import { hashCommerceCreation } from '../../shared/commerceCreationHash.js';
import { resolveCommerceAdminScope } from '../../shared/commerceAdminGrant.js';
import { countryChangeRequest, adminFor, deny, ownerProfile, accessShop, creationFields, shopPatch, productPatch, commissionPatch, moderationPatch } from '../../shared/commerceAccess.js';
function caughtCommerceError(error: unknown): {code?:string,status?:number} {
  if(!error||typeof error!=='object')return {};
  return {
    ...('code' in error&&typeof error.code==='string'?{code:error.code}:{}),
    ...('status' in error&&typeof error.status==='number'?{status:error.status}:{}),
  };
}
Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({success:false,error:'METHOD_NOT_ALLOWED',uncertain:false},{status:405,headers:{'Allow':'POST','Cache-Control':'no-store'}});
  let writeStarted = false;
  let creationRecorded = false;
  try {
    const sdk=createClientFromRequest(req);const user=await sdk.auth.me();
    if(!user?.id||!user?.email) deny('AUTH_REQUIRED',401);
    const adminScope=user.role==='admin'?resolveCommerceAdminScope(user,Deno.env.get('COMMERCE_ADMIN_GRANTS_JSON')):null;
    const body=await req.json();
    if(!body || typeof body!=='object' || Array.isArray(body)) deny('INVALID_REQUEST',400);
    const allowed=['type','action','establishment_id','product_id','data','request_id'];
    if(Object.keys(body).some(k=>!allowed.includes(k))) deny('FORBIDDEN_REQUEST_FIELD',400);
    const {type,action,establishment_id,product_id,data,request_id}=body;
    if(!['boutique','restaurant'].includes(type)) deny('INVALID_TYPE',400);
    if(!['create_establishment','update_establishment','create_product','update_product','delete_product','set_commission','moderate_establishment','moderate_product','acknowledge_creation','change_country'].includes(action)) deny('INVALID_ACTION',400);
    const shopEntity=type==='boutique'?'Boutique':'Restaurant';const productEntity=type==='boutique'?'ProduitBoutique':'PlatRestaurant';const parentKey=type==='boutique'?'boutique_id':'restaurant_id';
    const sr=sdk.asServiceRole.entities;
    let profile=null;
    if(user.role!=='admin' && action==='create_establishment' && type==='restaurant') {
      const rows=await sdk.entities.ClientExterne.filter({user_email:user.email});
      if(!Array.isArray(rows)||rows.length>1) deny('OWNER_PROFILE_AMBIGUOUS');
      if(rows.length===0) deny('OWNER_COUNTRY_REQUIRED');
      profile=rows[0];ownerProfile(user,profile);
    }
    let shop=null;
    if(action!=='create_establishment') {
      if(typeof establishment_id!=='string'||!establishment_id.trim()) deny('ESTABLISHMENT_REQUIRED',400);
      // Bootstrap exact-ID read after authentication, then mandatory owner/admin-country check.
      // Target architecture denies direct entity reads; verify this boundary in live role tests.
      shop=await sr[shopEntity].get(establishment_id);
      if(shop?.id!==establishment_id) deny('ESTABLISHMENT_NOT_FOUND',404);
      accessShop(user,shop,profile,{catalogue:action.includes('product'),adminScope});
      if(user.role!=='admin' && type==='restaurant' && shop.validation!=='valide') deny('RESTAURANT_APPROVAL_REQUIRED');
    } else if(establishment_id || product_id) deny('UNEXPECTED_ID',400);
    let entity=shopEntity, id=establishment_id;
    let patch: Record<string,unknown> = {};
    if(action==='create_establishment') {
      patch=creationFields(type,user,profile,data);
      const countries=await sdk.entities.Country.filter({code:patch.pays_code,actif:true});
      if(!countries?.some(c=>c.code===patch.pays_code&&c.actif===true)) deny('COUNTRY_UNAVAILABLE',400);
    } else if(action==='update_establishment') patch=shopPatch(type,data);
    else if(action==='set_commission') patch=commissionPatch(user,shop,data,adminScope);
    else if(action==='moderate_establishment') patch=moderationPatch(user,shop,data,new Date().toISOString(),false,adminScope);
    else if(action==='change_country') {
      const nextCountry=countryChangeRequest(user,shop,type,data,adminScope);
      if(nextCountry===shop.pays_code) return Response.json({success:true,record:shop,unchanged:true});
      const targets=await sdk.entities.Country.filter({code:nextCountry,actif:true});
      if(!targets?.some(c=>c.code===nextCountry&&c.actif===true)) deny('COUNTRY_UNAVAILABLE',400);
      // Existence checks only: never rewrite catalogue, orders, balances or history.
      const related=await Promise.all([
        sr.ProduitBoutique.filter({boutique_id:shop.id},'-created_date',1),
        sr.CommandeBoutique.filter({boutique_id:shop.id},'-created_date',1),
        sr.PaiementPartenaire.filter({etablissement_id:shop.id},'-created_date',1),
      ]);
      if(related.some(rows=>!Array.isArray(rows))) deny('COUNTRY_ACTIVITY_UNVERIFIED',503);
      if(related.some(rows=>rows.length>0)||Number(shop.montant_du_silga||0)!==0||Number(shop.nb_visites||0)!==0||shop.derniere_visite_at) deny('COUNTRY_CHANGE_HAS_ACTIVITY',409);
      // Empty reads do NOT exclude concurrent activity or hidden/deleted history.
      // A coordinated freeze and durable reservation are required before implementing the write.
      deny('COUNTRY_CHANGE_REQUIRES_COORDINATED_FREEZE',409);
    }
    else if(action==='acknowledge_creation') {
      adminFor(user,shop.pays_code,adminScope);
      if(type!=='boutique'||shop.creation_directe!==true) deny('INVALID_CREATION_ACK',400);
      if(data && Object.keys(data).length) deny('FORBIDDEN_FIELD',400);
      if(shop.creation_admin_notifiee===true) return Response.json({success:true,record:shop,already_acknowledged:true});
      patch={creation_admin_notifiee:true};
    } else {
      entity=productEntity;
      if(action==='create_product') {
        if(product_id) deny('UNEXPECTED_ID',400);
        patch={...productPatch(data,true),[parentKey]:shop.id,actif:true,...(type==='boutique'?{validation:'en_attente'}:{})};
      } else {
        if(typeof product_id!=='string'||!product_id.trim()) deny('PRODUCT_REQUIRED',400);
        // Parent already authorized. Service read is only for this parent's product.
        const product=await sr[productEntity].get(product_id);
        if(!product||product.id!==product_id||product[parentKey]!==shop.id) deny('PRODUCT_PARENT_MISMATCH');
        id=product.id;
        if(action==='update_product') patch=productPatch(data);
        else if(action==='moderate_product') {
          if(type!=='boutique') deny('RESTAURANT_PRODUCT_MODERATION_NOT_SUPPORTED',400);
          patch=moderationPatch(user,shop,data,new Date().toISOString(),true,adminScope);
        } else if(data && Object.keys(data).length) deny('UNEXPECTED_DELETE_DATA',400);
      }
    }
    if(action==='delete_product') { writeStarted=true; await sr[entity].delete(id);return Response.json({success:true,id,deleted:true}); }
    if(!patch||!Object.keys(patch).length) deny('EMPTY_PATCH',400);
    if(action.startsWith('create_')) {
      if(typeof request_id!=='string'||!request_id.trim()||request_id.length>200) deny('REQUEST_ID_REQUIRED',400);
      const singletonId=Deno.env.get('COMMERCE_MUTATION_JOURNAL_ID');
      if(typeof singletonId!=='string'||!singletonId.trim()) deny('COMMERCE_JOURNAL_NOT_PROVISIONED',503);
      const creationCountry=shop?.pays_code||patch.pays_code;
      const expected: Record<string,string>={request_id,actor_id:user.id,scope_id:creationCountry+':'+(shop?.id||user.id),operation:action+':'+type,
        payload_hash:await hashCommerceCreation({actor_id:user.id,operation:action,type,parent_id:shop?.id||null,country_code:creationCountry,patch})};
      const journal=createCommerceSingletonJournal({storage:sr.CommerceMutationJournal,singletonId,
        authorize:async (candidate: Record<string,string>)=>Object.keys(expected).every(key=>candidate[key]===expected[key]),
        newClaimId:()=>crypto.randomUUID()});
      let result;
      try {
        result=await journal.execute(expected,async()=>{
          if(shop) {
            const freshParent=await sr[shopEntity].get(shop.id);
            if(freshParent?.id!==shop.id)deny('CREATION_PARENT_CHANGED');
            accessShop(user,freshParent,profile,{catalogue:true,adminScope});
            if(freshParent.pays_code!==creationCountry)deny('CREATION_PARENT_CHANGED');
            if(user.role!=='admin'&&type==='restaurant'&&freshParent.validation!=='valide')deny('RESTAURANT_APPROVAL_REQUIRED');
          }
          writeStarted=true;
          const created=await sr[entity].create(patch);
          if(!created?.id)throw Error('WRITE_RECEIPT_INVALID');
          return {result_id:created.id};
        });
      } catch(e) {
        if(caughtCommerceError(e).code==='REQUEST_BINDING_CONFLICT') deny('REQUEST_BINDING_CONFLICT',409);
        throw e;
      }
      if(!('result_id' in result)||typeof result.result_id!=='string'||!result.result_id||!['completed','replay_receipt'].includes(result.decision)) {
        return Response.json({success:false,error:'CREATION_RECONCILIATION_REQUIRED',reason:'reason' in result?result.reason:'RECEIPT_MISSING',uncertain:true},{status:503});
      }
      creationRecorded=true;
      // A stored ID is not authorization. Always reload result and current owner/country.
      const saved=await sr[entity].get(result.result_id);
      if(!saved||saved.id!==result.result_id)throw Error('CREATION_RECEIPT_UNAVAILABLE');
      if(action==='create_establishment') {
        accessShop(user,saved,profile,{adminScope});
        if(saved.partenaire_id!==user.id||saved.pays_code!==creationCountry)deny('CREATION_RECEIPT_FORBIDDEN');
      } else {
        const currentParent=await sr[shopEntity].get(shop.id);
        if(currentParent?.id!==shop.id)deny('CREATION_PARENT_CHANGED');
        accessShop(user,currentParent,profile,{catalogue:true,adminScope});
        if(currentParent.pays_code!==creationCountry||saved[parentKey]!==currentParent.id)deny('CREATION_RECEIPT_FORBIDDEN');
      }
      return Response.json({success:true,record:saved,replayed:result.decision==='replay_receipt'});
    }
    writeStarted=true;
    const saved=await sr[entity].update(id,patch);
    if(!saved?.id||(!action.startsWith('create_')&&saved.id!==id)) throw Error('WRITE_RECEIPT_INVALID');
    return Response.json({success:true,record:saved});
  } catch(e) {
    // Never retry an uncertain mutation. Caller must reconcile before trying again.
    const error=caughtCommerceError(e);
    const status=writeStarted?503:error.status||503;
    return Response.json({success:false,error:writeStarted?'WRITE_OUTCOME_UNCERTAIN':error.code||(creationRecorded?'CREATION_RECEIPT_UNAVAILABLE':'COMMERCE_UNAVAILABLE'),uncertain:writeStarted||creationRecorded,...(creationRecorded?{creation_recorded:true}:{})}, {status});
  }
});
