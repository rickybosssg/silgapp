import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { transformSync } from 'esbuild';
const fixtures = [
 {code:'CI',indicatif:'+225',nom:"Cote d'Ivoire",phone_min_length:10,phone_max_length:10},
 {code:'TG',indicatif:'+228',nom:'Togo',phone_min_length:8,phone_max_length:8},
 {code:'BJ',indicatif:'+229',nom:'Benin',phone_min_length:10,phone_max_length:10},
];
const formSource=fs.readFileSync('src/components/auth/LivreurRegistrationForm.jsx','utf8');
const phoneSource=fs.readFileSync('src/lib/phoneUtils.js','utf8');
function evaluate(source, loader, imports, globals={}) {
 const module={exports:{}};
 const context={module,exports:module.exports,require:(name)=>{
  if(!(name in imports))throw Error('Unmocked import blocked: '+name);
  return imports[name];
 },console:{log(){},warn(){},error(){}},...globals};
 vm.runInNewContext(transformSync(source,{loader,format:'cjs',jsx:'transform'}).code,context,{timeout:3000});
 return module.exports;
}
function harness({code='CI',missing,failUpload=false,failCreate=false}={}) {
 const trace=[];const states=[];let cursor=0;let completed=0;
 const base44={entities:{Country:{filter:async(q)=>{trace.push({op:'countries',q});return fixtures;}},Livreur:{create:async(data)=>{trace.push({op:'create',data});if(failCreate)throw Error('SIMULATED_CREATE_FAILURE');}}},integrations:{Core:{UploadFile:async({file})=>{trace.push({op:'upload',name:file.name});if(failUpload)throw Error('SIMULATED_UPLOAD_FAILURE');return {file_url:'mock://local/image/'+trace.length};}}},functions:{invoke:async(name,args)=>{trace.push({op:'invoke',name,args});}}};
 const phones=evaluate(phoneSource,'js',{'@/api/base44Client':{base44}});
 const React={createElement(type,props,...children){props={...props,children};return typeof type==='function'?type(props):{type,props,children};},useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useEffect(){}};
 const imports={'react':React,'@/api/base44Client':{base44},'@/components/ui/input':{Input:'input'},'@/components/ui/label':{Label:'label'},'@/components/ui/button':{Button:'button'},'lucide-react':Object.fromEntries(['Loader2','Phone','Camera','Upload','MapPin'].map(n=>[n,n])),'@/lib/phoneUtils':phones,'@/lib/countryService':{getDefaultCountryCode:async()=>null},'@/components/location/SmartAddressInput':{default:'SmartAddressInput',__esModule:true}};
 class MockImage {width=1200;height=800;set src(value){this.onload();}}
 class MockFile {constructor(parts,name,opts){this.name=name;this.type=opts.type;this.size=10;}}
 const globals={Image:MockImage,File:MockFile,URL:{createObjectURL(){return 'mock:local-blob';}},document:{createElement(tag){assert.equal(tag,'canvas');return {getContext(){return {drawImage(){}};},toBlob(cb,type,quality){assert.equal(type,'image/jpeg');assert.equal(quality,0.7);cb({mock:true});}};}}};
 const Component=evaluate(formSource,'jsx',imports,globals).default;
 const user={full_name:'LOCAL_FIXTURE_ONLY',email:'fixture@example.invalid'};
 states[0]={nom:'LOCAL_FIXTURE_ONLY',prenom:'LOCAL_FIXTURE_ONLY',telephone:'0000000000',country_code:code,ville:'LOCAL_FIXTURE_ONLY',quartier:'LOCAL_FIXTURE_ONLY'};
 for(const i of [1,2,3]) states[i]={name:'synthetic-'+i+'.png',size:10};
 if(missing==='profile')states[1]=null;
 if(missing==='recto')states[2]=null;
 if(missing==='verso')states[3]=null;
 if(missing==='name')states[0].nom='';
 const render=()=>{cursor=0;return Component({user,onComplete(){completed++;}});};
 return {phones,states,trace,render,get completed(){return completed;}};
}
function nodes(tree){if(!tree||typeof tree!=='object')return [];return [tree,...(tree.children||[]).flat(Infinity).flatMap(nodes)];}
function text(tree){if(tree==null||typeof tree==='boolean')return '';if(typeof tree!=='object')return String(tree);return (tree.children||[]).flat(Infinity).map(text).join(' ');}
for(const country of fixtures){
 test(country.code+' actual country loader and selection preserve country/dial and identity wording',async()=>{
  const h=harness({code:'BF'});await h.phones.loadCountryPhoneConfigs();
  let tree=h.render();const select=nodes(tree).find(x=>x.type==='select');
  assert.ok(nodes(select).some(x=>x.type==='option'&&x.props.value===country.code));
  select.props.onChange({target:{value:country.code}});tree=h.render();
  assert.equal(h.states[0].country_code,country.code);assert.ok(text(tree).includes(country.indicatif));
  assert.ok(text(tree).includes("Pi\u00e8ce d'identit\u00e9 \u2014 Recto"));assert.ok(text(tree).includes("Pi\u00e8ce d'identit\u00e9 \u2014 Verso"));assert.ok(!text(tree).includes('CNIB'));
 });
 for(const missing of ['recto','verso'])test(country.code+' blocks missing '+missing+' before any upload/create',async()=>{
  const h=harness({code:country.code,missing});await h.render().props.onSubmit({preventDefault(){}});
  assert.ok(h.states[5].includes("pi\u00e8ce d'identit\u00e9"));assert.equal(h.trace.length,0);assert.equal(h.completed,0);
 });
 test(country.code+' simulated successful request preserves approval and legacy photo fields',async()=>{
  const h=harness({code:country.code});await h.render().props.onSubmit({preventDefault(){}});
  const create=h.trace.find(x=>x.op==='create');assert.ok(create);assert.equal(create.data.country_code,country.code);
  assert.equal(create.data.validation,'en_attente');assert.equal(create.data.actif,false);assert.equal(create.data.statut,'hors_ligne');
  assert.ok(create.data.photo_cnib_recto_url.startsWith('mock://'));assert.ok(create.data.photo_cnib_verso_url.startsWith('mock://'));
  assert.equal(h.trace.filter(x=>x.op==='upload').length,3);assert.equal(h.completed,1);assert.equal(h.states[4],false);assert.equal(h.states[5],'');
 });
}
for(const [name,options,expected] of [['country',{code:null},'COUNTRY_REQUIRED'],['profile',{missing:'profile'},'photo de profil'],['name',{missing:'name'},'obligatoires']])test('blocks missing '+name+' without service calls',async()=>{const h=harness(options);await h.render().props.onSubmit({preventDefault(){}});assert.ok(h.states[5].includes(expected));assert.equal(h.trace.length,0);});
test('simulated upload failure never creates profile or reports completion',async()=>{const h=harness({failUpload:true});await h.render().props.onSubmit({preventDefault(){}});assert.ok(h.states[5].includes('SIMULATED_UPLOAD_FAILURE'));assert.equal(h.trace.filter(x=>x.op==='create').length,0);assert.equal(h.completed,0);assert.equal(h.states[4],false);});
test('simulated backend failure never reports success',async()=>{const h=harness({failCreate:true});await h.render().props.onSubmit({preventDefault(){}});assert.equal(h.states[5],'SIMULATED_CREATE_FAILURE');assert.equal(h.completed,0);assert.equal(h.states[4],false);});
