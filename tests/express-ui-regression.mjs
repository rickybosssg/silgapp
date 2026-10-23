import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as rules from '../base44/shared/expressOrder.js';
import { resolveExpressClient, EXPRESS_PROFILE_MESSAGES } from '../base44/shared/expressClientContext.js';
import { getVoiceQuartierReview } from '../src/lib/expressQuartierSuggestions.js';
import { mergeExpressTurn } from '../base44/shared/expressConversation.js';
import { loadExpressWrittenContext } from '../src/lib/expressWrittenContext.js';

// Actual JSX handlers, fake recorder and API. No audio capture, SDK or network.
let source=readFileSync(new URL('../src/components/client/ExpressVoiceOrder.jsx',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
source=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.ESNext}}).outputText.replace('export default function','return function');
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function harness(props={}) {
  const slots=[];let cursor=0;const pending=[];
  const useState=initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];};
  const useRef=initial=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];};
  const useEffect=(fn,deps)=>{const i=cursor++;const previous=slots[i];if(!previous||deps.some((d,n)=>d!==previous.deps[n])){previous?.cleanup?.();slots[i]={deps};pending.push(()=>{slots[i].cleanup=fn();});}};
  const React={createElement:(type,props,...children)=>({type,props:{...props,children:children.flat(Infinity)}}),Fragment:'fragment'};
  let micStarts=0,stops=0,cancels=0,options;
  const createExpressRecorder=opts=>{options=opts;return {start:()=>{micStarts++;opts.onState('recording');},stop:()=>{stops++;opts.onState('idle');},cancel:()=>{cancels++;opts.onState('idle');}};};
  const component=new Function('React','useState','useRef','useEffect','Mic','SmartAddressInput','base44','createExpressRecorder','resolveExpressClient','EXPRESS_PROFILE_MESSAGES','getVoiceQuartierReview','mergeExpressTurn','Zap','loadExpressWrittenContext',...Object.keys(rules),source)(React,useState,useRef,useEffect,'microphone','smart-address',{},createExpressRecorder,resolveExpressClient,EXPRESS_PROFILE_MESSAGES,getVoiceQuartierReview,mergeExpressTurn,'lightning',loadExpressWrittenContext,...Object.values(rules));
  const render=()=>{cursor=0;const tree=component(props);pending.splice(0).forEach(f=>f());return tree;};
  const all=node=>node&&typeof node==='object'?[node,...(node.props.children||[]).flatMap(all)]:[];
  const text=node=>typeof node==='object'&&node?node.props.children.map(text).join(''):String(node??'');
  const button=label=>{const b=all(render()).find(e=>e.type==='button'&&text(e)===label);assert.ok(b,label);return b;};
  return {render,all,text,button,open:()=>all(render()).find(e=>e.props['data-testid']==='express-voice-order').props.onClick(),fields:()=>all(render()).filter(e=>e.type==='input'||e.type==='smart-address'),micStarts:()=>micStarts,stops:()=>stops,cancels:()=>cancels,audio:blob=>options.onAudio(blob),state:s=>options.onState(s),error:s=>options.onError(s),unmount:()=>slots.forEach(s=>s?.cleanup?.())};
}
const user={email:'client@example.invalid'};
const q1={id:'q1',nom:'Karpala',ville:'Test',actif:true,country_code:'BF',latitude:10,longitude:1};
const q2={...q1,id:'q2',nom:'Tanghin',latitude:11};
function api(invoke=async()=>({success:true, course:{id:'mock-course'}})) {const client={id:'client-test',user_email:user.email,country_code:'BF'};return {auth:{me:async()=>user},entities:{ClientExterne:{get:async()=>client,filter:async()=>[client]},Quartier:{filter:async()=>[q1,q2]}},functions:{invoke}};}
const fill=h=>{let f=h.fields();f[0].props.onChange('Karpala');f=h.fields();f[1].props.onChange('Tanghin');f=h.fields();f[2].props.onChange({target:{value:'1000'}});};
test('three fields, manual fallback, review then one final confirmation under double click',async()=>{
 const calls=[];const h=harness({api:api(async(name,payload)=>{calls.push({name,payload});return {success:true, course:{id:'mock'}};})});h.open();h.render();await tick();
 assert.equal(h.fields().length,3);assert.equal(h.micStarts(),0);assert.ok(h.fields().slice(0,2).every(f=>f.props.countryCode==='BF'&&f.props.quartierOnly));
 fill(h);await h.button('Vérifier ma commande').props.onClick();assert.equal(calls.length,0);assert.match(h.text(h.render()),/approximative/);
 const confirm=h.button('Confirmer ma commande').props.onClick;await Promise.all([confirm(),confirm()]);assert.equal(calls.length,1);assert.equal(calls[0].payload.express_draft.prix,1000);h.unmount();
});
test('express action starts once after profile readiness without a second consent window; cancel stops everything',async()=>{
 const h=harness({api:api(),transcribe:async()=>''});assert.equal(h.micStarts(),0);h.open();h.render();await tick();assert.equal(h.micStarts(),0);
 h.render();h.render();assert.equal(h.micStarts(),1);assert.doesNotMatch(h.text(h.render()),/Accepter et enregistrer/);assert.match(h.text(h.render()),/service externe/);
 assert.match(h.text(h.render()),/Enregistrement en cours/);assert.match(h.text(h.render()),/00:00/);assert.ok(!h.all(h.render()).some(e=>e.type==='button'&&h.text(e)==='Démarrer le micro'));
 h.button('Arrêter l’enregistrement').props.onClick();assert.equal(h.stops(),1);h.button('Annuler').props.onClick();assert.equal(h.fields().length,0);h.open();h.render();await tick();h.render();assert.equal(h.micStarts(),2);h.button('Annuler').props.onClick();h.unmount();
});
test('permission denial shows an error and keeps manual entry and retry available',async()=>{
 const h=harness({api:api(),transcribe:async()=>''});h.open();h.render();await tick();h.render();h.state('idle');h.error('Microphone refusé');
 assert.match(h.text(h.render()),/Microphone refusé/);assert.equal(h.button('Compléter par la voix').props.disabled,false);assert.equal(h.fields().length,3);h.button('Annuler').props.onClick();h.unmount();
});
test('late transcription after cancellation cannot overwrite a new manual order',async()=>{
 let resolve;const h=harness({api:api(),transcribe:()=>new Promise(r=>{resolve=r;})});h.open();h.render();await tick();h.render();h.state('idle');
 const pending=h.audio(new Blob(['synthetic']));assert.match(h.text(h.render()),/Traitement/);h.button('Annuler').props.onClick();resolve('de Karpala à Tanghin pour 1000 F');await pending;
 h.open();h.button('Annuler').props.onClick();assert.equal(h.fields().length,0);h.unmount();
});
test('uncertain creation retries preserve request_id and prevent edits/new draft',async()=>{
 const ids=[];const h=harness({api:api(async(_,payload)=>{ids.push(payload.request_id);if(ids.length===1)throw Error('network');return {success:true, course:{id:'same'}};})});h.open();h.render();await tick();fill(h);await h.button('Vérifier ma commande').props.onClick();await h.button('Confirmer ma commande').props.onClick();
 assert.match(h.text(h.render()),/même identifiant/);assert.equal(h.fields().length,0);await h.button('Confirmer ma commande').props.onClick();assert.equal(ids[0],ids[1]);h.unmount();
});
test('autocomplete selection uses exact quartier IDs despite duplicate names; foreign selection rejected',async()=>{
 const calls=[];const h=harness({api:api(async(_,payload)=>{calls.push(payload);return {success:true, course:{id:'mock'}};})});h.open();h.render();await tick();
 h.fields()[0].props.onChange('ignored',{type:'quartier',id:'q1',label:'Karpala',ville:'Test'});h.fields()[1].props.onChange('ignored',{type:'quartier',id:'q2',label:'Tanghin',ville:'Test'});h.fields()[2].props.onChange({target:{value:'1500'}});
 await h.button('Vérifier ma commande').props.onClick();await h.button('Confirmer ma commande').props.onClick();assert.equal(calls[0].express_draft.depart_id,'q1');assert.equal(calls[0].express_draft.arrivee_id,'q2');h.unmount();
 const bad=harness({api:api()});bad.open();bad.render();await tick();fill(bad);bad.fields()[0].props.onChange('foreign',{type:'quartier',id:'foreign',label:'Karpala'});await bad.button('Vérifier ma commande').props.onClick();assert.match(bad.text(bad.render()),/indisponible/);bad.unmount();
});

