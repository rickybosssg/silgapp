import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import * as contract from '../base44/shared/eventMusicContract.js';

const source = fs.readFileSync('src/pages/AdminGlobal.jsx', 'utf8');
function harness(api) {
  let state = null, effect, cleanup, deps, pending, currentApi = api;
  const react = {
    useState: () => [state, value => { state = value; }],
    useEffect(fn, next) {
      if (!deps || next[0] !== deps[0]) { deps = next; pending = fn; }
    },
  };
  const Panel = () => { throw Error('The settings panel is not mounted by this guard harness'); };
  const imports = { react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '../../base44/shared/eventMusicContract.js': contract, '@/components/admin/EventMusicSettings.jsx': { default: Panel }, '@/api/base44Client': { base44: api } };
  const module = { exports: {} };
  vm.runInNewContext(transformSync(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code,
    { module, exports: module.exports, require: name => imports[name] || {} });
  return {
    render(nextApi = currentApi) {
      currentApi = nextApi;
      const tree = module.exports.EventMusicAdminPanel({ api: nextApi });
      if (pending) { cleanup?.(); effect = pending; pending = null; cleanup = effect(); }
      return tree;
    },
    async settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); },
    unmount() { cleanup?.(); },
  };
}
const admin = { id: 'global', role: 'admin', admin_type: 'global' };
for (const [label, user, allowed] of [
  ['global admin', admin, true],
  ['legacy unscoped admin', { id: 'legacy', role: 'admin' }, true],
  ['country admin', { ...admin, admin_type: 'pays', country_code: 'BF' }, false],
  ['enterprise admin', { ...admin, enterprise_id: 'enterprise' }, false],
  ['nested enterprise scope', { ...admin, data: { enterprise_id: 'enterprise' } }, false],
  ['conflicting scoped role', { ...admin, silgapp_role: 'admin_pays' }, false],
  ['client', { ...admin, role: 'user' }, false],
  ['anonymous', null, false],
]) test(`music panel visibility: ${label}`, async () => {
  let settingsCalls = 0;
  const api = { auth: { me: async () => user }, functions: { invoke: () => { settingsCalls++; } } };
  const h = harness(api);
  assert.equal(h.render(), null, 'hidden while identity is unresolved');
  await h.settle();
  assert.equal(!!h.render(), allowed);
  assert.equal(settingsCalls, 0, 'guard never calls settings or upload');
  h.unmount();
});
test('failed identity lookup stays hidden', async () => {
  const h = harness({ auth: { me: async () => { throw Error('offline'); } } });
  assert.equal(h.render(), null); await h.settle(); assert.equal(h.render(), null);
});
test('identity from a replaced API cannot expose settings or overwrite newer denial', async () => {
  let resolve;
  const oldApi = { auth: { me: () => new Promise(r => { resolve = r; }) } };
  const newApi = { auth: { me: async () => null } };
  const h = harness(oldApi); h.render(); await h.settle();
  assert.equal(h.render(newApi), null); await h.settle();
  resolve(admin); await h.settle(); assert.equal(h.render(), null);
});
test('authorized cached identity is hidden immediately when API changes', async () => {
  const h = harness({ auth: { me: async () => admin } }); h.render(); await h.settle(); assert.ok(h.render());
  assert.equal(h.render({ auth: { me: async () => null } }), null); await h.settle(); assert.equal(h.render(), null);
});
test('late identity after unmount cannot authorize', async () => {
  let resolve;
  const h = harness({ auth: { me: () => new Promise(r => { resolve = r; }) } });
  h.render(); await h.settle(); h.unmount(); resolve(admin); await h.settle(); assert.equal(h.render(), null);
});
test('Admin Global mounts only the guard and shares the exact server predicate', () => {
  assert.match(source, /import \{ isEventMusicAdmin \} from "\.\.\/\.\.\/base44\/shared\/eventMusicContract\.js"/);
  const page = source.slice(source.indexOf('export default function AdminGlobal'));
  assert.match(page, /<EventMusicAdminPanel \/>/);
  assert.doesNotMatch(page, /<EventMusicSettings\b/);
});