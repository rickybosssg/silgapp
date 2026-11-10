import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import * as contract from '../base44/shared/eventMusicContract.js';
import * as settings from '../src/lib/eventMusicSettings.js';
import * as importer from '../src/lib/eventMusicImport.js';
import { createDriverAcceptanceAudio } from '../src/lib/driverAcceptanceAudio.js';
import { playClientCourseAudio, stopClientCourseAudio } from '../src/lib/clientCourseAudio.js';

const picks = () => ({ ...contract.EVENT_MUSIC_DEFAULT_SELECTIONS });
const configuration = (revision = 0, selections = picks()) => ({ revision, selections });
const response = (revision = 0, selections = picks()) => ({ success: true, writable: true, configuration: configuration(revision, selections) });

test('unavailable configuration uses approved tracking ringtone; only whitelisted catalog files resolve', () => {
  const store = settings.createEventMusicStore();
  assert.equal(store.track('client_search').url, '/sounds/shared/SILGAPP_sonnerie_suivi_11s.mp3');
  assert.equal(store.track('driver_acceptance').url, store.track('client_search').url);
  assert.equal(store.track('client_acceptance').id, 'tracking-ringtone');
  assert.equal(store.track('client_refusal').id, 'tracking-ringtone');
  assert.equal(store.track('unknown'), null);
  for (const track of contract.EVENT_MUSIC_TRACKS) assert.ok(fs.existsSync('public' + track.url));
});

test('invalid, partial, foreign and stale configurations cannot replace a coherent snapshot', () => {
  const store = settings.createEventMusicStore();
  const selections = { ...picks(), client_search: 'client-search', driver_acceptance: 'client-refusal' };
  assert.equal(store.apply(configuration(2, selections)), true);
  for (const value of [null, {}, configuration(-1), configuration(1.1), configuration(1), configuration(null), configuration(2), configuration(3, {}), configuration(3, { ...picks(), client_search: 'https://untrusted.example/private.mp3' })]) assert.equal(store.apply(value), false);
  assert.deepEqual(store.snapshot(), configuration(2, selections));
  const clone = store.snapshot(); clone.selections.client_search = 'client-refusal';
  assert.deepEqual(store.snapshot(), configuration(2, selections));
  assert.equal(store.apply(configuration(3, Object.fromEntries(contract.EVENT_MUSIC_EVENTS.map(e => [e.key, null])))), true);
  assert.equal(store.track('client_search').id, 'tracking-ringtone');
});

test('response parser accepts direct/enveloped confirmed data, rejects errors and malformed admin status', () => {
  assert.deepEqual(settings.parseEventMusicResponse(response()), response());
  assert.deepEqual(settings.parseEventMusicResponse({ data: response() }, true), response());
  for (const value of [null, {}, { success: true }, { ...response(), success: false }, { ...response(), error: 'failed' }, { ...response(), configuration: configuration(0, {}) }]) assert.throws(() => settings.parseEventMusicResponse(value));
  assert.throws(() => settings.parseEventMusicResponse({ success: true, configuration: configuration() }, true));
});

test('public loader coalesces reads, cools down on failure and cannot roll back an admin save', async () => {
  let now = 1000, resolve, calls = 0;
  const store = settings.createEventMusicStore();
  const refresh = settings.createEventMusicRefresh({ store, now: () => now, intervalMs: 100 });
  const api = { functions: { invoke(name, input) { assert.equal(name, 'eventMusicSettings'); assert.deepEqual(input, { action: 'public' }); calls++; return new Promise(r => { resolve = r; }); } } };
  const first = refresh(api); assert.equal(refresh(api), first); assert.equal(calls, 1);
  store.apply(configuration(4)); resolve(response(2)); assert.equal(await first, false); assert.equal(store.snapshot().revision, 4);
  assert.equal(await refresh(api), false); assert.equal(calls, 1);
  now += 101; api.functions.invoke = async () => { calls++; throw Error('offline'); };
  assert.equal(await refresh(api), false); assert.equal(await refresh(api), false); assert.equal(calls, 2);
});

function audioHarness(options = {}) {
  const sounds = [], timers = new Map(); let id = 0;
  class Audio {
    constructor(src) { this.src = src; this.listeners = {}; sounds.push(this); }
    addEventListener(key, fn) { this.listeners[key] = fn; }
    pause() { this.paused = true; }
    async play() { if (options.fail && sounds.indexOf(this) === 0) throw Object.assign(Error('media'), { name: options.fail }); }
  }
  return { Audio, sounds, timers, createAudio: src => new Audio(src), isVisible: () => true,
    schedule(fn, duration) { timers.set(++id, { fn, duration }); return id; }, unschedule(key) { timers.delete(key); } };
}

