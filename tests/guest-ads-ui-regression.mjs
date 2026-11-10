import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { guestAdLink } from '../src/lib/guestAdsClient.js';
function harness() {
  const states = [], effects = [], requests = []; let cursor = 0, pending = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children }, children }),
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useEffect(fn, deps) { const i = cursor++; if (!effects[i] || deps.some((value, j) => value !== effects[i].deps[j])) pending.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); }
  };
  const imports = { 'react': React, '@/api/base44Client': { base44: {} }, '@/lib/guestAdsClient': { guestAdLink, loadGuestAds: (_, country) => new Promise((resolve, reject) => requests.push({ country, resolve, reject })) } };
  const module = { exports: {} };
  vm.runInNewContext(transformSync(fs.readFileSync('src/components/guest/GuestAds.jsx', 'utf8'), { loader: 'jsx', format: 'cjs' }).code, { module, exports: module.exports, require: name => imports[name] });
  let props = { countries: ['BF', 'CI'], country: '' };
  const render = next => { props = { ...props, ...next }; cursor = 0; return module.exports.default(props); };
  return { requests, states, render, flush() { const batch = pending; pending = []; batch.forEach(fn => fn()); }, close() { effects.forEach(effect => effect?.cleanup?.()); } };
}
const walk = (node, predicate) => { if (!node || typeof node !== 'object') return null; if (predicate(node)) return node; for (const child of (node.children || []).flat(Infinity)) { const found = walk(child, predicate); if (found) return found; } return null; };
const text = node => JSON.stringify(node);
const tick = () => new Promise(resolve => setImmediate(resolve));
const nextButton = tree => walk(tree, node => node.type === 'button' && node.props['aria-label'] === 'Annonce suivante');

