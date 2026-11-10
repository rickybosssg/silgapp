import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createDriverAcceptanceAudio, isFreshDriverAcceptance } from '../src/lib/driverAcceptanceAudio.js';
import { APPROVED_COURSE_EXCERPT } from '../src/lib/approvedCourseExcerpt.js';

const event = (key = 'course:one', receipt = { success: true, accepted: true }) => ({ key, receipt });
function harness(extra = {}) {
  const sounds = [], timers = new Map(); let serial = 0;
  const player = createDriverAcceptanceAudio({ url: '/mock-approved.mp3', isVisible: () => true,
    createAudio(src) { const listeners = {}; const sound = { src, listeners, pause() { this.paused = true; }, addEventListener(k, cb) { listeners[k] = cb; }, async play() { this.started = true; } }; sounds.push(sound); return sound; },
    schedule(cb, ms) { assert.equal(ms, 25000); timers.set(++serial, cb); return serial; }, unschedule(id) { timers.delete(id); }, ...extra });
  return { player, sounds, timers };
}
test('approved excerpt is byte-identical; disabled configuration never creates Audio or a request', async () => {
  assert.equal(createHash('sha256').update(fs.readFileSync('public' + APPROVED_COURSE_EXCERPT.url)).digest('hex'), APPROVED_COURSE_EXCERPT.sha256);
  assert.equal(APPROVED_COURSE_EXCERPT.expectedPath, '/sounds/shared/SILGAPP_extrait_approuve_25s.mp3');
  let creates = 0;
  const player = createDriverAcceptanceAudio({ url: null, isVisible: () => true, createAudio() { creates++; throw Error(); } });
  assert.equal(await player.play(event()), false); assert.equal(creates, 0);
});
test('only a fresh confirmed success may sound; errors, pending, cancellation and retries are silent', async () => {
  const { player, sounds } = harness();
  const denied = [null, {}, { success: false }, { success: 'true' }, { success: true, accepted: false }, { success: true, already_accepted: true }, { success: true, already_taken: true }, { success: true, expired: true }, { success: true, pending_client_validation: true }];
  for (const receipt of denied) { assert.equal(isFreshDriverAcceptance(receipt), false); assert.equal(await player.play(event('course:one', receipt)), false); }
  assert.equal(sounds.length, 0);
  assert.equal(await player.play(event()), true);
  assert.equal(await player.play(event()), false); assert.equal(sounds.length, 1);
  player.dispose();
});
test('direct and enveloped success are accepted once; new success interrupts old clip', async () => {
  const { player, sounds, timers } = harness();
  await player.play(event()); await player.play(event('mission:two', { data: { success: true, accepted: true } }));
  assert.equal(sounds.length, 2); assert.equal(sounds[0].paused, true); assert.equal(sounds[1].loop, false); assert.equal(timers.size, 1);
  sounds[0].listeners.ended(); assert.equal(timers.size, 1);
  sounds[1].listeners.ended(); assert.equal(timers.size, 0);
});
test('stops after 25s, and page disposal prevents late completion playback', async () => {
  const a = harness(); await a.player.play(event()); [...a.timers.values()][0](); assert.equal(a.sounds[0].paused, true); assert.equal(a.timers.size, 0);
  a.player.dispose(); assert.equal(await a.player.play(event('late')), false);
});
test('background stops current clip, consumes hidden events, and never resumes them', async () => {
  const a = harness(); await a.player.play(event()); a.player.setForeground(false); assert.equal(a.sounds[0].paused, true);
  assert.equal(await a.player.play(event('hidden')), false); a.player.setForeground(true); assert.equal(await a.player.play(event('hidden')), false); assert.equal(a.sounds.length, 1);
});
test('autoplay rejection is contained and never automatically retried', async () => {
  let calls = 0;
  const a = harness({ createAudio() { return { addEventListener() {}, pause() {}, play() { calls++; return Promise.reject(Error('NotAllowed')); } }; } });
  assert.equal(await a.player.play(event()), false); assert.equal(a.timers.size, 0); assert.equal(await a.player.play(event()), false); assert.equal(calls, 1);
});
test('pending play promise cannot restart after navigation or disposal', async () => {
  let resolve; let paused = 0;
  const a = harness({ createAudio() { return { addEventListener() {}, pause() { paused++; }, play: () => new Promise(r => { resolve = r; }) }; } });
  const result = a.player.play(event()); a.player.dispose(); resolve(); assert.equal(await result, false); assert.ok(paused >= 1); assert.equal(a.timers.size, 0);
});
test('all confirmed acceptance callbacks carry receipts; durable owner survives closing cards', () => {
  const read = p => fs.readFileSync(p, 'utf8');
  assert.match(read('src/components/livreur/CoursesDisponibles.jsx'), /onAcceptSuccess\(\{ key: `course:\$\{course.id\}`, receipt: data \}\)/);
  assert.match(read('src/components/livreur/EcoMissionCard.jsx'), /onAcceptSuccess\?\.\(\{ key: `mission:\$\{mission.id\}`, receipt: data \}\)/);
  assert.match(read('src/components/livreur/OnRouteProposalCard.jsx'), /onAcceptSuccess\?\.\(\{ key:.*receipt: res \}\)/);
  const modal = read('src/components/livreur/CourseEnAttenteModalExterne.jsx');
  assert.equal((modal.match(/receipt: data/g) || []).length, 6);
  const page = read('src/pages/LivreurExterneApp.jsx');
  assert.match(page, /useDriverAcceptanceAudio\(livreurId, activeTab\)/);
  assert.match(page, /handleAccepter\(data\?\.pending_client_validation === true, \{ key: `course:\$\{course.id\}`, receipt: data \}\)/);
  const hook = read('src/hooks/useDriverAcceptanceAudio.js');
  assert.match(hook, /appStateChange/); assert.match(hook, /visibilitychange/); assert.match(hook, /audio.dispose\(\)/);
  assert.match(hook, /activeTab !== 'courses'/);
  assert.doesNotMatch(read('src/lib/driverAcceptanceAudio.js'), /startUrgentCourseAlert/);
});
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
function actualHandler(file, name, scope) {
  const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  let found;
  function walk(n) { if (!n || typeof n !== 'object') return; if (n.type === 'VariableDeclarator' && n.id?.name === name) found = n.init; for (const [key, value] of Object.entries(n)) if (!['loc', 'tokens', 'comments'].includes(key)) { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value); } }
  walk(ast); assert.ok(found, name);
  return new Function(...Object.keys(scope), `return (${generate(found).code});`)(...Object.values(scope));
}
for (const [file, name, kind] of [
  ['CoursesDisponibles', 'handleAcceptClick', 'standard'],
  ['EcoMissionCard', 'handleAccept', 'eco'],
  ['OnRouteProposalCard', 'handleAccept', 'route'],
  ['CourseEnAttenteModalExterne', 'handleAccepterAdminManuel', 'modal'],
  ['CourseEnAttenteModalExterne', 'handleAccepterAuto', 'modal'],
  ['CourseEnAttenteModalExterne', 'handleAccepterManuel', 'manual'],
  ['PAGE', 'handleFallbackAccepter', 'fallback'],
]) {
  test(`actual ${file}.${name}: only confirmed success carries a playable receipt`, async () => {
    for (const receipt of [{ success: true, accepted: true }, { success: false }, { success: true, accepted: false }, { success: true, already_accepted: true }, { success: true, pending_client_validation: true }, new Error('network')]) {
      const events = [], requests = [];
      const course = { id: 'test-only', country_code: 'XX' };
      const noop = () => {};
      const scope = {
        course, livreurId: 'driver', livreurProfil: { id: 'driver' }, mission: { id: 'mission' }, courses: [course], proposal: { proposal_id: 'proposal', course_id: course.id },
        isSubmitting: false, accepting: false, acceptingId: null, responding: false, isExpired: false, canAccept: true, blockedReason: null, fallbackAcceptingRef: { current: false }, pricingMode: 'automatic',
        base44: { functions: { async invoke(...args) { requests.push(args); if (receipt instanceof Error) throw receipt; return receipt; } } },
        displayedPriceQuote: () => ({}), prixCourseEco: () => 100, getPrixAffichable: () => 100,
        setAcceptingId: noop, setAccepting: noop, setResponding: noop, setIsSubmitting: noop, setShowManualPriceModal: noop, setCourseDejaPrise: noop, setCourseExpiree: noop,
        queryClient: { invalidateQueries: noop }, toast: { success: noop, error: noop }, alert: noop, console: { error: noop }, stopUrgentCourseAlert: noop, logAcceptationLivreur: noop, onDismiss: noop,
        onAcceptSuccess: e => events.push(e), onAccepter: (_pending, e) => events.push(e), handleAccepter: (_pending, e) => events.push(e),
      };
      const handler = actualHandler(file === 'PAGE' ? 'src/pages/LivreurExterneApp.jsx' : `src/components/livreur/${file}.jsx`, name, scope);
      await handler(kind === 'manual' ? 100 : course);
      assert.equal(requests.length, 1);
      const { player, sounds } = harness();
      for (const e of events) await player.play(e);
      assert.equal(sounds.length, isFreshDriverAcceptance(receipt) ? 1 : 0, JSON.stringify(receipt));
      player.dispose();
    }
  });
}
import vm from 'node:vm';
import { transformSync } from 'esbuild';
test('actual dashboard hook survives automatic tab return, stops navigation/background/unmount and fences old driver callbacks', async () => {
  let cursor = 0, pending = [], stateListener;
  const slots = [], controllers = [], listeners = {};
  const react = {
    useRef(v) { const i=cursor++; return slots[i] ||= { current:v }; },
    useCallback(fn, deps) { const i=cursor++; const old=slots[i]; if (!old || deps.some((v,j)=>v!==old.deps[j])) slots[i]={deps,fn}; return slots[i].fn; },
    useEffect(fn, deps) { const i=cursor++; const old=slots[i]; if (!old || deps.some((v,j)=>v!==old.deps[j])) pending.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};}); },
  };
  const document = { visibilityState:'visible', addEventListener(k,fn){listeners[k]=fn;},removeEventListener(k){delete listeners[k];} };
  const window = { addEventListener(k,fn){listeners[k]=fn;},removeEventListener(k){delete listeners[k];} };
  const imports = { react, '@capacitor/app':{App:{async addListener(_name,fn){stateListener=fn;return {async remove(){}};}}}, '@/lib/driverAcceptanceAudio':{createDriverAcceptanceAudio(){const c={plays:[],stops:0,foreground:true,disposed:false,play(e){this.plays.push(e);},stop(){this.stops++;},setForeground(v){this.foreground=v;if(!v)this.stop();},dispose(){this.disposed=true;this.stop();}};controllers.push(c);return c;}} };
  const module={exports:{}};
  vm.runInNewContext(transformSync(fs.readFileSync('src/hooks/useDriverAcceptanceAudio.js','utf8'),{format:'cjs'}).code,{module,exports:module.exports,require:k=>imports[k],document,window});
  const render=(driver,tab)=>{cursor=0;const callback=module.exports.useDriverAcceptanceAudio(driver,tab);pending.splice(0).forEach(fn=>fn());return callback;};
  const accepted=render('driver','disponibles'); accepted(event()); const c=controllers[0], stops=c.stops;
  render('driver','courses'); assert.equal(c.stops,stops); assert.equal(controllers.length,1);
  render('driver','historique'); assert.equal(c.stops,stops+1); accepted(event('late')); assert.equal(c.plays.length,1);
  render('driver','courses'); stateListener({isActive:false}); assert.equal(c.foreground,false);
  stateListener({isActive:true}); assert.equal(c.plays.length,1);
  document.visibilityState='hidden';listeners.visibilitychange();assert.equal(c.foreground,false);
  render('other-driver','courses');assert.equal(c.disposed,true);accepted(event('old-driver'));assert.equal(controllers[1].plays.length,0);
  slots.forEach(s=>s?.cleanup?.());assert.equal(controllers[1].disposed,true);assert.equal(Object.keys(listeners).length,0);
  await Promise.resolve();
});
test('client tracking search, acceptance and refusal use the requested 11-second ringtone', async () => {
  const sounds=[];globalThis.document={visibilityState:'visible'};globalThis.Audio=class {constructor(src){sounds.push(src);}addEventListener(){}pause(){}async play(){}};
  const {playClientCourseAudio,stopClientCourseAudio}=await import('../src/lib/clientCourseAudio.js');
  try { await playClientCourseAudio('search');await playClientCourseAudio('acceptance');await playClientCourseAudio('refusal');assert.deepEqual(sounds,Array(3).fill('/sounds/shared/SILGAPP_sonnerie_suivi_11s.mp3')); }
  finally {stopClientCourseAudio();delete globalThis.document;delete globalThis.Audio;}
});