test('shared Commander autocomplete: express shows country quartiers only and emits exact selection; classic default preserved',()=>{
 let jsx=readFileSync(new URL('../src/components/location/SmartAddressInput.jsx',import.meta.url),'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');
 jsx=ts.transpileModule(jsx,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.ESNext}}).outputText.replace('export default function','return function');
 const fixtures=[{id:'bf',type:'quartier',label:'Karpala',countryCode:'BF'},{id:'ci',type:'quartier',label:'Karpala',countryCode:'CI'},{id:'shop',type:'boutique',label:'Karpala boutique',countryCode:'BF'}];
 function build(quartierOnly){let cursor=0;const state=[],pending=[];let chosen;const useState=initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];};const useRef=initial=>{const i=cursor++;return state[i]??(state[i]={current:initial});};const useEffect=(fn,deps)=>{const i=cursor++;if(!state[i]){state[i]=true;pending.push(fn);}};
 const React={createElement:(type,props,...children)=>({type,props:{...props,children:children.flat(Infinity)}})};
 const names=['React','useState','useRef','useEffect','useId','Building2','Loader2','MapPin','Pill','Plus','Search','Store','UtensilsCrossed','getCachedLocationSuggestions','searchLocationSuggestions','refreshCountryLocationIndex','AddLieuDialog','window','document'];
 const values=[React,useState,useRef,useEffect,()=> 'test-list',...Array(8).fill('icon'),()=>fixtures,async()=>fixtures,async()=>{},'add-lieu',{setTimeout:()=>1,clearTimeout:()=>{}},{addEventListener:()=>{},removeEventListener:()=>{}}];
 const component=new Function(...names,jsx)(...values);const all=n=>n&&typeof n==='object'?[n,...(n.props.children||[]).flatMap(all)]:[];
 const render=()=>{cursor=0;let tree=component({countryCode:'BF',value:'Ka',quartierOnly,onChange:(_,item)=>{chosen=item;}});pending.splice(0).forEach(f=>f());return tree;};
 render();all(render()).find(e=>e.type==='input').props.onFocus();return {options:()=>all(render()).filter(e=>e.props.role==='option'),chosen:()=>chosen};}
 const express=build(true);assert.equal(express.options().length,1);express.options()[0].props.onClick();assert.equal(express.chosen().id,'bf');
 assert.equal(build(false).options().length,3);
});

