import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describeCityPolicy, readCityPolicySummary} from '../base44/shared/cityPolicySummary.js';
import {currentDriverGpsCity} from '../base44/shared/currentGpsCity.js';
import {verifyCityCompatibility, verifyCurrentCityAtClaim} from '../base44/shared/cityDispatchFilter.ts';
import {invalidateOperationalCityCache} from '../base44/shared/operationalZones.ts';
import {invalidateQuartierCache} from '../base44/shared/cityResolution.ts';

const cities = [{country_code:'BF', nom:'koudougou', actif:true, communes_rattachees:'["Koudougou"]'},
  {country_code:'BF', nom:'ouagadougou', actif:false, communes_rattachees:'["Ouagadougou","Saaba"]'}];
const quartiers = [{country_code:'BF', ville:'Koudougou', latitude:12.25, longitude:-2.37}];
const driver = {id:'d',country_code:'BF',user_email:'driver@example.test',enterprise_id:null,
  ville:'Ouagadougou',latitude:12.25,longitude:-2.37,gps_accuracy:20,gps_fix_valid:true,gps_fix_date:new Date().toISOString()};
const course = {id:'c',country_code:'BF',ville_depart:'Koudougou',enterprise_id:null,statut:'recherche_livreur'};
const reset = () => { invalidateOperationalCityCache(); invalidateQuartierCache(); };
const api = (configured=cities, current=driver) => ({auth:{me:async()=>({email:'driver@example.test'})},asServiceRole:{entities:{
  OperationalCity:{filter:async()=>configured},Quartier:{filter:async()=>quartiers},Livreur:{get:async()=>current}
}}});

test('third dynamically configured town is resolved from GPS, not the profile', async()=>{
  reset(); assert.equal(currentDriverGpsCity(driver,cities,quartiers),'koudougou');
  assert.equal((await verifyCityCompatibility(api(),course,driver)).compatible,true);
  assert.equal((await verifyCityCompatibility(api(),course,{...driver,latitude:12.37,longitude:-1.52})).compatible,false);
});
for (const [name, configured, flag, enabled, conflict] of [
  ['all OFF',cities.map(c=>({...c,actif:false})),'false',false,false],
  ['active city and country ON',cities,'true',true,false],
  ['active city and country OFF',cities,'false',true,true],
  ['all cities OFF and old country ON',cities.map(c=>({...c,actif:false})),'true',false,true],
]) test(`actual configuration summary: ${name}`,()=>{
  const snapshot=JSON.stringify(configured);
  const result=describeCityPolicy(configured,[{cle:'CITY_DISPATCH_ENABLED:BF',valeur:flag}],'BF');
  assert.equal(result.enabled,enabled); assert.equal(result.conflicts.includes('country_city_activation_conflict'),conflict);
  assert.equal(JSON.stringify(configured),snapshot,'saved activations are never rewritten');
});
test('invalid or contradictory duplicate country settings are exposed',()=>{
  const config=value=>({cle:'CITY_DISPATCH_ENABLED:BF',valeur:value});
  for(const values of [['true','false'],['yes']])
    assert.ok(describeCityPolicy(cities,values.map(config),'BF').conflicts.includes('invalid_country_flag'));
  assert.equal(describeCityPolicy(cities,[],'BF').countryFlag,null);
});
test('summary scopes reads to exact country; missing data is not a false OFF',async()=>{
  const calls=[];
  const entities={OperationalCity:{filter:async q=>{calls.push(q);return cities;}},
    AppConfig:{filter:async q=>{calls.push(q);return [];}}};
  assert.equal((await readCityPolicySummary(entities,'bf')).enabled,true);
  assert.deepEqual(calls,[{country_code:'BF'},{cle:'CITY_DISPATCH_ENABLED:BF'}]);
  await assert.rejects(readCityPolicySummary({...entities,OperationalCity:{filter:async()=>{throw Error('unavailable');}}},'BF'),/unavailable/);
  assert.equal(describeCityPolicy([...cities,{country_code:'CI',nom:'abidjan',actif:true}],[],'BF').activeCities.includes('abidjan'),false);
});
test('deactivating a dynamically added city restores historical eligibility',async()=>{
  reset(); const unknown={...driver,gps_fix_valid:false};
  assert.equal((await verifyCityCompatibility(api(),course,unknown)).compatible,false);
  reset(); assert.equal((await verifyCityCompatibility(api(cities.map(c=>({...c,actif:false}))),course,unknown)).compatible,true);
});