test('client picks are independent, defaults survive reset, pending playback is fenced by stop', async () => {
  const a = audioHarness(); globalThis.Audio = a.Audio; globalThis.document = { visibilityState: 'visible' };
  try {
    settings.eventMusicStore.apply(configuration(10, { ...picks(), client_search: 'client-search', client_acceptance: 'client-refusal' }));
    await playClientCourseAudio('search'); await playClientCourseAudio('acceptance');
    assert.deepEqual(a.sounds.map(s => s.src), ['/sounds/client/SILGAPP_01_recherche_douce.mp3', '/sounds/client/SILGAPP_03_refus_sobre.mp3']);
    let resolve; a.Audio.prototype.play = () => new Promise(r => { resolve = r; });
    const pending = playClientCourseAudio('search'); stopClientCourseAudio(); resolve(); assert.equal(await pending, false); assert.equal(a.sounds.at(-1).paused, true);
  } finally { stopClientCourseAudio(); delete globalThis.Audio; delete globalThis.document; }
});

test('missing configured client media falls back once; autoplay refusal never retries', async () => {
  for (const [fail, expected] of [['NotSupportedError', 2], ['NotAllowedError', 1], ['AbortError', 1]]) {
    const a = audioHarness({ fail }); globalThis.Audio = a.Audio; globalThis.document = { visibilityState: 'visible' };
    try { await playClientCourseAudio('search'); assert.equal(a.sounds.length, expected); if (expected === 2) assert.equal(a.sounds[1].src, '/sounds/shared/SILGAPP_sonnerie_suivi_11s.mp3'); }
    finally { stopClientCourseAudio(); delete globalThis.Audio; delete globalThis.document; }
  }
});

test('driver configuration is resolved at each fresh event and never replays a consumed event', async () => {
  settings.eventMusicStore.apply(configuration(11, { ...picks(), driver_acceptance: 'client-acceptance' }));
  const a = audioHarness(), player = createDriverAcceptanceAudio(a);
  const receipt = { success: true, accepted: true };
  assert.equal(await player.play({ key: 'first', receipt }), true);
  assert.equal(a.sounds[0].src, '/sounds/client/SILGAPP_02_acceptation_joyeuse.mp3');
  settings.eventMusicStore.apply(configuration(12, { ...picks(), driver_acceptance: 'client-refusal' }));
  assert.equal(await player.play({ key: 'first', receipt }), false); assert.equal(a.sounds.length, 1);
  assert.equal(await player.play({ key: 'second', receipt }), true);
  assert.equal(a.sounds[1].src, '/sounds/client/SILGAPP_03_refus_sobre.mp3'); assert.equal(a.sounds[0].paused, true);
  player.dispose(); assert.equal(a.timers.size, 0);
});

test('driver media fallback is bounded and disposal prevents late error recovery', async () => {
  const a = audioHarness({ fail: 'NotSupportedError' }), player = createDriverAcceptanceAudio(a);
  assert.equal(await player.play({ key: 'fallback', receipt: { success: true } }), true);
  assert.equal(a.sounds.length, 2); assert.equal(a.sounds[1].src, '/sounds/shared/SILGAPP_sonnerie_suivi_11s.mp3');
  player.dispose(); a.sounds[0].listeners.error(); assert.equal(a.sounds.length, 2); assert.equal(a.timers.size, 0);
});

