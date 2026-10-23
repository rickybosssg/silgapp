import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractExpressFields, parseExpressTranscript, resolveExpressQuartier } from '../base44/shared/expressOrder.js';

const expected = { depart: '1200 Logements', arrivee: 'Cissin', prix: '1000' };

test('APK147 actual comma transcript separates its explicit currency amount without correcting names', () => {
  const text = 'De Karfala à Tangui, mille francs.';
  const fields = { depart: 'Karfala', arrivee: 'Tangui', prix: '1000' };
  assert.deepEqual(parseExpressTranscript(text), fields);
  assert.deepEqual(extractExpressFields(text), fields);
});

test('price labels and historical pour both accept spoken and grouped amounts', () => {
  for (const text of [
    'De Karfala à Tangui prix mille francs',
    'De Karfala à Tangui, prix mille francs.',
    'De Karfala à Tangui,prix : mille francs',
    'De Karfala à Tangui prix 1000',
    'De Karfala à Tangui pour 1 000 francs',
  ]) assert.deepEqual(extractExpressFields(text), { depart: 'Karfala', arrivee: 'Tangui', prix: '1000' });
  assert.deepEqual(extractExpressFields('prix mille francs'), { depart: '', arrivee: '', prix: '1000' });
});

test('quartier numbers never supply the price and comma-only amounts require a currency', () => {
  assert.deepEqual(extractExpressFields('De 1200 Logements à Secteur 6, mille francs'), { depart: '1200 Logements', arrivee: 'Secteur 6', prix: '1000' });
  assert.deepEqual(extractExpressFields('De Secteur 6 à 1200 Logements prix 500 francs'), { depart: 'Secteur 6', arrivee: '1200 Logements', prix: '500' });
  for (const text of ['De 1200 Logements à Secteur 6', 'De Secteur 6 à 1200 Logements', 'De Karpala à 1000 francs', 'De Karpala à Tanghin, 1200']) {
    assert.equal(extractExpressFields(text).prix, '');
    assert.throws(() => parseExpressTranscript(text));
  }
});

test('comma prices do not accept uncertain, duplicate, negative or incidental numbers', () => {
  for (const amount of ['environ mille francs', 'mille ou cinq cents francs', 'mille francs, cinq cents francs', '-500 francs', '1,5 francs', 'mille francs appelez 123']) {
    const text = `De Karpala à Tanghin, ${amount}`;
    assert.equal(extractExpressFields(text).prix, '', amount);
    assert.throws(() => parseExpressTranscript(text), amount);
  }
});

test('requested Fold4 phrase: explicit departure, arrival and price labels are supported', () => {
  for (const text of [
    'Départ 1200 Logements, arrivée Cissin, prix mille francs',
    'Départ : 1200 Logements. Arrivée : Cissin. Prix : 1 000 F.',
    'depart 1200 Logements arrivee Cissin prix mille francs',
    'Quartier de départ 1200 Logements ; quartier d’arrivée Cissin ; prix mille francs.',
    'Prix mille francs\nArrivée Cissin\nDépart 1200 Logements',
  ]) {
    assert.deepEqual(parseExpressTranscript(text), expected);
    assert.deepEqual(extractExpressFields(text), expected);
  }
});

test('missing fields stay empty; labels do not fabricate a quartier or price', () => {
  assert.deepEqual(extractExpressFields('Départ 1200 Logements, arrivée Cissin'), { ...expected, prix: '' });
  assert.deepEqual(extractExpressFields('Arrivée Cissin, prix mille francs'), { ...expected, depart: '' });
  assert.deepEqual(extractExpressFields('Départ, arrivée Cissin, prix'), { depart: '', arrivee: 'Cissin', prix: '' });
  assert.deepEqual(extractExpressFields('Prix mille francs'), { depart: '', arrivee: '', prix: '1000' });
  assert.throws(() => parseExpressTranscript('Départ 1200 Logements, arrivée Cissin'));
});

test('uncertain, corrected and duplicate fields are never guessed', () => {
  assert.deepEqual(extractExpressFields('Départ Karpala ou Pissy, arrivée Cissin, prix mille francs'), { ...expected, depart: '' });
  for (const value of ['environ mille', 'mille non cinq cents', '-500', 'mille ou cinq cents', 'mille francs appelez 123']) {
    assert.deepEqual(extractExpressFields(`Départ 1200 Logements, arrivée Cissin, prix ${value}`), { ...expected, prix: '' });
  }
  assert.deepEqual(extractExpressFields('Départ 1200 Logements, départ Karpala, arrivée Cissin, prix mille'), { ...expected, depart: '' });
  assert.deepEqual(extractExpressFields('Départ 1200 Logements, arrivée Cissin, prix mille, prix cinq cents, prix deux mille'), { ...expected, prix: '' });
});

test('historical de/a/pour syntax and exact country catalogue resolution are preserved', () => {
  assert.deepEqual(extractExpressFields('De 1200 Logements à Cissin pour mille francs.'), expected);
  const unknown = extractExpressFields('Départ Quartier inconnu, arrivée Cissin, prix mille francs');
  assert.equal(unknown.depart, 'Quartier inconnu');
  assert.throws(() => resolveExpressQuartier(unknown.depart, [], 'BF'));
  assert.throws(() => resolveExpressQuartier(expected.depart, [{ id: 'foreign', nom: expected.depart, country_code: 'CI', actif: true }], 'BF'));
  for (const text of ['inaudible', '', 'départ arrivée prix']) assert.deepEqual(extractExpressFields(text), { depart: '', arrivee: '', prix: '' });
});
