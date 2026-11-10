import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import { proofUser, proofClient, proofKind, proofId, privateProofUri, proofFail } from '../../shared/commercePaymentProof.js';
// Prepared only. No provisioning, deployment or frontend activation implied.
async function boundedProofForm(req: Request) {
  const maximum = 6 * 1024 * 1024;
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;') || !req.body) proofFail('INVALID_PROOF_MULTIPART',400);
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximum) proofFail('PROOF_BODY_TOO_LARGE',413);
  const reader = req.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.byteLength;
      if (length > maximum) { await reader.cancel().catch(()=>{}); proofFail('PROOF_BODY_TOO_LARGE',413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  try { return await new Response(bytes,{headers:{'Content-Type':contentType}}).formData(); }
  catch { proofFail('INVALID_PROOF_MULTIPART',400); }
}
Deno.serve(async(req)=>{
  const headers={'Cache-Control':'no-store'};
  if(req.method!=='POST')return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405,headers});
  let uploadAttempted=false;
  try{
    const api=createClientFromRequest(req);const user=await api.auth.me();proofUser(user);
    if(Deno.env.get('COMMERCE_PRIVATE_PROOFS_ENABLED')!=='true')proofFail('PRIVATE_PROOFS_NOT_ENABLED',503);
    const client=await proofClient(api,user);
    const form=await boundedProofForm(req);
    if([...form.keys()].some(k=>!['file','type','parent_id','upload_request_id'].includes(k))
      ||['file','type','parent_id','upload_request_id'].some(k=>form.getAll(k).length!==1))proofFail('INVALID_REQUEST',400);
    const type=form.get('type');const[parentEntity]=proofKind(type);
    const parentId=proofId(form.get('parent_id'));const uploadRequestId=proofId(form.get('upload_request_id'));
    const parent=await api.asServiceRole.entities[parentEntity].get(parentId);
    if(!parent||parent.id!==parentId||parent.enterprise_id||parent.pays_code!==client.country_code||!parent.partenaire_id||parent.actif!==true)proofFail('PROOF_FORBIDDEN');
    const file=form.get('file');
    if(!(file instanceof File)||file.size<1||file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))proofFail('INVALID_PROOF_FILE',400);
    const bytes=new Uint8Array(await file.arrayBuffer());
    const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
    const jpg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    if(!(file.type==='image/png'&&png||file.type==='image/jpeg'&&jpg||file.type==='image/webp'&&webp))proofFail('INVALID_PROOF_FILE',400);
    const extensions: Record<string,string> = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
    const uploadFile=new File([bytes],'payment-proof.'+extensions[file.type],{type:file.type});
    uploadAttempted=true;
    const uploaded=await api.asServiceRole.integrations.Core.UploadPrivateFile({file:uploadFile});
    const fileUri=privateProofUri(uploaded?.file_uri);
    const row={provenance:'server_private_upload_v1',state:'ready',actor_user_id:user.id,client_id:client.id,
      merchant_owner_id:parent.partenaire_id,type,parent_id:parentId,country_code:client.country_code,
      upload_request_id:uploadRequestId,file_uri:fileUri,mime_type:file.type,byte_size:file.size};
    const stored=await api.asServiceRole.entities.CommercePaymentProof.create(row);
    if(!stored?.id||Object.entries(row).some(([k,v])=>stored[k]!==v))proofFail('PROOF_UPLOAD_UNCONFIRMED',503);
    return Response.json({success:true,proof_id:stored.id,mime_type:row.mime_type,byte_size:row.byte_size},{headers});
  }catch(error){
    const e=error as {code?:string,status?:number};
    const known=['AUTH_REQUIRED','PROOF_FORBIDDEN','INVALID_ID','INVALID_TYPE','INVALID_REQUEST','INVALID_PROOF_FILE','INVALID_PROOF_MULTIPART','PROOF_BODY_TOO_LARGE','PRIVATE_PROOFS_NOT_ENABLED'];
    return Response.json({success:false,error:known.includes(e?.code||'')?e.code:'PROOF_UPLOAD_UNCONFIRMED',uncertain:uploadAttempted},
      {status:known.includes(e?.code||'')&&e.status?e.status:503,headers});
  }
});