test('late profile disables review/microphone; its real country enables the form without creating a profile', async()=>{
 let finish; const sdk=api(); sdk.entities.ClientExterne.filter=()=>new Promise(resolve=>{finish=resolve;});
 const h=harness({api:sdk}); h.open(); h.render(); await tick();
 assert.equal(h.button('Vérifier ma commande').props.disabled,true); assert.match(h.text(h.render()),/Chargement du profil/);
 finish([{id:'client-test',user_email:user.email,country_code:'BF'}]);await tick();
 assert.equal(h.button('Vérifier ma commande').props.disabled,false); assert.equal(h.fields()[0].props.countryCode,'BF'); h.unmount();
});

test('missing country exposes normal profile completion, not a fabricated BF default', async()=>{
 const sdk=api();sdk.entities.ClientExterne.filter=async()=>[{id:'client-test',user_email:user.email}];let completed=0;
 const h=harness({api:sdk,onCompleteProfile:()=>completed++});h.open();h.render();await tick();
 assert.match(h.text(h.render()),/Complétez le pays/);assert.equal(h.fields()[0].props.countryCode,'');assert.equal(h.button('Vérifier ma commande').props.disabled,true);
 h.button('Ouvrir mon profil').props.onClick();assert.equal(completed,1);h.unmount();
});

