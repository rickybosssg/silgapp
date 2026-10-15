import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import { buildPromoShareMessage } from '../src/lib/promoShareMessage.js';
import { PLAY_STORE_URL, APP_STORE_URL } from '../src/lib/crmPilotMessage.js';
import { PROMO_FIRST_COURSE_AMOUNT_FCFA } from '../base44/shared/promoBenefits.js';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const CODE = 'TEST&é/#?';
function urls(text) {
  assert.equal(text.split(PLAY_STORE_URL).length, 2); assert.equal(text.split(APP_STORE_URL).length, 2);
  assert.ok(text.includes('\nAndroid (Google Play) :\n' + PLAY_STORE_URL));
  assert.ok(text.includes('\niPhone (App Store) :\n' + APP_STORE_URL));
  assert.ok(text.includes('\n\n')); assert.equal(text.includes('\\n'), false);
}
test('dynamic code and current shared benefit include both official store URLs on distinct lines', () => {
  const text = buildPromoShareMessage({ code: CODE }); urls(text);
  assert.ok(text.includes('*' + CODE + '*')); assert.ok(text.includes('*' + PROMO_FIRST_COURSE_AMOUNT_FCFA + ' FCFA de réduction*'));
  assert.equal(text.includes('COMP1280'), false);
});
test('configured amount is a parameter, not a literal in the message', () => {
  const text = buildPromoShareMessage({ code: 'OTHER9999', reductionAmount: 275 }); urls(text);
  assert.ok(text.includes('*275 FCFA de réduction*')); assert.equal(text.includes('*100 FCFA'), false);
});
test('zero discount never promises a financial benefit', () => {
  const text = buildPromoShareMessage({ code: 'ZERO', reductionAmount: 0 }); urls(text);
  assert.equal(text.includes('réduction'), false); assert.ok(text.includes('*ZERO*'));
});
test('invalid amounts and missing code cannot invent a promotion', () => {
  for (const reductionAmount of [-1, NaN, Infinity, '', null, true, 'not-a-number']) {
    assert.throws(() => buildPromoShareMessage({ code: CODE, reductionAmount }), /Montant promo invalide/);
  }
  for (const code of [null, undefined, '', '   ']) assert.throws(() => buildPromoShareMessage({ code }), /Code promo requis/);
});
test('WhatsApp encoding roundtrips accents, punctuation, newlines and URL queries exactly once', () => {
  const text = buildPromoShareMessage({ code: CODE }); const encoded = encodeURIComponent(text);
  for (const base of ['whatsapp://send?text=', 'https://wa.me/?text=']) {
    const url = new URL(base + encoded); assert.equal(url.searchParams.get('text'), text);
    assert.deepEqual(Array.from(url.searchParams.keys()), ['text']); urls(url.searchParams.get('text'));
  }
});
test('public app identities match official existing source references', () => {
  assert.equal(new URL(PLAY_STORE_URL).searchParams.get('id'), 'com.base6a0ec08f3af5e1d1284254c1.app');
  assert.equal(new URL(APP_STORE_URL).hostname, 'apps.apple.com'); assert.ok(new URL(APP_STORE_URL).pathname.endsWith('/id6782046749'));
});
function renderShare(name, props) {
  const links = [], opened = [], copied = [], timers = [];
  const react = { __esModule: true, default: { createElement: (type, attrs, ...children) => ({ type, props: { ...attrs, children } }) },
    useState: value => [value, () => {}] };
  const require = name => {
    if (name === 'react') return react;
    if (name === '@tanstack/react-query') return { useQuery: config => ({ data: config.queryKey[0].startsWith('mon-code-promo') ? { id: 'synthetic-code-id', code: CODE, actif: true, nb_inscrits: 0, nb_premieres_courses: 0 } : [] }) };
    if (name === '@/api/base44Client') return { base44: {} };
    if (name === '@/lib/promoShareMessage') return { buildPromoShareMessage };
    if (name.startsWith('@/components/ui/')) { const key = name.split('/').at(-1); return { [key[0].toUpperCase() + key.slice(1)]: key }; }
    if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
    if (name === 'date-fns') return { format: () => '' };
    if (name === 'date-fns/locale') return { fr: {} };
    if (name === 'sonner') return { toast: { success: () => {} } };
    throw Error('Unexpected import ' + name);
  };
  const module = { exports: {} };
  const js = ts.transpileModule(read(name), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require, navigator: { clipboard: { writeText: async value => copied.push(value) } },
    document: { createElement: () => { const anchor = { href: '', click: () => links.push(anchor.href) }; return anchor; }, hasFocus: () => true },
    window: { open: (...args) => opened.push(args) }, setTimeout: callback => timers.push(callback), encodeURIComponent });
  const tree = module.exports.default(props), all = [];
  const walk = value => { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') { all.push(value); walk(value.props?.children); } };
  walk(tree);
  const textOf = value => Array.isArray(value) ? value.map(textOf).join(' ') : typeof value === 'string' ? value : value && typeof value === 'object' ? textOf(value.props?.children) : '';
  return { share: all.find(node => typeof node.props.onClick === 'function' && textOf(node).includes('WhatsApp')),
    copy: all.find(node => node.props.title === 'Copier'), links, opened, copied, timers };
}
for (const [name, props] of [
  ['src/components/client/OngletCodePromo.jsx', { clientProfil: { id: 'synthetic-client' } }],
  ['src/components/livreur/OngletCodePromoLivreur.jsx', { livreurProfil: { id: 'synthetic-driver' } }],
  ['src/components/partenaire/OngletCodePromoPartenaire.jsx', { partenaireId: 'synthetic-partner' }],
]) test('actual share and copy handlers preserve two URLs and code-only clipboard: ' + name, async () => {
  const f = renderShare(name, props); assert.ok(f.share); assert.ok(f.copy);
  f.share.props.onClick(); assert.equal(f.links.length, 1); assert.equal(f.links[0].startsWith('whatsapp://send?text='), true);
  const text = new URL(f.links[0]).searchParams.get('text'); urls(text); assert.ok(text.includes('*' + CODE + '*'));
  f.timers.forEach(callback => callback()); assert.equal(f.opened.length, 1);
  assert.equal(new URL(f.opened[0][0]).searchParams.get('text'), text);
  f.copy.props.onClick(); await Promise.resolve(); assert.deepEqual(f.copied, [CODE]);
});
test('financial validation preserves its exact prior source apart from the shared constant extraction', () => {
  const root = new URL('../', import.meta.url);
  const git = process.env.IOS_TEST_GIT || 'git';
  const prior = execFileSync(git, ['show', '70cd22ff50e8dcee467635ac46182d4c7c1a9892:base44/functions/validerPrimePromo/entry.ts'], { cwd: root, encoding: 'utf8' }).replace(/\r\n/g, '\n');
  const current = read('base44/functions/validerPrimePromo/entry.ts').replace(/\r\n/g, '\n');
  const value = Number(prior.match(/const PRIME_FIXE = (\d+);/)[1]); assert.equal(PROMO_FIRST_COURSE_AMOUNT_FCFA, value);
  const restored = current.replace("import { PROMO_FIRST_COURSE_AMOUNT_FCFA } from '../../shared/promoBenefits.js';\n", '')
    .replace('const PRIME_FIXE = PROMO_FIRST_COURSE_AMOUNT_FCFA;', 'const PRIME_FIXE = ' + value + ';');
  assert.equal(restored, prior, 'budgets, awards, commissions, debt, countries and idempotence remain exact');
});