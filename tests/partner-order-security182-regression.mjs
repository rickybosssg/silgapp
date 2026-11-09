import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../base44/functions/creerCommandePartenaire/entry.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'');
async function run(o={}) {
 const type=o.type||'boutique';let handler; const writes=[], pushes=[];
 const shop={id:'shop',actif:true,ouvert:true,pays_code:'BF',commission_pct:10,...o.shop};
 const client={id:'client',user_email:'fixture@example.test',country_code:'BF',...o.client};
 const product={id:'p1',boutique_id:'shop',restaurant_id:'shop',nom:'Catalogue',photo_url:'https://example.test/catalogue',prix:1000,actif:true,disponible:true,...o.product};
 const normal={Boutique:{get:async()=>{if(o.shopError)throw Error('RLS denied');return shop;}},Restaurant:{get:async()=>shop},ClientExterne:{filter:async()=>{if(o.profileError)throw Error('RLS denied');return o.noClient?[]:[client];}},ProduitBoutique:{get:async()=>{if(o.productError)throw Error('Read failed');return o.noProduct?null:product;}},PlatRestaurant:{get:async()=>product}};
 const privileged={Boutique:{get:async()=>shop},Restaurant:{get:async()=>shop},CommandeBoutique:{create:async row=>{writes.push(row);return {id:'order',...row};}},CommandeRestaurant:{create:async row=>{writes.push(row);return {id:'order',...row};}}};
 const sdk={entities:normal,auth:{me:async()=>o.noUser?null:{email:'fixture@example.test'}},asServiceRole:{entities:privileged},functions:{invoke:async(...args)=>pushes.push(args)}};
 vm.runInNewContext(source,{createClientFromRequest:()=>sdk,Deno:{serve:f=>{handler=f;}},Response,console:{log(){},error(){}}});
 const body={type,boutique_id:'shop',restaurant_id:'shop',items:[{id:'p1',prix:1000,quantite:1,nom:'Spoofed',photo_url:'spoof'}],total:1000,...o.body};
 const r=await handler({json:async()=>body});return {status:r.status,body:await r.json(),writes,pushes};
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