test('review accepts grouped manual price, preserves profile/quartier IDs and returns created course for tracking',async()=>{
 const calls=[];let created;const h=harness({api:api(async(_,payload)=>{calls.push(payload);return {data:{success:true, course:{id:'actual-backend-id'}}};}),onCreated:course=>{created=course;}});
 h.open();h.render();await tick();fill(h);h.fields()[2].props.onChange({target:{value:'1 000'}});
 await h.button('Vérifier ma commande').props.onClick();assert.equal(calls.length,0);
 await h.button('Confirmer ma commande').props.onClick();assert.equal(calls[0].express_draft.client_profile_id,'client-test');assert.equal(calls[0].express_draft.country_code,'BF');assert.equal(calls[0].express_draft.prix,1000);assert.equal(created.id,'actual-backend-id');h.unmount();
});

test('assistant suppression is scoped to the open express form and released on unmount',async()=>{
 const states=[];const h=harness({api:api(),onOpenChange:value=>states.push(value)});h.open();h.render();assert.equal(states.at(-1),true);h.unmount();assert.equal(states.at(-1),false);
});

test('labelled transcript fills three fields and reaches recap without a course creation call',async()=>{
 let creations=0;
 const h=harness({api:api(async()=>{creations++;throw Error('Creation is forbidden in this scenario');}),transcribe:async()=> 'Départ Karpala, arrivée Tanghin, prix mille francs'});
 h.open();h.render();await tick();h.render();h.state('idle');
 await h.audio(new Blob(['synthetic test audio']));
 assert.match(h.text(h.render()),/Texte reconnu/);
 assert.match(h.text(h.render()),/Départ Karpala, arrivée Tanghin, prix mille francs/);
 assert.deepEqual(h.fields().map(field=>field.props.value),['Karpala','Tanghin','1000']);
 await h.button('Vérifier ma commande').props.onClick();
 assert.ok(h.button('Confirmer ma commande'));assert.match(h.text(h.render()),/1000 F/);assert.equal(creations,0);
 h.button('Annuler').props.onClick();assert.equal(creations,0);h.unmount();
});

test('APK147 comma transcript fills price but preserves uncertain quartiers until explicit catalogue choices',async()=>{
 const sdk=api();let creations=0;
 sdk.entities.ClientExterne.filter=async()=>[{id:'client-test',user_email:user.email,country_code:'BF',ville:'Test'}];
 sdk.functions.invoke=async()=>{creations++;throw Error('Creation forbidden');};
 const h=harness({api:sdk,transcribe:async()=> 'De Karfala à Tangui, mille francs.'});
 h.open();h.render();await tick();h.render();h.state('idle');await h.audio(new Blob(['synthetic fixture']));
 assert.deepEqual(h.fields().map(field=>field.props.value),['Karfala','Tangui','1000']);
 assert.match(h.text(h.render()),/De Karfala à Tangui, mille francs/);
 assert.ok(h.button('Choisir Karpala (Test)'));assert.ok(h.button('Choisir Tanghin (Test)'));
 await h.button('Vérifier ma commande').props.onClick();assert.match(h.text(h.render()),/Quartier inconnu/);assert.equal(creations,0);
 h.button('Choisir Karpala (Test)').props.onClick();h.button('Choisir Tanghin (Test)').props.onClick();
 assert.deepEqual(h.fields().map(field=>field.props.value),['Karpala (Test)','Tanghin (Test)','1000']);
 await h.button('Vérifier ma commande').props.onClick();assert.match(h.text(h.render()),/1000 F/);assert.ok(h.button('Confirmer ma commande'));assert.equal(creations,0);
 h.button('Annuler').props.onClick();assert.equal(h.fields().length,0);assert.equal(creations,0);h.unmount();
});

