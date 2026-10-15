import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const fake = 'SYNTHETIC_SESSION_DO_NOT_USE';
function bootstrap({ pathname = '/auth-callback', search = '', cookie = '', failStorage = false } = {}) {
  const logs = [], redirects = [], cleaned = [], listeners = {}, stored = new Map();
  const window = {
    location: { pathname, search, hash: '', replace: url => redirects.push(url) },
    history: { replaceState: (_state, _title, url) => cleaned.push(url) },
    addEventListener: (name, callback) => { listeners[name] = callback; },
  };
  const document = { cookie, title: 'SILGAPP' };
  const localStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => {
      if (failStorage) throw new Error(fake);
      stored.set(key, value);
    },
  };
  const console = Object.fromEntries(['log', 'error'].map(name => [name, (...args) => logs.push(args)]));
  const context = vm.createContext({ window, document, localStorage, console, Date, URLSearchParams });
  for (const script of scripts) vm.runInContext(script, context);
  return { window, document, logs, redirects, cleaned, listeners, stored };
}

let cases = 0;
const check = (name, run) => { run(); cases++; console.log(`PASS ${name}`); };
check('managed web callback is cleaned and never forwarded into an app URL', () => {
  const result = bootstrap({ search: `?access_token=${fake}&state=synthetic-state` });
  assert.equal(result.stored.get('base44_access_token'), fake);
  assert.deepEqual(result.redirects, []);
  assert.deepEqual(result.cleaned, ['/auth-callback?state=synthetic-state']);
  assert.ok(!JSON.stringify(result.logs).includes(fake));
});
check('invalid bearer query is never printed', () => {
  const result = bootstrap({ search: '?access_token=secret' });
  assert.equal(result.stored.size, 0);
  assert.deepEqual(result.cleaned, ['/auth-callback']);
  assert.ok(!JSON.stringify(result.logs).includes('secret'));
  assert.deepEqual(result.redirects, []);
});
check('cookie restoration preserves existing startup without exposing its value', () => {
  const result = bootstrap({ pathname: '/', cookie: `silgapp_auth_token=${fake}` });
  assert.equal(result.stored.get('base44_access_token'), fake);
  assert.ok(!JSON.stringify(result.logs).includes(fake));
});
check('storage exceptions cannot print session-bearing error messages', () => {
  const result = bootstrap({ search: `?access_token=${fake}`, cookie: `silgapp_auth_token=${fake}`, failStorage: true });
  assert.deepEqual(result.cleaned, ['/auth-callback']);
  assert.ok(!JSON.stringify(result.logs).includes(fake));
});
check('global error diagnostics omit URL, message and stack credentials', () => {
  const result = bootstrap();
  result.listeners.error({ message: `${fake} before initialization`, filename: `https://example.test/?access_token=${fake}`,
    lineno: 12, colno: 3, error: { name: 'ReferenceError', stack: fake } });
  assert.ok(!JSON.stringify(result.logs).includes(fake));
  assert.ok(JSON.stringify(result.logs).includes('ReferenceError'));
});
check('promise rejection diagnostics never serialize an HTTP request object', () => {
  const result = bootstrap();
  result.listeners.unhandledrejection({ reason: { name: fake, config: { headers: { Authorization: fake } } } });
  assert.ok(!JSON.stringify(result.logs).includes(fake));
});
check('authentication error logging never serializes SDK errors or stacks', () => {
  for (const file of ['../src/components/auth/AuthGate.jsx', '../src/api/base44Client.js']) {
    const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    const calls = [...source.matchAll(/console\.error\(([^;]+)\);/g)];
    assert.ok(calls.length > 0);
    for (const call of calls) assert.match(call[1], /^(?:"[^"\n]*"|'[^'\n]*')$/, file);
  }
});
console.log(`${cases}/${cases} bootstrap privacy cases passed; no network or real session used.`);