test('actual acceptance rechecks activation even when an earlier OFF policy was cached',async()=>{
  reset();const configured=cities.map(c=>({...c,actif:false}));
  const unknown={...driver,gps_fix_valid:false},sdk=api(configured,unknown);
  assert.equal((await verifyCityCompatibility(sdk,course,unknown)).compatible,true);
  configured[0].actif=true;
  assert.equal((await verifyCurrentCityAtClaim(sdk,course,unknown)).compatible,false);
  configured[0].actif=false;
  assert.equal((await verifyCurrentCityAtClaim(sdk,course,unknown)).compatible,true);
});

test('real on-route acceptance preserves country isolation when every city is OFF',async()=>{
  reset();const {respondToOnRouteProposal}=await import('../base44/shared/ecoOptimizationEngine.ts');
  const sdk=api([],{...driver,validation:'valide',actif:true});let writes=0;
  sdk.asServiceRole.entities.EcoProposal={get:async()=>({id:'p',livreur_id:'d',course_id:'c',status:'pending',expires_at:new Date(Date.now()+30000).toISOString()}),update:async()=>{writes++;}};
  sdk.asServiceRole.entities.CourseExterne={get:async()=>({...course,country_code:'CI'}),updateMany:async()=>{writes++;}};
  const result=await respondToOnRouteProposal(sdk,'p','d','accept');
  assert.equal(result.reason,'country_mismatch');assert.equal(writes,0);
});

test('real GPS hook preserves acquisition for stationary fixes, missing and late timestamps',()=>{
  const source=readFileSync('src/hooks/useGPSNatif.js','utf8');
  const tree=ts.createSourceFile('hook.js',source,ts.ScriptTarget.Latest,true);
  let callback;
  function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='applyPosition') callback=node.initializer.arguments[0].getText(tree);ts.forEachChild(node,visit);}
  visit(tree); assert.ok(callback);
  const lastPosRef={current:null},lastValidPosTimeRef={current:null},lastPositionTimeRef={current:null}, updates=[];
  const apply=new Function('lastPosRef','lastValidPosTimeRef','lastPositionTimeRef','setPosition','setGpsActif','setAgeMinutes','onPosition',
    'FALLBACK_DELAY_MS','ACCURACY_THRESHOLD',`return (${callback});`)(lastPosRef,lastValidPosTimeRef,lastPositionTimeRef,
      p=>updates.push(p),()=>{},()=>{},null,60000,200);
  const coords={latitude:12.25,longitude:-2.37,accuracy:20};
  const old=Date.now()-300000;
  assert.equal(apply(coords,old).timestamp,old);
  const fresh=Date.now()-1000;
  assert.equal(apply(coords,fresh).timestamp,fresh,'stationary fresh fix reaches heartbeat');
  assert.equal(apply(coords,old).timestamp,fresh,'late acquisition cannot replace newer proof');
  assert.equal(updates.length,2);
  assert.equal(apply(coords,undefined).timestamp,null,'no receipt time invented');
  for(const [pattern,label] of [[/applyPosition\(result\.coords, result\.timestamp\)/g,'native'],[/applyPosition\(pos\.coords, pos\.timestamp\)/g,'web']])
    assert.equal([...source.matchAll(pattern)].length,2,label);
});