test('recognized text is transient: cleared on rerecord, cancellation and profile change',async()=>{
 const props={api:api(),clientProfil:{id:'client-test',country_code:'BF'},transcribe:async()=> 'De Karpala à Tanghin pour mille francs'};
 const h=harness(props);h.open();h.render();await tick();h.render();h.state('idle');
 await h.audio(new Blob(['fixture']));assert.match(h.text(h.render()),/Texte reconnu/);
 h.button('Compléter par la voix').props.onClick();assert.doesNotMatch(h.text(h.render()),/Texte reconnu/);h.state('idle');
 await h.audio(new Blob(['fixture']));assert.match(h.text(h.render()),/Texte reconnu/);
 props.clientProfil={id:'other-profile',country_code:'BF'};h.render();assert.doesNotMatch(h.text(h.render()),/Texte reconnu/);
 await tick();h.button('Annuler').props.onClick();h.open();h.render();assert.doesNotMatch(h.text(h.render()),/Texte reconnu/);h.unmount();
});

test('misheard quartier 6 keeps raw text until the client explicitly chooses a local catalogue ID',async()=>{
 const sdk=api();const catalogue=[q1,q2,{...q2,id:'cissin-test',nom:'Cissin'}];let creations=0;
 sdk.entities.Quartier.filter=async()=>catalogue;sdk.functions.invoke=async()=>{creations++;throw Error('No creation allowed');};
 const h=harness({api:sdk,transcribe:async()=> 'Départ Karpala, arrivée le quartier 6, prix mille francs'});
 h.open();h.render();await tick();h.render();h.state('idle');await h.audio(new Blob(['test']));
 assert.equal(h.fields()[1].props.value,'le quartier 6');assert.match(h.text(h.render()),/Quel quartier d’arrivée/);
 assert.ok(h.button('Choisir Cissin (Test)'));
 await h.button('Vérifier ma commande').props.onClick();assert.match(h.text(h.render()),/Quartier inconnu/);assert.equal(creations,0);
 h.button('Choisir Cissin (Test)').props.onClick();assert.equal(h.fields()[1].props.value,'Cissin (Test)');
 await h.button('Vérifier ma commande').props.onClick();assert.ok(h.button('Confirmer ma commande'));assert.equal(creations,0);
 h.button('Annuler').props.onClick();h.unmount();
});

test('a catalogue failure does not discard recognized fields or trigger paid retranscription',async()=>{
 const sdk=api();sdk.entities.Quartier.filter=async()=>{throw Error('network');};let transcripts=0;
 const h=harness({api:sdk,transcribe:async()=>{transcripts++;return 'Départ Karpala, arrivée Tanghin, prix mille francs';}});
 h.open();h.render();await tick();h.render();h.state('idle');await h.audio(new Blob(['test']));
 assert.deepEqual(h.fields().map(field=>field.props.value),['Karpala','Tanghin','1000']);
 assert.match(h.text(h.render()),/Texte reconnu, mais les quartiers/);assert.equal(transcripts,1);
 h.button('Annuler').props.onClick();h.unmount();
});

test('late catalogue responses after cancellation cannot expose or select old suggestions',async()=>{
 const sdk=api();let finish; sdk.entities.Quartier.filter=()=>new Promise(resolve=>{finish=resolve;});
 const h=harness({api:sdk,transcribe:async()=> 'Départ Karpala, arrivée le quartier 6, prix mille francs'});
 h.open();h.render();await tick();h.render();h.state('idle');const pending=h.audio(new Blob(['test']));await tick();
 h.button('Annuler').props.onClick();finish([q1,{...q2,nom:'Cissin'}]);await pending;h.open();h.render();await tick();
 assert.doesNotMatch(h.text(h.render()),/Choisir Cissin|Texte reconnu/);assert.deepEqual(h.fields().map(field=>field.props.value),['','','']);h.unmount();
});

