import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/components/livreur/CourseActiveCard.jsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('card.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let handler;
function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'handleWhatsApp') handler = node.initializer.getText(tree); ts.forEachChild(node, visit); }
visit(tree); assert.ok(handler);
const site = 'https://silgapp-vitrine.mythicteal5.chatgpt.site';
function message(overrides = {}) {
  let opened;
  const context = { triggerClientContacte() {}, normalizePhoneForWhatsapp: () => '22604040101', contactTel: '04040101',
    course: { country_code: 'BF', delivery_mode: 'standard' }, livreurNom: 'Livreur de test', isDeplacement: false, colisRecupere: false,
    getPrixAffichable: () => 1500, getDeviseAffichable: () => 'FCFA', window: { open: url => { opened = url; return { closed: false }; } }, ...overrides };
  vm.runInNewContext(`(${handler})();`, context);
  return { raw: opened, url: new URL(opened), text: new URL(opened).searchParams.get('text') };
}
for (const origin of [{ source: 'client', commande_vocale_express: true }, { source: 'client' }, { source: 'admin', pricing_mode: 'admin_manuel' }]) {
  for (const name of ['Livreur de test', '']) test(`Standard ${JSON.stringify(origin)} / name=${!!name}: exact encoded historical contact suffix`, () => {
    const result = message({ course: { ...origin, country_code: 'BF', delivery_mode: 'standard' }, livreurNom: name });
    assert.equal(result.text.split(site).length - 1, 1);
    assert.equal(result.text, `Bonjour, je suis ${name ? name + ', votre' : 'votre'} livreur SILGAPP. Je suis en route pour récupérer votre colis. Prix de la course : ${(1500).toLocaleString()} FCFA. Merci de m'envoyer la localisation du lieu de récupération.\n\nDécouvrez notre site web :\n${site}`);
    assert.equal(result.url.hostname, 'wa.me'); assert.equal(result.url.pathname, '/22604040101');
    assert.equal(result.raw, 'https://wa.me/22604040101?text=' + encodeURIComponent(result.text));
  });
}
for (const [label, overrides] of [['after pickup', { colisRecupere: true }], ['passenger', { isDeplacement: true }], ['Eco individual view', { course: { country_code: 'BF', delivery_mode: 'eco' } }]]) {
  test(`${label}: no website suffix added`, () => assert.equal(message(overrides).text.includes(site), false));
}
