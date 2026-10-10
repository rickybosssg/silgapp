import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = p => fs.readFileSync(p, 'utf8');
const compile = s => ts.transpileModule(s.replace(/^import .*;\r?\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const helpers = { exports: {} };
vm.runInNewContext(compile(read('base44/shared/phoneUtils.ts')), helpers);
async function lookup(user, rows, phone = '70123456', countryCode = 'TG') {
  const calls = [];
  const ctx = { exports: {}, Response, ...helpers.exports, createClientFromRequest: () => ({
    auth: { me: async () => user }, asServiceRole: { entities: { ClientExterne: {
      filter: async query => { calls.push(query); return rows.filter(r => Object.entries(query).every(([k, v]) => r[k] === v)); },
    } } },
  }) };
  vm.runInNewContext(compile(read('base44/functions/findContactByPhoneSecure/entry.ts')), ctx);
  const response = await ctx.exports.default(new Request('http://localhost/test', {
    method: 'POST', body: JSON.stringify({ phone, countryCode }),
  }));
  return { data: await response.json(), status: response.status, calls };
}
const unauth = await lookup(null, []);
assert.equal(unauth.status, 401);
assert.equal(unauth.calls.length, 0);
const rows = [
  { id: 'wrong-country', telephone: '22670123456', country_code: 'BF', user_email: 'private-bf@example.test' },
  { id: 'crm', telephone: '70123456', country_code: 'TG', nom: 'CRM', notes_admin: 'private' },
  { id: 'app', telephone: '+22870123456', telephone_normalized: '22870123456', country_code: 'TG', user_email: 'private-tg@example.test', nom: 'App' },
];
const result = await lookup({ email: 'qa@example.test' }, rows);
assert.equal(result.data.id, 'app', 'country-aware variants must not prioritize an unrelated BF account');
assert.equal(result.data.has_app_account, true);
assert.ok(!JSON.stringify(result.data).includes('private'));
assert.ok(!('user_email' in result.data));
const crm = await lookup({ email: 'qa@example.test' }, rows.slice(1, 2));
assert.equal(crm.data.has_app_account, false);
const crossCountry = await lookup({ email: 'qa@example.test' }, rows.slice(0, 2));
assert.equal(crossCountry.data.id, 'crm', 'a BF App account must not replace a TG CRM contact');
const missing = await lookup({ email: 'qa@example.test' }, []);
assert.equal(missing.data.found, false);
console.log('PASS: authenticated minimal contact response, App priority, CRM, absent, country isolation.');

const front = { exports: {}, console, base44: {} };
vm.runInNewContext(compile(read('src/lib/phoneUtils.js')), front);
front.exports.SILGAPP_COUNTRIES.push(
  { code: 'TG', dial: '228', len: 8, min_len: 8, max_len: 8 },
  { code: 'BJ', dial: '229', len: 10, min_len: 10, max_len: 10 },
  { code: 'CI', dial: '225', len: 10, min_len: 10, max_len: 10 },
  { code: 'MA', dial: '212', len: 9, min_len: 9, max_len: 9 },
);
const validPhone = front.exports.getValidContactPhone;
assert.equal(typeof validPhone, 'function');
for (const [phone, cc, expected] of [
  ['+226 70 12 34 56', 'BF', '22670123456'], ['70123456', 'TG', '22870123456'],
  ['0197123456', 'BJ', '2290197123456'], ['+2290197123456', 'BJ', '2290197123456'],
  ['0701234567', 'CI', '2250701234567'], ['0612345678', 'MA', '212612345678'],
  ['701234567899', 'BF', null], ['+2250701234567', 'BF', null], ['70', 'BF', null],
]) assert.equal(validPhone(phone, cc), expected, `${cc} ${phone}`);
for (const path of ['src/components/client/CourseStepForm.jsx', 'src/components/multi-colis/ColisDestinataireForm.jsx']) {
  const source = read(path);
  assert.match(source, /getValidContactPhone/);
  assert.ok(!/findClientByPhone\(base44, phone\)/.test(source));
  assert.ok(!/(?:recipient|expediteur)_has_app:\s*true|update\("recipient_has_app", true\)/.test(source));
  assert.match(source, /600/);
}
console.log('PASS: official country normalization/validation, no truncation of invalid input, CRM flags.');