test('profile changes during catalogue verification clear pending state and ignore old choices',async()=>{
 const sdk=api();let finish;sdk.entities.Quartier.filter=()=>new Promise(resolve=>{finish=resolve;});
 const props={api:sdk,clientProfil:{id:'client-test',country_code:'BF'},transcribe:async()=> 'Départ Karpala, arrivée le quartier 6, prix mille francs'};
 const h=harness(props);h.open();h.render();await tick();h.render();h.state('idle');const pending=h.audio(new Blob(['test']));await tick();
 props.clientProfil={id:'other-profile',country_code:'BF'};h.render();await tick();
 assert.equal(h.button('Compléter par la voix').props.disabled,false);
 finish([q1,{...q2,nom:'Cissin'}]);await pending;assert.doesNotMatch(h.text(h.render()),/Choisir Cissin|Texte reconnu/);h.button('Annuler').props.onClick();h.unmount();
});

test('conversation preserves selected quartiers through a voice price correction and written short reply',async()=>{
 let phrase='De Karpala à Tanghin';let creations=0;
 const h=harness({api:api(async()=>{creations++;throw Error('No creation');}),transcribe:async()=>phrase});
 h.open();h.render();await tick();h.render();h.state('idle');await h.audio(new Blob(['fixture']));
 assert.deepEqual(h.fields().map(f=>f.props.value),['Karpala','Tanghin','']);assert.match(h.text(h.render()),/Quel prix/);
 const textarea=h.all(h.render()).find(e=>e.type==='textarea');textarea.props.onChange({target:{value:'mille francs'}});
 await h.button('Appliquer').props.onClick();assert.equal(h.fields()[2].props.value,'1000');
 phrase='Non, plutôt 2 000 francs';h.button('Compléter par la voix').props.onClick();h.state('idle');await h.audio(new Blob(['next fixture']));
 assert.deepEqual(h.fields().map(f=>f.props.value),['Karpala','Tanghin','2000']);
 await h.button('Vérifier ma commande').props.onClick();assert.match(h.text(h.render()),/2000 F/);assert.equal(creations,0);
 h.button('Annuler').props.onClick();h.unmount();
});

test('cancel before delayed profile completion cannot start the microphone',async()=>{
 let finish;const sdk=api();sdk.entities.ClientExterne.filter=()=>new Promise(resolve=>{finish=resolve;});
 const h=harness({api:sdk,transcribe:async()=>''});h.open();h.render();await tick();h.button('Annuler').props.onClick();h.render();
 finish([{id:'client-test',user_email:user.email,country_code:'BF'}]);await tick();h.render();assert.equal(h.micStarts(),0);assert.equal(h.fields().length,0);h.unmount();
});

test('switching to manual entry stops the microphone without losing the form',async()=>{
 const h=harness({api:api(),transcribe:async()=>''});h.open();h.render();await tick();h.render();assert.equal(h.micStarts(),1);
 h.button('Saisir sans audio').props.onClick();assert.equal(h.fields().length,3);assert.equal(h.button('Vérifier ma commande').props.disabled,false);
 assert.match(h.text(h.render()),/Commande express/);assert.doesNotMatch(h.text(h.render()),/Accepter et enregistrer|Enregistrer ma commande/);h.button('Annuler').props.onClick();h.unmount();
});

test('late capability starts only the requested open recording and never reopens a cancelled form',async()=>{
 const props={api:api(),transcribe:null};const h=harness(props);h.open();h.render();await tick();h.render();assert.equal(h.micStarts(),0);
 props.transcribe=async()=>'';h.render();assert.equal(h.micStarts(),1);h.button('Annuler').props.onClick();h.render();
 props.transcribe=async()=>'';h.render();assert.equal(h.micStarts(),1);assert.equal(h.fields().length,0);h.unmount();
});

