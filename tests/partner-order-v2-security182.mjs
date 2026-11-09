import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import {validateCommerceOrderProof} from '../base44/shared/commercePaymentProof.js';
const source=ts.transpileModule(fs.readFileSync(new URL('../base44/functions/creerCommandePartenaireV2/entry.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const shared=['commerceSingletonJournal','commerceCreationHash'].map(n=>fs.readFileSync(new URL('../base44/shared/'+n+'.js',import.meta.url),'utf8').replace(/export /g,'')).join('\n');
async function run(o={}) {
 const type=o.type||'boutique';let handler; const writes=[], pushes=[];
 const shop={id:'shop',partenaire_id:'merchant',actif:true,ouvert:true,pays_code:'BF',commission_pct:10,...o.shop};
 const client={id:'client',user_email:'fixture@example.test',country_code:'BF',...o.client};
 const product={id:'p1',boutique_id:'shop',restaurant_id:'shop',nom:'Catalogue',photo_url:'https://example.test/catalogue',prix:1000,actif:true,disponible:true,...o.product};
 const normal={Boutique:{get:async()=>{if(o.shopError)throw Error('RLS denied');return shop;}},Restaurant:{get:async()=>shop},ClientExterne:{filter:async()=>{if(o.profileError)throw Error('RLS denied');return o.noClient?[]:o.duplicateClient?[client,client]:[client];}},ProduitBoutique:{get:async()=>{if(o.productError)throw Error('Read failed');return o.noProduct?null:product;}},PlatRestaurant:{get:async()=>product}};
 const privileged={Boutique:{get:async()=>shop},Restaurant:{get:async()=>shop},CommandeBoutique:{create:async row=>{writes.push(row);return {id:'order',...row};}},CommandeRestaurant:{create:async row=>{writes.push(row);return {id:'order',...row};}}};
 let proofReads=0;privileged.CommercePaymentProof={get:async()=>{proofReads++;return {id:'proof',provenance:'server_private_upload_v1',state:'ready',actor_user_id:'actor',client_id:'client',merchant_owner_id:'merchant',type,parent_id:'shop',country_code:'BF',upload_request_id:'upload',file_uri:'private/app/proof.png',...o.proof,...(o.proofChangeAfterRead&&proofReads>1?{merchant_owner_id:'changed'}:{})};}};
 let root={id:'journal',state:'ready',revision:0,ledger:'[]'};
 privileged.ProduitBoutique=normal.ProduitBoutique;privileged.PlatRestaurant=normal.PlatRestaurant;privileged.Boutique=normal.Boutique;
 privileged.CommerceMutationJournal={get:async()=>structuredClone(root),updateMany:async(q,p)=>{if(Object.keys(q).some(k=>root[k]!==q[k]))return {success:true,updated:0};Object.assign(root,p.$set);if(o.lostClaim)throw Error('lost receipt');return {success:true,updated:1};}};
 for(const name of ['CommandeBoutique','CommandeRestaurant']){privileged[name].get=async()=>({id:'order',...writes[0],...o.receipt});const create=privileged[name].create;privileged[name].create=async row=>{const result=await create(row);if(o.lostEffect)throw Error('lost create');return result;};}
 for(const name of ['Boutique','Restaurant','ProduitBoutique','PlatRestaurant'])normal[name]={get:async()=>{throw Error('Direct commerce reads denied');}};
 const sdk={entities:normal,auth:{me:async()=>{if(o.authError)throw o.authError;return o.noUser?null:{id:'actor',email:'fixture@example.test'};}},asServiceRole:{entities:privileged},functions:{invoke:async(...args)=>pushes.push(args)}};
 vm.runInNewContext(shared+'\n'+source,{validateCommerceOrderProof,createClientFromRequest:()=>sdk,crypto:webcrypto,TextEncoder,Deno:{env:{get:key=>key==='COMMERCE_PRIVATE_PROOFS_ENABLED'?(o.privateProofs?'true':undefined):(o.noJournal?undefined:'journal')},serve:f=>{handler=f;}},Response,console:{log(){},error(){}}});
 const body={request_id:'request-1',type,boutique_id:'shop',restaurant_id:'shop',items:[{id:'p1',prix:1000,quantite:1,nom:'Spoofed',photo_url:'spoof'}],total:1000,...o.body};
 const send=()=>handler({method:'POST',json:async()=>body});const responses=await Promise.all(Array.from({length:o.concurrent||1},send));const r=responses[0];const replay=o.replay?await send():null;return {status:r.status,body:await r.json(),writes,pushes,statuses:responses.map(r=>r.status),replay:replay?{status:replay.status,body:await replay.json()}:null};
}
for(const type of ['boutique','restaurant'])test(`${type}: authoritative catalogue replaces names and photos`,async()=>{const r=await run({type});assert.equal(r.status,200);const items=JSON.parse(r.writes[0].items);assert.equal(items[0].nom,'Catalogue');assert.equal(items[0].photo_url,'https://example.test/catalogue');assert.equal(r.writes[0].total,1000);assert.equal(r.writes[0].commission_montant,100);assert.equal(r.pushes.length,1);});
const cases=[
 ['unauthenticated',{noUser:true},401],['missing profile',{noClient:true},404],['RLS profile failure',{profileError:true},500],['RLS shop failure',{shopError:true},500],
 ['foreign owner',{client:{user_email:'other@example.test'}},403],['inactive profile',{client:{actif:false}},403],
 ['missing country',{client:{country_code:null}},403],['foreign country',{client:{country_code:'CI'}},403],
 ['inactive shop',{shop:{actif:false}},400],['closed shop',{shop:{ouvert:false}},400],
 ['empty basket',{body:{items:[]}},400],['non array basket',{body:{items:{}}},400],
 ['invalid total',{body:{total:-1}},400],['string total',{body:{total:'1000'}},400],['forged total',{body:{total:1}},409],
 ['missing product',{noProduct:true},409],['catalogue read failure',{productError:true},500],
 ['foreign shop item',{product:{boutique_id:'other'}},409],['foreign restaurant item',{type:'restaurant',product:{restaurant_id:'other'}},409],
 ['wrong returned id',{product:{id:'other'}},409],['inactive item',{product:{actif:false}},409],['unavailable item',{product:{disponible:false}},409],
 ['missing active flag',{product:{actif:undefined}},409],['negative catalogue price',{product:{prix:-1}},409],['string catalogue price',{product:{prix:'1000'}},409],
 ['changed catalogue price',{product:{prix:2000}},409],['negative commission',{shop:{commission_pct:-1}},400],['over 100 commission',{shop:{commission_pct:101}},400],['string commission',{shop:{commission_pct:'10'}},400],['non finite commission',{shop:{commission_pct:Infinity}},400],
];
for(const [label,o,status]of cases)test(label,async()=>{const r=await run(o);assert.equal(r.status,status);assert.equal(r.writes.length,0);assert.equal(r.pushes.length,0);});
for(const q of [0,-1,1.5,'1',null,Number.MAX_SAFE_INTEGER+1])test(`invalid quantity ${q}`,async()=>{const r=await run({body:{items:[{id:'p1',prix:1000,quantite:q}]}});assert.equal(r.status,400);assert.equal(r.writes.length,0);});
test('duplicate product lines rejected',async()=>{const item={id:'p1',prix:1000,quantite:1};const r=await run({body:{items:[item,item],total:2000}});assert.equal(r.status,400);assert.equal(r.writes.length,0);});
test('free product and zero commission preserved',async()=>{const r=await run({product:{prix:0},shop:{commission_pct:0},body:{items:[{id:'p1',prix:0,quantite:2}],total:0}});assert.equal(r.status,200);assert.equal(r.writes[0].total,0);assert.equal(r.writes[0].commission_montant,0);});
test('safe quantities calculated from catalogue',async()=>{const r=await run({body:{items:[{id:'p1',prix:1000,quantite:3}],total:3000}});assert.equal(r.status,200);assert.equal(r.writes[0].commission_montant,300);});
test('unsafe total rejected without writes',async()=>{const r=await run({body:{items:[{id:'p1',prix:1000,quantite:Number.MAX_SAFE_INTEGER}],total:1000*Number.MAX_SAFE_INTEGER}});assert.equal(r.status,400);assert.equal(r.writes.length,0);});

test('stable replay creates once and does not push twice',async()=>{const r=await run({replay:true});assert.equal(r.status,200);assert.equal(r.replay.status,200);assert.equal(r.replay.body.replayed,true);assert.equal(r.writes.length,1);assert.equal(r.pushes.length,1);});
test('concurrent identical requests create at most once',async()=>{const r=await run({concurrent:12});assert.equal(r.writes.length,1);assert.equal(r.pushes.length,1);assert.ok(r.statuses.every(s=>s===200||s===503));});
for(const option of ['lostClaim','lostEffect'])test(option+' never repeats uncertain effect',async()=>{const r=await run({[option]:true,replay:true});assert.equal(r.status,503);assert.equal(r.replay.status,503);assert.equal(r.writes.length,option==='lostEffect'?1:0);});
test('legacy caller rejected without writes',async()=>{const r=await run({body:{request_id:undefined}});assert.equal(r.status,400);assert.equal(r.body.error,'REQUEST_ID_REQUIRED');assert.equal(r.writes.length,0);});
test('missing journal refuses create',async()=>{const r=await run({noJournal:true});assert.equal(r.status,503);assert.equal(r.writes.length,0);});
test('foreign receipt never disclosed',async()=>{const r=await run({receipt:{client_id:'other'}});assert.equal(r.status,403);assert.equal(r.body.creation_recorded,true);assert.equal(r.body.commande,undefined);});
test('wrong returned shop ID rejected',async()=>{const r=await run({shop:{id:'other'}});assert.equal(r.status,404);assert.equal(r.writes.length,0);});

test('duplicate client profile denied',async()=>{const r=await run({duplicateClient:true});assert.equal(r.status,403);assert.equal(r.writes.length,0);});
test('enterprise profile denied',async()=>{const r=await run({client:{enterprise_id:'enterprise'}});assert.equal(r.status,403);assert.equal(r.writes.length,0);});

test('201 items rejected before catalogue I/O',async()=>{const r=await run({productError:true,body:{items:Array.from({length:201},(_,i)=>({id:'p'+i,prix:1000,quantite:1})),total:201000}});assert.equal(r.status,400);assert.equal(r.writes.length,0);});
for(const [field,values] of [['gps_lat',[-91,91,'0',NaN,Infinity,{},true]],['gps_lng',[-181,181,'0',NaN,-Infinity,[],false]]])for(const value of values)test('invalid GPS '+field+' '+String(value),async()=>{const r=await run({body:{[field]:value}});assert.equal(r.status,400);assert.equal(r.body.error,'INVALID_GPS_COORDINATES');assert.equal(r.writes.length,0);});
for(const [lat,lng] of [[0,0],[-90,-180],[90,180],[null,null],[undefined,undefined]])test('valid GPS '+lat+'/'+lng,async()=>{const r=await run({body:{gps_lat:lat,gps_lng:lng}});assert.equal(r.status,200);assert.equal(r.writes[0].gps_lat,lat??null);assert.equal(r.writes[0].gps_lng,lng??null);});
for(const option of ['profileError','shopError','productError'])test('internal error redacted '+option,async()=>{const r=await run({[option]:true});assert.equal(r.status,500);assert.equal(r.body.error,'ORDER_FAILED');});

for(const status of [401,403])for(const shape of ['status','response'])test('auth SDK '+status+' '+shape+' redacted',async()=>{const error=Object.assign(new Error('private SDK detail'),shape==='status'?{status}:{response:{status}});const r=await run({authError:error});assert.equal(r.status,status);assert.equal(r.body.error,status===401?'AUTH_REQUIRED':'FORBIDDEN');assert.equal(r.writes.length,0);assert.equal(r.pushes.length,0);});
test('unknown auth SDK error stays generic500',async()=>{const r=await run({authError:new Error('private SDK detail')});assert.equal(r.status,500);assert.equal(r.body.error,'ORDER_FAILED');assert.equal(r.writes.length,0);});

for(const type of ['boutique','restaurant'])test(type+' private proof persists only protected provenance ID',async()=>{const r=await run({type,privateProofs:true,body:{proof_id:'proof'}});assert.equal(r.status,200);assert.equal(r.writes[0].commerce_payment_proof_id,'proof');assert.equal(r.writes[0].preuve_paiement_url,'');assert.equal(JSON.stringify(r.body).includes('private/'),false);});
for(const [name,o,status] of [['gate absent',{},503],['conflicting public URL',{privateProofs:true,body:{preuve_paiement_url:'https://external.invalid'}},400],['empty proof ID',{privateProofs:true,body:{proof_id:''}},400],['foreign actor',{privateProofs:true,proof:{actor_user_id:'other'}},403],['foreign client',{privateProofs:true,proof:{client_id:'other'}},403],['foreign parent',{privateProofs:true,proof:{parent_id:'other'}},403],['foreign country',{privateProofs:true,proof:{country_code:'CI'}},403],['owner changed',{privateProofs:true,proof:{merchant_owner_id:'other'}},403],['forged provenance',{privateProofs:true,proof:{provenance:'client'}},403],['foreign URI',{privateProofs:true,proof:{file_uri:'https://external.invalid'}},503]])test('private proof refuses '+name,async()=>{const r=await run({...o,body:{proof_id:'proof',...o.body}});assert.equal(r.status,status);assert.equal(r.writes.length,0);assert.equal(r.pushes.length,0);});
test('private proof rechecked before order effect after reservation',async()=>{const r=await run({privateProofs:true,body:{proof_id:'proof'},proofChangeAfterRead:true});assert.equal(r.status,503);assert.equal(r.writes.length,0);assert.equal(r.pushes.length,0);assert.equal(r.body.uncertain,true);});
test('dropped proof field is not confirmed after order creation',async()=>{const r=await run({privateProofs:true,body:{proof_id:'proof'},receipt:{commerce_payment_proof_id:undefined}});assert.equal(r.status,403);assert.equal(r.writes.length,1);assert.equal(r.body.creation_recorded,true);assert.equal(r.pushes.length,0);});
