import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const website = 'https://silgapp-vitrine.mythicteal5.chatgpt.site';
const block = `D\u00e9couvrez notre site web :\n${website}`;
const parse = path => ts.createSourceFile(path,
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const admin = parse('src/components/admin/CourseWindowCard.jsx');
const driver = parse('src/components/livreur/CourseActiveCard.jsx');
function variable(source, name) {
  const matches = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) matches.push(node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(matches.length, 1, `Unique source expression: ${name}`);
  return matches[0].getText(source);
}
const evaluate = (expression, values) => vm.runInNewContext(`(${expression})`, values, { timeout: 1000 });
const storeLinks = Object.fromEntries(['SILGAPP_PLAYSTORE', 'SILGAPP_APPLE'].map(name => [name, evaluate(variable(admin, name), {})]));
assert.match(storeLinks.SILGAPP_PLAYSTORE, /com\.base6a0ec08f3af5e1d1284254c1\.app$/);
assert.match(storeLinks.SILGAPP_APPLE, /id6782046749/);
let cases = 0;

// Evaluate the real price-label expression across currencies and confirmation states.
for (const devise of ['FCFA', 'EUR', 'USD']) {
  for (const value of [
    { prix: 2345.5, pending: false },
    { prix: 2345.5, pending: true },
    { prix: 0, pending: false },
    { prix: NaN, pending: false },
  ]) {
    const label = evaluate(variable(driver, 'prixLabel'), {
      course: { prix_a_confirmer: value.pending }, prix: value.prix, devise,
    });
    assert.equal(label, value.pending || !value.prix || !Number.isFinite(value.prix)
      ? 'Le prix de la course vous sera confirm\u00e9 par SILGAPP.'
      : `Prix de la course : ${value.prix.toLocaleString()} ${devise}.`);
    cases++;
  }
}

for (const messageName of ['msgExpediteur', 'msgDestinataire']) {
  for (const present of [true, false]) {
    const values = {
      ...storeLinks,
      destinataireName: present ? 'Destinataire \u00e9 & + / ?' : '',
      expediteurName: present ? "Exp\u00e9diteur d'essai & +" : '',
      course: { id: 'synthetic-course-456789ab', adresse_arrivee: present ? 'Adresse \u00e9 & ?' : '' },
      trackingUrl: 'https://tracking.invalid/suivi-public/test-only?ref=abc%2B&locale=fr',
    };
    const message = evaluate(variable(admin, messageName), values);
    assert.equal(message.split(block).length, 2, 'Website block occurs exactly once');
    for (const link of [values.trackingUrl, ...Object.values(storeLinks)]) assert.ok(message.includes(link));
    assert.ok(message.includes('456789ab'));
    const dynamicName = messageName === 'msgExpediteur' ? values.destinataireName : values.expediteurName;
    if (present) assert.ok(message.includes(dynamicName));
    const url = new URL(`https://wa.me/22600000000?text=${encodeURIComponent(message)}`);
    assert.equal(url.searchParams.get('text'), message);
    assert.deepEqual([...url.searchParams.keys()], ['text']);
    cases++;
  }
}

for (const isDeplacement of [false, true]) for (const colisRecupere of [false, true]) {
  for (const named of [false, true]) for (const priced of [false, true]) {
    const values = {
      isDeplacement, colisRecupere,
      livreurNomFormate: named ? "A\u00efcha D'ESSAI & +" : null,
      prixLabel: priced ? 'Prix de la course : 2\u202f345 EUR.' : 'Le prix de la course vous sera confirm\u00e9 par SILGAPP.',
    };
    const encoded = evaluate(variable(driver, 'msg'), values);
    const message = decodeURIComponent(encoded);
    const pickup = !isDeplacement && !colisRecupere;
    assert.equal(message.split(website).length - 1, pickup ? 1 : 0);
    assert.ok(message.includes(values.prixLabel));
    assert.ok(!message.includes('undefined') && !message.includes('1 250 FCFA'));
    if (pickup) {
      assert.ok(message.endsWith(block));
      assert.ok(message.includes(named ? values.livreurNomFormate : 'je suis votre livreur SILGAPP'));
      assert.ok(message.includes("Merci de m'envoyer la localisation du lieu de r\u00e9cup\u00e9ration."));
    } else {
      const expected = isDeplacement
        ? `Bonjour, je suis votre chauffeur SILGAPP. Je suis en route pour vous prendre en charge. ${values.prixLabel}`
        : `Bonjour, je suis votre livreur SILGAPP. Je suis en route pour vous livrer votre colis. ${values.prixLabel}`;
      assert.equal(message, expected, 'Unrelated delivery/displacement text unchanged');
    }
    const url = new URL(evaluate(variable(driver, 'lien'), { num: '22600000001', msg: encoded }));
    assert.equal(url.pathname, '/22600000001');
    assert.equal(url.searchParams.get('text'), message, 'Exactly one URL encoding pass');
    assert.deepEqual([...url.searchParams.keys()], ['text']);
    cases++;
  }
}
console.log(`PASS ${cases} actual-source message and WhatsApp encoding cases; no external send.`);