test('late structured interpretation cannot resurrect a cancelled draft or invoke creation',async()=>{
 let finish;let calls=0;
 const h=harness({api:api(async()=>{calls++;}),transcribe:async()=> 'inaudible',interpret:()=>new Promise(resolve=>{finish=resolve;})});
 h.open();h.render();await tick();h.render();h.state('idle');const pending=h.audio(new Blob(['fixture']));await tick();
 h.button('Annuler').props.onClick();finish({depart:'Karpala',arrivee:'Tanghin',prix:'1000'});await pending;
 assert.equal(h.fields().length,0);assert.equal(calls,0);h.unmount();
});

test('explicit audio OFF keeps manual fields, suggestions and recap with zero microphone or transcription calls',async()=>{
 let paid=0,creations=0;
 const h=harness({api:api(async()=>{creations++;throw Error('No creation');}),audioDisabled:true,transcribe:async()=>{paid++;return '';}});
 h.open();h.render();await tick();h.render();assert.equal(h.micStarts(),0);
 assert.equal(h.all(h.render()).filter(e=>e.type==='microphone').length,0);
 assert.doesNotMatch(h.text(h.render()),/Compléter par la voix|Traitement de votre audio/);
 fill(h);await h.button('Vérifier ma commande').props.onClick();
 assert.match(h.text(h.render()),/Karpala|Tanghin|1000 F/);assert.equal(paid,0);assert.equal(creations,0);
 h.button('Annuler').props.onClick();h.unmount();
});

test('audio OFF during transcription cancels capture and ignores late results without erasing written draft',async()=>{
 let finish;
 const props={api:api(),audioDisabled:false,transcribe:()=>new Promise(resolve=>{finish=resolve;})};
 const h=harness(props);h.open();h.render();await tick();h.render();h.state('idle');
 const pending=h.audio(new Blob(['test audio']));await tick();props.audioDisabled=true;h.render();
 finish('De Karpala à Tanghin, mille francs');await pending;
 assert.deepEqual(h.fields().map(f=>f.props.value),['','','']);assert.ok(h.cancels()>0);
 assert.doesNotMatch(h.text(h.render()),/Texte reconnu|Compléter par la voix/);h.button('Annuler').props.onClick();h.unmount();
});

test('fresh server audio OFF or an unavailable preflight prevents microphone permission despite a stale enabled capability',async()=>{
 for(const check of [async()=>false,async()=>{throw Error('offline');}]){
  let paid=0;const h=harness({api:api(),transcribe:async()=>{paid++;return '';},checkAudioAllowed:check});
  h.open();h.render();await tick();h.render();await tick();assert.equal(h.micStarts(),0);assert.equal(paid,0);assert.equal(h.fields().length,3);h.button('Annuler').props.onClick();h.unmount();
 }
});

function writtenApi(invoke) {
 const sdk=api(invoke);const client={id:'client-test',user_email:user.email,country_code:'BF',ville:'Test'};
 sdk.entities.ClientExterne={get:async()=>client,filter:async()=>[client]};
 sdk.entities.Country={filter:async()=>[{code:'BF',actif:true,devise:'XOF',devise_symbole:'F'}]};
 return sdk;
}

test('written-only client connector has no audio capability, polling, transcription or permission dependency',()=>{
 const connector=readFileSync(new URL('../src/components/client/ConnectedExpressVoiceOrder.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(connector,/audioTranscription|createRecordingTranscriber|createExpressInterpreter|setInterval|useEffect|createExpressRecorder/);
 const js=ts.transpileModule(connector.replace(/^import .*;\r?\n/gm,''),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.ESNext}}).outputText.replace('export default function','return function');
 let calls=0;const sdk={functions:{invoke:()=>{calls++;throw Error('No audio');}}};
 const React={createElement:(type,props)=>({type,props})};
 const tree=new Function('React','base44','ExpressVoiceOrder',js)(React,sdk,'express')({api:sdk});
 assert.equal(tree.props.textOnly,true);assert.equal(tree.props.audioDisabled,true);assert.equal(tree.props.transcribe,undefined);assert.equal(calls,0);
});