test('country change immediately hides old ad; older requests cannot overwrite new country', async () => {
  const h = harness(); h.render(); h.flush(); h.requests[0].resolve([{ id: 'global', titre: 'GLOBAL' }]); await tick(); assert.match(text(h.render()), /GLOBAL/);
  assert.equal(h.render({ country: 'BF' }), null); h.flush(); assert.equal(h.requests[1].country, 'BF');
  assert.equal(h.render({ country: 'CI' }), null); h.flush(); h.requests[2].resolve([{ id: 'ci', titre: 'CI_ONLY' }]); await tick(); h.requests[1].resolve([{ id: 'bf', titre: 'BF_ONLY' }]); await tick();
  const output = text(h.render()); assert.match(output, /CI_ONLY/); assert.doesNotMatch(output, /BF_ONLY/); h.close();
});
test('pending and empty feed leave no advertising panel, selector or empty status', async () => {
  const h = harness(); assert.equal(h.render(), null); h.flush(); assert.equal(h.render(), null); h.requests[0].resolve([]); await tick(); assert.equal(h.render(), null); assert.equal(h.states[0].status, 'ready'); h.close();
});
test('public API error remains distinct from empty feed internally but shows no panel', async () => {
  const h = harness(); h.render(); h.flush(); h.requests[0].reject(Error('offline')); await tick(); assert.equal(h.render(), null); assert.equal(h.states[0].status, 'unavailable'); assert.equal(h.requests.length, 1); h.close();
});
test('rendered campaign matches compact client banner without guest labels or selector', async () => {
  const h = harness(); h.render({ country: 'BF' }); h.flush(); h.requests[0].resolve([{ id: 'a', titre: 'CAMPAIGN', annonceur_nom: 'PUBLIC BRAND', description: 'Public description' }]); await tick();
  const tree = h.render(); assert.match(tree.props.className, /rounded-2xl shadow-lg/); assert.match(text(tree), /CAMPAIGN/); assert.match(text(tree), /Pub/);
  assert.equal(walk(tree, node => node.type === 'select'), null); assert.doesNotMatch(text(tree), /Sans compte|Pays des annonces|Aucune annonce/); h.close();
});
test('missing, malformed or disallowed country never invents BF or widens the targeted feed', async () => {
  for (const props of [{ country: '' }, { country: 'bf' }, { country: 'XX' }, { country: 'BF', countries: [] }, { country: 'BF', countries: null }]) {
    const h = harness(); h.render(props); h.flush(); assert.equal(h.requests[0].country, ''); h.close();
  }
});
test('manual previous and next controls wrap without extra reads or tracking', async () => {
  const h = harness(); h.render(); h.flush(); h.requests[0].resolve([{ id: 'a', titre: 'FIRST' }, { id: 'b', titre: 'SECOND' }]); await tick();
  nextButton(h.render()).props.onClick(); assert.match(text(h.render()), /SECOND/); nextButton(h.render()).props.onClick(); assert.match(text(h.render()), /FIRST/);
  walk(h.render(), node => node.props?.['aria-label'] === 'Annonce précédente').props.onClick(); assert.match(text(h.render()), /SECOND/);
  nextButton(h.render()).props.onClick(); assert.match(text(h.render()), /FIRST/);
  assert.equal(walk(h.render(), node => node.type === 'button' && node.props?.['aria-current']), null);
  assert.equal(h.requests.length, 1); h.close();
});
test('country feed shrinking resets selected slide and keeps the new ad visible', async () => {
  const h = harness(); h.render(); h.flush(); h.requests[0].resolve([{ id: 'a', titre: 'FIRST' }, { id: 'b', titre: 'SECOND' }]); await tick(); nextButton(h.render()).props.onClick(); h.render();
  assert.equal(h.render({ country: 'BF' }), null); h.flush(); h.requests[1].resolve([{ id: 'only', titre: 'ONE_NEW' }]); await tick(); assert.match(text(h.render()), /ONE_NEW/); assert.equal(nextButton(h.render()), null); h.close();
});
test('unmount ignores late responses and creates no automatic retry', async () => {
  const h = harness(); h.render(); h.flush(); h.close(); h.requests[0].resolve([{ id: 'late', titre: 'LATE' }]); await tick(); assert.equal(h.states[0].status, 'loading'); assert.equal(h.requests.length, 1);
});
test('video stays voluntary with usable native controls, no autoplay or overlays over controls', async () => {
  const h = harness(); h.render(); h.flush(); h.requests[0].resolve([{ id: 'v', titre: 'VIDEO', type_media: 'video', media_url: 'https://example.com/ad.mp4' }]); await tick(); const tree = h.render(); const video = walk(tree, node => node.type === 'video');
  assert.equal(video.props.controls, true); assert.equal(video.props.preload, 'none'); assert.equal(video.props.autoPlay, undefined);
  assert.doesNotMatch(text(tree), /absolute inset-0/); h.close();
});
test('image is contained and external call to action preserves safe link attributes', async () => {
  const h = harness(); h.render(); h.flush(); h.requests[0].resolve([{ id: 'i', titre: 'IMAGE', type_media: 'image', media_url: 'https://example.com/ad.jpg', lien_url: 'https://example.com/more' }]); await tick(); const tree = h.render();
  const img = walk(tree, node => node.type === 'img'); assert.match(img.props.className, /h-40 object-contain/); assert.equal(img.props.referrerPolicy, 'no-referrer');
  const link = walk(tree, node => node.type === 'a'); assert.equal(link.props.href, 'https://example.com/more'); assert.equal(link.props.rel, 'noopener noreferrer'); h.close();
});
test('home receives the existing guest country without profile or entity access in advertising', () => {
  const page = fs.readFileSync('src/pages/GuestOrderPage.jsx', 'utf8'); const home = fs.readFileSync('src/components/guest/GuestClientHome.jsx', 'utf8');
  assert.match(page, /adCountry=\{draft\.country_code \|\| course\?\.country_code \|\| adCountry\}/);
  assert.match(page, /storage\.readCountry \? storage\.readCountry\(\) : ''/);
  assert.match(home, /<GuestAds countries=\{adCountries\} country=\{adCountry\}/);
});