function proposalHandler(base44){
  const source=readFileSync('base44/functions/getOnRouteProposalsForLivreur/entry.ts','utf8');
  const tree=ts.createSourceFile('handler.ts',source,ts.ScriptTarget.Latest,true);
  const code=tree.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(tree)).join('\n')
    .replaceAll("'../../shared/","'"+new URL('../base44/shared/',import.meta.url).href);
  let handler;
  new Function('Deno','createClientFromRequest',ts.transpile(code,{target:ts.ScriptTarget.ES2022}))({serve:fn=>handler=fn},()=>base44);
  return handler;
}
const request=()=>new Request('https://isolated.invalid',{method:'POST',body:JSON.stringify({livreur_id:'d'})});
test('real on-route getter authenticates before service-role reads and checks ownership',async()=>{
  let reads=0;
  const sdk=api(); sdk.auth.me=async()=>null;sdk.asServiceRole.entities.Livreur.get=async()=>{reads++;return driver;};
  assert.equal((await proposalHandler(sdk)(request())).status,401);assert.equal(reads,0);
  sdk.auth.me=async()=>({email:'other@example.test'});
  assert.equal((await proposalHandler(sdk)(request())).status,403);assert.equal(reads,1);
});
test('real on-route getter hides failed GPS/config checks without expiring pending offers',async()=>{
  for(const failConfig of [false,true]){
    reset(); const sdk=api(cities,{...driver,gps_fix_valid:false}); let writes=0;
    if(failConfig)sdk.asServiceRole.entities.OperationalCity.filter=async()=>{throw Error('isolated configuration failure');};
    sdk.asServiceRole.entities.EcoProposal={filter:async query=>query.is_exclusive ? [] : [{id:'p',course_id:'c',status:'pending',expires_at:new Date(Date.now()+30000).toISOString()}],updateMany:async()=>{writes++;}};
    sdk.asServiceRole.entities.CourseExterne={filter:async()=>[course]};
    const response=await proposalHandler(sdk)(request());
    assert.equal(response.status,200);assert.deepEqual((await response.json()).proposals,[]);assert.equal(writes,0);
  }
});

test('real admin handler creates arbitrary cities, retains other countries, and exposes flag conflicts',async()=>{
  const source=readFileSync('base44/functions/manageOperationalCity/entry.ts','utf8');
  const tree=ts.createSourceFile('admin.ts',source,ts.ScriptTarget.Latest,true);
  const code=tree.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(tree)).join('\n')
    .replaceAll("'../../shared/","'"+new URL('../base44/shared/',import.meta.url).href);
  const saved=[{id:'ci',country_code:'CI',nom:'abidjan',actif:false}];
  let role='admin',handler;
  const sdk={auth:{me:async()=>({role,email:'admin@example.test'})},asServiceRole:{entities:{
    OperationalCity:{filter:async q=>saved.filter(c=>c.country_code===q.country_code&&(!q.nom||c.nom===q.nom)),
      create:async patch=>{const city={...patch,id:'new'};saved.push(city);return city;},
      update:async(id,patch)=>Object.assign(saved.find(c=>c.id===id),patch)},
    AppConfig:{filter:async()=>[{cle:'CITY_DISPATCH_ENABLED:BF',valeur:'false'}]}
  }}};
  new Function('Deno','createClientFromRequest','describeCityPolicy',ts.transpile(code,{target:ts.ScriptTarget.ES2022}))(
    {serve:fn=>handler=fn},()=>sdk,describeCityPolicy);
  const invoke=payload=>handler(new Request('https://isolated.invalid',{method:'POST',body:JSON.stringify(payload)}));
  const created=await (await invoke({action:'activate',country_code:'BF',city_name:'Koudougou'})).json();
  assert.equal(created.created,true);assert.equal(created.city.nom,'koudougou');
  assert.equal(saved[0].actif,false,'no change to CI');
  const listed=await (await invoke({action:'list',country_code:'BF'})).json();
  assert.equal(listed.policy.enabled,true);assert.ok(listed.policy.conflicts.includes('country_city_activation_conflict'));
  await invoke({action:'deactivate',country_code:'BF',city_name:'Koudougou'});
  assert.equal(saved.find(c=>c.nom==='koudougou').actif,false);
  role='user';assert.equal((await invoke({action:'activate',country_code:'BF',city_name:'Other'})).status,403);
  assert.equal(saved.length,2,'unauthorized action creates nothing');
});
