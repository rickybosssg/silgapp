import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeExpressTurn } from '../base44/shared/expressConversation.js';

// Strict reproduction of the physical test. Keep the failure visible until
// this ASR wording is supported; no mock transcription or paid request here.
test('observed Android 150 wording fills the route and price without manual repair', () => {
 const text = "J'ai besoin de livrer 1200 logements pour livrer à Somgandé et le prix c'est 1500.";
 const { fields } = mergeExpressTurn({ depart: '', arrivee: '', prix: '' }, text);
 assert.deepEqual({ ...fields, depart: fields.depart.toLowerCase() }, { depart: '1200 logements', arrivee: 'Somgandé', prix: '1500' });
});