function componentHarness(invoke) {
  let cursor = 0, effects = [], tree;
  const slots = [], listeners = {}, sounds = [], calls = [];
  const react = {
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
    useState(value) { const i = cursor++; slots[i] ||= { value: typeof value === 'function' ? value() : value }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useCallback(fn, deps) { const i = cursor++; const old = slots[i]; if (!old || deps.some((v, j) => v !== old.deps[j])) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; const old = slots[i]; if (!old || deps.some((v, j) => v !== old.deps[j])) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const api = { functions: { invoke(name, input) { calls.push(input); return invoke(input); } } };
  const document = { visibilityState: 'visible', addEventListener(k, fn) { listeners[k] = fn; }, removeEventListener(k) { delete listeners[k]; } };
  const window = { addEventListener(k, fn) { listeners[k] = fn; }, removeEventListener(k) { delete listeners[k]; } };
  class Audio { constructor(src) { this.src = src; sounds.push(this); } addEventListener() {} pause() { this.paused = true; } async play() {} }
  const jsx = (type, props) => ({ type, props });
  const imports = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/api/base44Client': { base44: api }, '../../../base44/shared/eventMusicContract.js': contract, '@/lib/eventMusicSettings': settings, '@/lib/eventMusicImport': importer };
  const module = { exports: {} };
  vm.runInNewContext(transformSync(fs.readFileSync('src/components/admin/EventMusicSettings.jsx', 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code,
    { module, exports: module.exports, require: name => imports[name], document, window, Audio, Blob, URL, crypto: { randomUUID: () => '12345678-1234-4234-9234-123456789012' }, setTimeout, clearTimeout });
  const render = () => { cursor = 0; tree = module.exports.default({ api }); effects.splice(0).forEach(fn => fn()); return tree; };
  const nodes = () => { const all = []; const walk = node => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(walk); all.push(node); walk(node.props?.children); }; walk(tree); return all; };
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  return { render, calls, sounds, document, listeners, nodes, text, button: label => nodes().find(n => n.type === 'button' && text(n).includes(label)), select: key => nodes().find(n => n.type === 'select' && n.props.id === 'event-music-' + key), unmount() { slots.forEach(s => s?.cleanup?.()); }, async settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); render(); } };
}

test('actual admin UI: four independent choices, local preview, one grouped save and double-click lock', async () => {
  let saved, finish;
  const h = componentHarness(input => input.action === 'status' ? Promise.resolve(response(20)) : new Promise(resolve => { saved = input; finish = resolve; }));
  h.render(); await h.settle(); assert.equal(h.nodes().filter(n => n.type === 'select').length, 4);
  h.select('client_search').props.onChange({ target: { value: 'client-search' } }); h.render();
  h.select('driver_acceptance').props.onChange({ target: { value: 'client-refusal' } }); h.render();
  await h.button('Écouter').props.onClick(); h.render(); assert.equal(h.calls.length, 1); assert.equal(h.sounds.length, 1);
  const save = h.button('Enregistrer tous'); save.props.onClick(); save.props.onClick(); h.render();
  assert.equal(h.calls.length, 2); assert.equal(h.sounds[0].paused, true);
  assert.equal(saved.selections.client_search, 'client-search'); assert.equal(saved.selections.driver_acceptance, 'client-refusal'); assert.equal(saved.selections.client_acceptance, 'tracking-ringtone'); assert.equal(saved.expected_revision, 20);
  finish(response(21, saved.selections)); await h.settle(); assert.match(h.text(h.nodes().find(n => n.props?.role === 'status')), /enregistrés ensemble/);
  assert.equal(h.button('Enregistrer tous').props.disabled, true); h.unmount();
});

test('actual admin UI: failed save preserves draft and locks retries until explicit read; defaults remain a draft', async () => {
  const h = componentHarness(input => input.action === 'status' ? Promise.resolve(response(22)) : Promise.reject(Error('lost reply')));
  h.render(); await h.settle(); h.select('client_search').props.onChange({ target: { value: 'client-search' } }); h.render();
  h.button('Enregistrer tous').props.onClick(); await h.settle();
  assert.equal(h.select('client_search').props.value, 'client-search'); assert.equal(h.button('Enregistrer tous').props.disabled, true); assert.match(h.text(h.nodes().find(n => n.props?.role === 'status')), /non confirmée/);
  h.button('Abandonner le brouillon').props.onClick(); await h.settle(); assert.equal(h.select('client_search').props.value, 'tracking-ringtone');
  const count = h.calls.length; h.button('Rétablir').props.onClick(); h.render(); assert.equal(h.calls.length, count); assert.equal(h.select('client_search').props.value, ''); assert.equal(h.button('Enregistrer tous').props.disabled, false); h.unmount();
});

test('actual admin UI: hidden/unmounted preview stops, unprovisioned and denied settings never save', async () => {
  const h = componentHarness(async () => ({ ...response(null), writable: false })); h.render(); await h.settle();
  assert.equal(h.button('Enregistrer tous').props.disabled, true); h.button('Écouter').props.onClick(); h.render(); h.document.visibilityState = 'hidden'; h.listeners.visibilitychange(); assert.equal(h.sounds[0].paused, true); h.unmount(); assert.equal(Object.keys(h.listeners).length, 0);
  const denied = componentHarness(async () => { throw Error('403'); }); denied.render(); await denied.settle(); assert.equal(denied.nodes().filter(n => n.type === 'select').length, 0); assert.equal(denied.button('Enregistrer tous').props.disabled, true); denied.unmount();
});

test('actual admin UI: late load after unmount never publishes configuration', async () => {
  let finish; const before = settings.eventMusicStore.snapshot(); const h = componentHarness(() => new Promise(resolve => { finish = resolve; }));
  h.render(); h.unmount(); finish(response(999)); await h.settle(); assert.deepEqual(settings.eventMusicStore.snapshot(), before);
});

function wavFile(seconds = 1, name = 'private-original-name.wav') {
  const bytes = new Uint8Array(44 + Math.round(seconds * 16000)), view = new DataView(bytes.buffer);
  for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) bytes.set(Buffer.from(text), offset);
  view.setUint32(4, bytes.length - 8, true); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, bytes.length - 44, true);
  return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer };
}

