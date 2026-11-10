import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import { authorizedCommerceProof, proofUser, proofFail } from '../../shared/commercePaymentProof.js';
import { resolveCommerceAdminScope } from '../../shared/commerceAdminGrant.js';
// Prepared only. Historical public URLs are never fetched or signed.
Deno.serve(async(req)=>{
  const headers={'Cache-Control':'no-store'};
  if(req.method!=='POST')return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405,headers});
  try{
    const api=createClientFromRequest(req);const user=await api.auth.me();proofUser(user);
    if(Deno.env.get('COMMERCE_PRIVATE_PROOFS_ENABLED')!=='true')proofFail('PRIVATE_PROOFS_NOT_ENABLED',503);
    const body=await req.json();
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['type','commande_id'].includes(k)))proofFail('INVALID_REQUEST',400);
    const adminScope=user.role==='admin'?resolveCommerceAdminScope(user,Deno.env.get('COMMERCE_ADMIN_GRANTS_JSON')):null;
    const proof=await authorizedCommerceProof({api,user,type:body.type,orderId:body.commande_id,adminScope});
    const signed=await api.asServiceRole.integrations.Core.CreateFileSignedUrl({file_uri:proof.file_uri,expires_in:60});
    if(typeof signed?.signed_url!=='string')proofFail('PROOF_READ_UNAVAILABLE',503);
    const parsed=new URL(signed.signed_url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)proofFail('PROOF_READ_UNAVAILABLE',503);
    return Response.json({success:true,commande_id:body.commande_id,signed_url:signed.signed_url,expires_in:60},{headers});
  }catch(error){
    const e=error as {code?:string,status?:number};
    const known=['AUTH_REQUIRED','PROOF_FORBIDDEN','PROOF_NOT_FOUND','PRIVATE_PROOF_UNAVAILABLE','INVALID_ID','INVALID_TYPE','INVALID_REQUEST','PRIVATE_PROOFS_NOT_ENABLED','TRUSTED_ADMIN_SCOPE_REQUIRED','ADMIN_COUNTRY_FORBIDDEN','ADMIN_REQUIRED'];
    return Response.json({error:known.includes(e?.code||'')?e.code:'PROOF_READ_UNAVAILABLE'},
      {status:known.includes(e?.code||'')&&e.status?e.status:503,headers});
  }
});
