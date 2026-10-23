import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeExpressTurn } from '../base44/shared/expressConversation.js';
import { validateExpressInterpretation, interpretExpressText } from '../base44/shared/expressInterpretation.js';

const empty = { depart: '', arrivee: '', prix: '' };
const complete = { depart: '1200 Logements', arrivee: 'Somgandé', prix: '1500' };
test('natural introduction and price clause are not copied into quartiers', () => {
  assert.deepEqual(mergeExpressTurn(empty, 'Alors, j’ai besoin d’un livreur').fields, empty);
  assert.deepEqual(mergeExpressTurn(empty, 'J’ai besoin d’un livreur des 1200 Logements à Somgandé, et le prix, 1500').fields, complete);
  assert.deepEqual(mergeExpressTurn(empty, 'Alors, j’ai besoin d’un livreur de Karpala à Tanghin, mille francs').fields, { depart: 'Karpala', arrivee: 'Tanghin', prix: '1000' });
});
test('spoken prices with and without pour and several real quartier names', () => {
  for (const [depart, arrivee] of [['Karpala','Tanghin'],['Cissin','Pissy'],['1200 Logements','Somgandé']]) {
    for (const suffix of ['pour mille cinq cents francs', 'mille cinq cents francs', ', prix 1 500', '. Et le prix, 1500']) {
      assert.deepEqual(mergeExpressTurn(empty, `De ${depart} à ${arrivee} ${suffix}`).fields, { depart, arrivee, prix: '1500' });
    }
  }
});
test('short answers preserve context and ask only for the missing field', () => {
  let turn = mergeExpressTurn(empty, 'Départ 1200 Logements');
  turn = mergeExpressTurn(turn.fields, 'Somgandé. Et le prix, 1500', turn.requested);
  assert.deepEqual(turn.fields, complete);
  turn = mergeExpressTurn(empty, 'De Karpala à Tanghin');
  assert.equal(turn.requested, 'prix'); assert.match(turn.question, /Quel prix/);
  assert.deepEqual(mergeExpressTurn(turn.fields, 'mille francs', turn.requested).fields, { depart: 'Karpala', arrivee: 'Tanghin', prix: '1000' });
});
test('explicit corrections change only the price or named location', () => {
  assert.deepEqual(mergeExpressTurn(complete, 'Non, plutôt 2 000 francs').fields, { ...complete, prix: '2000' });
  assert.deepEqual(mergeExpressTurn(complete, 'prix mille francs').fields, { ...complete, prix: '1000' });
  assert.deepEqual(mergeExpressTurn(complete, 'Arrivée Cissin').fields, { ...complete, arrivee: 'Cissin' });
});
test('numbers and uncertain corrections never invent a location or a price', () => {
  assert.deepEqual(mergeExpressTurn(empty, '1200').fields, empty);
  assert.match(mergeExpressTurn(empty, '1200').question, /quartier ou un prix/);
  assert.deepEqual(mergeExpressTurn(complete, 'Non, plutôt 1200').fields, complete);
  for (const value of ['prix mille ou deux mille francs','prix -500','prix environ 1500']) assert.deepEqual(mergeExpressTurn(complete, value).fields, complete);
  assert.equal(mergeExpressTurn(empty, 'De Secteur 6 à 1200 Logements').fields.prix, '');
});
test('structured output must quote evidence, never silently correct a place or override draft', () => {
  assert.deepEqual(validateExpressInterpretation({ depart:'1200 Logements', arrivee:'Cissin', prix:'mille francs' }, 'De 1200 Logements à Sissin, mille francs', empty, ''), { depart:'1200 Logements', arrivee:'', prix:'1000' });
  assert.deepEqual(validateExpressInterpretation({ depart:'1200', arrivee:'Somgandé', prix:'1500' }, '1200 Logements à Somgandé prix 1500', complete, ''), empty);
  assert.deepEqual(validateExpressInterpretation({ depart:'', arrivee:'', prix:'1200' }, '1200 Logements', empty, ''), empty);
  assert.throws(() => validateExpressInterpretation({ depart:'', arrivee:'', prix:'', country:'BF' }, 'texte', empty, ''));
});
test('server interpretation requires public authorized actor and configured engine before any paid call', async () => {
  let calls=0;const core={InvokeLLM:async()=>{calls++;return {depart:'Karpala',arrivee:'Tangui',prix:'mille francs'};}};
  let claims=0,releases=0;
  const options={core,store:{claim:async()=>{claims++;return async()=>{releases++;};}},config:{id:'existing',provider:'base44',enabled:true},user:{id:'test-user',email:'test@example.invalid',country_code:'BF'},text:'De Karpala à Tangui, mille francs',previous:empty,requested:'',requestId:'test-request-123456789'};
  await assert.rejects(interpretExpressText({...options,user:{...options.user,enterprise_id:'private'}}));
  await assert.rejects(interpretExpressText({...options,config:{...options.config,enabled:false}}));
  assert.equal(calls,0);assert.equal(claims,0);
  assert.deepEqual(await interpretExpressText(options), {depart:'Karpala',arrivee:'Tangui',prix:'1000'});assert.equal(calls,1);assert.equal(releases,1);
  await assert.rejects(interpretExpressText({...options,store:{claim:async()=>{throw Error('ALREADY_ATTEMPTED');}}}));assert.equal(calls,1);
});