test('file picker validation rejects disguised, oversized and overlong media before upload', async () => {
  const media = await importer.prepareEventMusicFile(wavFile()); assert.equal(media.durationMs, 1000); assert.equal(media.mime, 'audio/wav');
  for (const file of [null, { name: 'track.wav', size: 4 * 1024 * 1024 }, wavFile(1, 'track.exe'), wavFile(1, 'track.mp3'), wavFile(31), { name: 'track.mp3', size: 100, arrayBuffer: async () => new Uint8Array(100).buffer }]) await assert.rejects(() => importer.prepareEventMusicFile(file));
  assert.equal(importer.validEventMusicLabel(''), false); assert.equal(importer.validEventMusicLabel('x'.repeat(61)), false); assert.equal(importer.validEventMusicLabel('Recherche calme'), true);
  assert.deepEqual(Buffer.from(importer.encodeEventMusicBytes(media.bytes), 'base64'), Buffer.from(media.bytes));
});

test('actual admin import: local selection/preview send nothing; explicit consent uploads once without changing assignments', async () => {
  const hash = 'a'.repeat(64), id = 'asset_' + hash;
  const track = { id, sha256: hash, label: 'Calme', url: 'https://media.example.test/public/audio.wav', durationMs: 1000, mime: 'audio/wav', sizeBytes: 16044 };
  let uploaded;
  const h = componentHarness(async input => {
    if (input.action === 'status') return { ...response(30), upload_enabled: true };
    uploaded = input;
    return { ...response(32), upload_enabled: true, uploaded_track: track, configuration: { ...configuration(32), tracks: [track] } };
  });
  h.render(); await h.settle();
  const fileInput = h.nodes().find(n => n.type === 'input' && n.props.type === 'file'); fileInput.props.onChange({ target: { files: [wavFile()], value: 'private-original-name.wav' } }); await h.settle();
  assert.equal(h.calls.length, 1); assert.equal(h.button('Importer dans').props.disabled, true);
  h.nodes().find(n => n.type === 'input' && n.props.type === 'text').props.onChange({ target: { value: 'Calme' } }); h.render();
  assert.equal(h.button('Importer dans').props.disabled, true);
  h.button('Écouter le fichier').props.onClick(); h.render(); assert.ok(h.sounds.at(-1).src.startsWith('blob:')); assert.equal(h.calls.length, 1);
  h.nodes().find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); h.render();
  assert.equal(h.button('Importer dans').props.disabled, false); const button = h.button('Importer dans'); button.props.onClick(); button.props.onClick(); await h.settle();
  assert.equal(h.calls.length, 2); assert.equal(uploaded.public_broadcast_consent, true); assert.equal(uploaded.label, 'Calme'); assert.equal(uploaded.expected_revision, 30); assert.equal(JSON.stringify(uploaded).includes('private-original-name'), false); assert.ok(uploaded.audio_base64.length > 0);
  assert.equal(h.select('client_search').props.value, 'tracking-ringtone'); assert.ok(h.nodes().some(n => n.type === 'option' && n.props.value === id)); assert.equal(h.button('Enregistrer tous').props.disabled, true); h.unmount();
});

test('actual admin import stays disabled while server storage is not enabled', async () => {
  const h = componentHarness(async () => ({ ...response(34), upload_enabled: false })); h.render(); await h.settle();
  h.nodes().find(n => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files: [wavFile()], value: '' } }); await h.settle();
  h.nodes().find(n => n.type === 'input' && n.props.type === 'text').props.onChange({ target: { value: 'Calme' } });
  h.nodes().find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); h.render();
  assert.equal(h.button('Importer dans').props.disabled, true); h.button('Importer dans').props.onClick(); assert.equal(h.calls.length, 1); h.unmount();
});