test('written express opens exactly three fields with lightning and FCFA, no audio or extra reply',async()=>{
 let calls=0;const h=harness({api:writtenApi(async()=>{calls++;}),textOnly:true,audioDisabled:true});
 assert.equal(h.all(h.render()).filter(e=>e.type==='lightning').length,1);
 h.open();h.render();await tick();h.render();
 assert.equal(h.fields().length,3);assert.equal(h.fields()[2].props.inputMode,'numeric');assert.equal(h.fields()[2].props.type,'number');assert.equal(h.fields()[2].props.step,'1');
 assert.match(h.text(h.render()),/FCFA/);assert.doesNotMatch(h.text(h.render()),/microphone|enregistrement|transcription|Base44|OpenAI|Votre réponse|Audio désactivé/i);
 assert.deepEqual(h.fields()[0].props.quartierIds,['q1','q2']);assert.equal(h.micStarts(),0);
 fill(h);await h.button('Commander').props.onClick();assert.ok(h.button('Confirmer ma commande'));assert.match(h.text(h.render()),/1000 FCFA/);assert.equal(calls,0);
 h.button('Modifier').props.onClick();assert.deepEqual(h.fields().map(f=>f.props.value),['Karpala','Tanghin','1000']);
 await h.button('Commander').props.onClick();h.button('Annuler').props.onClick();assert.equal(h.fields().length,0);assert.equal(calls,0);h.unmount();
});

test('written express refuses invalid amounts and keeps all fields after validation/network errors',async()=>{
 const sdk=writtenApi();const h=harness({api:sdk,textOnly:true,audioDisabled:true});h.open();h.render();await tick();fill(h);
 for(const prix of ['','0','-1','1000 ou 2000']){
  h.fields()[2].props.onChange({target:{value:prix}});await h.button('Commander').props.onClick();
  assert.equal(h.fields()[2].props.value,prix);assert.deepEqual(h.fields().slice(0,2).map(f=>f.props.value),['Karpala','Tanghin']);
  assert.ok(h.all(h.render()).some(e=>e.props.role==='alert'));
 }
 h.fields()[2].props.onChange({target:{value:'1500'}});sdk.entities.Quartier.filter=async()=>{throw Error('offline');};
 await h.button('Commander').props.onClick();assert.deepEqual(h.fields().map(f=>f.props.value),['Karpala','Tanghin','1500']);
 assert.equal(h.micStarts(),0);h.button('Annuler').props.onClick();h.unmount();
});

test('written express rejects a foreign-city selection and retains confirmation ID after uncertain response',async()=>{
 const ids=[];const sdk=writtenApi(async(_,payload)=>{ids.push(payload.request_id);if(ids.length===1)throw Error('offline');return {success:true, course:{id:'isolated'}};});
 sdk.entities.Quartier.filter=async()=>[q1,q2,{...q2,id:'other-city',nom:'Elsewhere',ville:'Other'}];
 const h=harness({api:sdk,textOnly:true,audioDisabled:true});h.open();h.render();await tick();fill(h);
 h.fields()[1].props.onChange('Elsewhere',{type:'quartier',id:'other-city',label:'Elsewhere',ville:'Other'});
 await h.button('Commander').props.onClick();assert.match(h.text(h.render()),/indisponible/);assert.equal(ids.length,0);
 h.fields()[1].props.onChange('Tanghin',{type:'quartier',id:'q2',label:'Tanghin',ville:'Test'});await h.button('Commander').props.onClick();
 const confirm=h.button('Confirmer ma commande').props.onClick;await Promise.all([confirm(),confirm()]);assert.equal(ids.length,1);
 assert.match(h.text(h.render()),/non confirmé/);assert.ok(h.button('Confirmer ma commande'));
 await h.button('Confirmer ma commande').props.onClick();assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);h.unmount();
});
