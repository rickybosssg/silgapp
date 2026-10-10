import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync('base44/functions/upsertClientAddressSecure/entry.ts', 'utf8');
const compiled = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const schema = JSON.parse(fs.readFileSync('base44/entities/ClientAddress.jsonc', 'utf8'));
assert.ok(!schema.required.includes('client_user_email'));
for (const operation of ['read', 'create', 'update', 'delete']) {
  assert.deepEqual(schema.rls[operation].$or, [
    { 'data.client_user_email': '{{user.email}}' }, { user_condition: { role: 'admin' } },
  ]);
}
const rows = [{ id: 'historical', client_id: 'client', role: 'delivery', adresse: 'A' }];
let calls = 0;
async function run(user) {
  const accessible = row => user?.role === 'admin' || row.client_user_email === user?.email;
  const ctx = { exports: {}, Response, createClientFromRequest: () => ({
    auth: { me: async () => user }, entities: { ClientAddress: {
      filter: async query => { calls++; return rows.filter(r => accessible(r) && Object.entries(query).every(([k,v]) => r[k] === v)); },
      create: async data => { assert.equal(data.client_user_email, user.email); const row = { id: `new-${rows.length}`, ...data }; rows.push(row); return row; },
      update: async (id, data) => { const row = rows.find(r => r.id === id); assert.ok(accessible(row)); Object.assign(row, data); },
    } },
  }) };
  vm.runInNewContext(compiled, ctx);
  return ctx.exports.default(new Request('http://localhost/test', { method: 'POST', body: JSON.stringify({
    clientId: 'client', role: 'delivery', client_user_email: 'victim@example.test', countryCode: 'BF',
    addressData: { adresse: 'A', client_user_email: 'victim@example.test' },
  }) }));
}
assert.equal((await run(null)).status, 401);
assert.equal(calls, 0);
await run({ email: 'a@example.test' });
await run({ email: 'b@example.test' });
assert.equal(rows.length, 3);
assert.equal(rows[1].client_user_email, 'a@example.test');
assert.equal(rows[2].client_user_email, 'b@example.test');
await run({ email: 'a@example.test' });
assert.equal(rows.length, 3);
assert.equal(rows[1].nb_utilisations, 2);
assert.equal(rows[2].nb_utilisations, 1);
assert.ok(!('client_user_email' in rows[0]));
assert.ok(!('nb_utilisations' in rows[0]));
const carnet = JSON.parse(fs.readFileSync('base44/entities/ContactCarnet.jsonc', 'utf8'));
for (const key of ['adresse', 'quartier', 'ville', 'latitude', 'longitude', 'client_user_email']) assert.ok(carnet.properties[key]);
assert.ok(carnet.rls.read && carnet.rls.update && carnet.rls.delete);
console.log('PASS: auth ownership, spoof rejected, two-account RLS simulation, legacy untouched, ContactCarnet schema. Production RLS not exercised.');
