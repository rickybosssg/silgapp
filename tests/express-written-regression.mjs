import assert from 'node:assert/strict';
import {test} from 'node:test';
import {expressCurrency, loadExpressWrittenContext} from '../src/lib/expressWrittenContext.js';
import {createExpressSubmission} from '../base44/shared/expressOrder.js';

test('CFA currencies display FCFA without replacing other configured currencies',()=>{
 for(const devise of ['XOF','XAF','FCFA','F CFA']) assert.equal(expressCurrency({devise,devise_symbole:'F'}),'FCFA');
 assert.equal(expressCurrency({devise:'GHS',devise_symbole:'GHS'}),'GHS');
 assert.equal(expressCurrency({devise:'GNF',devise_symbole:'FG'}),'FG');assert.equal(expressCurrency({}),'');
});

test('explicit server refusal never succeeds even if a stale course ID is present',async()=>{
 for(const body of [{success:false,course:{id:'stale'}},{erreur:'FORBIDDEN',course:{id:'stale'}},{error:'refused',course:{id:'stale'}},{ok:false,course:{id:'stale'}}]) {
  for(const response of [body,{data:body,course:{id:'stale-root'}}]) {
   const submit=createExpressSubmission(async()=>response);await assert.rejects(submit({confirmed:true}));
  }
 }
});

test('written catalogue keeps explicit operational-city attachments and rejects foreign countries',async()=>{
 const rows=[{id:'ouaga',nom:'Karpala',ville:'Ouagadougou',ville_operationnelle:'ouagadougou',country_code:'BF',actif:true},
 {id:'saaba',nom:'Saaba',ville:'Saaba',ville_operationnelle:'ouagadougou',country_code:'BF',actif:true},
 {id:'bobo',nom:'Secteur 1',ville:'Bobo-Dioulasso',ville_operationnelle:'bobo-dioulasso',country_code:'BF',actif:true},
 {id:'foreign',nom:'Karpala',ville:'Ouagadougou',ville_operationnelle:'ouagadougou',country_code:'CI',actif:true}].map(q=>({...q,latitude:12,longitude:-1}));
 const api={entities:{Country:{filter:async query=>[{code:query.code,actif:true,devise:'XOF'}]},Quartier:{filter:async()=>rows}}};
 assert.deepEqual((await loadExpressWrittenContext(api,{country_code:'BF',ville:'Saaba'})).quartiers.map(q=>q.id),['ouaga','saaba']);
 await assert.rejects(loadExpressWrittenContext(api,{country_code:'BF',ville:'Unknown'}));
 api.entities.Country.filter=async()=>[{code:'CI',actif:true,devise:'XOF'}];await assert.rejects(loadExpressWrittenContext(api,{country_code:'BF',ville:'Ouagadougou'}));
});
