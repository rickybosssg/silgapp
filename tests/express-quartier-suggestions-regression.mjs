import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getVoiceQuartierReview, scopeVoiceQuartiers, suggestVoiceQuartiers } from '../src/lib/expressQuartierSuggestions.js';
const q = (id, nom, extra = {}) => ({ id, nom, country_code: 'BF', ville: 'Ville test', ville_operationnelle: 'ville test', actif: true, latitude: 10, longitude: 1, ...extra });
const quartiers = [q('origin', '1200 Logements'), q('cissin', 'Cissin'), q('tanghin', 'Tanghin'), q('karpala', 'Karpala')];

test('misheard quartier 6 suggests only existing local IDs and never changes the fields', () => {
  const fields = { depart: '1200 logements', arrivee: 'le quartier 6, le quartier 6', prix: '1000' };
  const checks = getVoiceQuartierReview({ fields, quartiers, country: 'BF' });
  assert.equal(checks.depart, undefined);
  assert.ok(checks.arrivee.candidates.some(q => q.id === 'cissin'));
  assert.equal(fields.arrivee, 'le quartier 6, le quartier 6');
  assert.equal(fields.prix, '1000');
});

test('uncertain names are ranked with official aliases; no nonexistent destination is returned', () => {
  assert.equal(suggestVoiceQuartiers('Tagnhin', quartiers, 'BF', 'Ville test')[0].id, 'tanghin');
  assert.equal(suggestVoiceQuartiers('kp', [...quartiers, q('alias', 'Autre quartier', { variantes: 'kp' })], 'BF', 'Ville test')[0].id, 'alias');
  assert.deepEqual(suggestVoiceQuartiers('zzzzzzzzzz', quartiers, 'BF', 'Ville test'), []);
  assert.deepEqual(suggestVoiceQuartiers('', quartiers, 'BF', 'Ville test'), []);
});

test('country, active city, coordinates and duplicate IDs constrain candidate lists', () => {
  const catalogue = [...quartiers, q('foreign-country', 'Cissin', { country_code: 'CI' }), q('foreign-city', 'Cissin', { ville: 'Autre ville', ville_operationnelle: 'autre ville' }), q('inactive', 'Cissin', { actif: false }), q('bad-gps', 'Cissin', { latitude: null }), quartiers[1]];
  assert.deepEqual(suggestVoiceQuartiers('le quartier 6', catalogue, 'BF', 'Ville test').map(q => q.id), ['cissin']);
  assert.deepEqual(scopeVoiceQuartiers(catalogue, '', 'Ville test'), []);
  assert.deepEqual(scopeVoiceQuartiers(catalogue, 'BF', ''), []);
  assert.deepEqual(scopeVoiceQuartiers(catalogue, 'BF', 'Ville inconnue'), []);
});

test('administrative city links use explicit catalogue operational zones, never a hardcoded alias', () => {
  const catalogue = [q('ouaga', 'Quartier A', { ville: 'Ouagadougou', ville_operationnelle: 'ouagadougou' }), q('saaba', 'Quartier B', { ville: 'Saaba', ville_operationnelle: 'ouagadougou' }), q('bobo', 'Quartier C', { ville: 'Bobo-Dioulasso', ville_operationnelle: 'bobo-dioulasso' })];
  assert.deepEqual(scopeVoiceQuartiers(catalogue, 'BF', 'Saaba').map(q => q.id), ['ouaga', 'saaba']);
  assert.deepEqual(scopeVoiceQuartiers(catalogue, 'BF', 'Bobo-Dioulasso').map(q => q.id), ['bobo']);
  assert.deepEqual(scopeVoiceQuartiers([...catalogue, q('conflict', 'Quartier D', { ville: 'Saaba', ville_operationnelle: 'autre zone' })], 'BF', 'Saaba'), []);
});

test('known fields stay untouched; unknown city does not fabricate a search scope', () => {
  assert.deepEqual(getVoiceQuartierReview({ fields: { depart: 'Karpala', arrivee: 'Tanghin', prix: '1000' }, quartiers, country: 'BF' }), {});
  assert.deepEqual(getVoiceQuartierReview({ fields: { depart: '', arrivee: 'le quartier 6', prix: '1000' }, quartiers, country: 'BF' }).arrivee.candidates, []);
  assert.ok(suggestVoiceQuartiers('Cissin', Array.from({ length: 10 }, (_, i) => q(String(i), `Cissin ${i}`)), 'BF', 'Ville test').length <= 3);
});
