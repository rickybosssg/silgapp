import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
const source=ts.transpileModule(fs.readFileSync(new URL('../base44/functions/creerCommandePartenaireV2/entry.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const shared=['commerceSingletonJournal','commerceCreationHash'].map(n=>fs.readFileSync(new URL('../base44/shared/'+n+'.js',import.meta.url),'utf8').replace(/export /g,'')).join('\n');
async function run({ type = 'boutique', country = 'BF', individual, configured, countryRate, configError = false, countryError = false }) {
  let handler; const created = []; const countryReads = []; const configReads = [];
  const shop = { id: 'shop', actif: true, ouvert: true, pays_code: country, commission_pct: individual };
  const sdk = { entities: { Boutique: { get: async () => shop }, Restaurant: { get: async () => shop }, ClientExterne: { filter: async () => [{ id: 'client', user_email: 'fixture@example.test', country_code: country }] }, ProduitBoutique: { get: async () => ({ id: 'product', boutique_id: 'shop', prix: 1000, actif: true, disponible: true }) }, PlatRestaurant: { get: async () => ({ id: 'product', restaurant_id: 'shop', prix: 1000, actif: true, disponible: true }) } }, auth: { me: async () => ({ id:'actor',email: 'fixture@example.test' }) }, asServiceRole: { entities: {
    Boutique: { get: async () => shop }, Restaurant: { get: async () => shop },
    ClientExterne: { filter: async () => [{ id: 'client' }] },
    CommissionConfig: { filter: async () => { configReads.push(true); if (configError) throw Error('fixture failure'); return [{ [`commission_${type}_defaut`]: configured }]; } },
    Country: { filter: async q => { countryReads.push(q); if (countryError) throw Error('country read failed'); return [{ commission_pct: countryRate }]; } },
    CommandeBoutique: { create: async row => { created.push(row); return { id: 'order', ...row }; } },
    CommandeRestaurant: { create: async row => { created.push(row); return { id: 'order', ...row }; } },
  } }, functions: { invoke: async () => ({}) } };
  const sr=sdk.asServiceRole.entities;sr.ProduitBoutique=sdk.entities.ProduitBoutique;sr.PlatRestaurant=sdk.entities.PlatRestaurant;
  for(const name of ['CommandeBoutique','CommandeRestaurant'])sr[name].get=async()=>({id:'order',...created[0]});
  let root={id:'journal',state:'ready',revision:0,ledger:'[]'};
  sr.CommerceMutationJournal={get:async()=>structuredClone(root),updateMany:async(q,p)=>{if(Object.keys(q).some(k=>root[k]!==q[k]))return {success:true,updated:0};Object.assign(root,p.$set);return {success:true,updated:1};}};
  vm.runInNewContext(shared+'\n'+source, { createClientFromRequest: () => sdk, crypto:webcrypto,TextEncoder,Deno: { env:{get:()=> 'journal'},serve: fn => { handler = fn; } }, Response, console: { log() {}, error() {} } });
  const response = await handler({ method:'POST',json: async () => ({ request_id:'request',type, boutique_id: 'shop', restaurant_id: 'shop', total: 1000, items: [{ id: 'product', prix: 1000, quantite: 1 }] }) });
  return { status: response.status, body: await response.json(), created, countryReads, configReads };
}
for (const [label, args, rate] of [
  ['BF missing rates uses ten before generic country thirty', { countryRate: 30 }, 10],
  ['BF individual overrides default', { individual: 7, configured: 12, countryRate: 30 }, 7],
  ['BF explicit individual zero preserved', { individual: 0, configured: 12 }, 0],
  ['BF boutique country configured rate preserved', { configured: 12, countryRate: 30 }, 12],
  ['BF boutique country zero preserved', { configured: 0 }, 0],
  ['CI generic country fallback unchanged', { country: 'CI', countryRate: 22 }, 22],
  ['CI boutique country rate unchanged', { country: 'CI', configured: 13, countryRate: 22 }, 13],
  ['BF restaurant generic country fallback unchanged', { type: 'restaurant', countryRate: 30 }, 30],
  ['BF restaurant configured rate unchanged', { type: 'restaurant', configured: 14 }, 14],
]) test(label, async () => { const r = await run(args); assert.equal(r.status, 200); assert.equal(r.created.length, 1); assert.equal(r.created[0].commission_pct, rate); assert.equal(r.created[0].commission_montant, rate * 10); });
for (const args of [{ country: 'CI' }, { type: 'restaurant' }]) test(`missing commission still rejects ${args.country || args.type}`, async () => { const r = await run(args); assert.equal(r.status, 400); assert.equal(r.created.length, 0); });
test('BF ten skips generic Country read', async () => { const r = await run({ countryRate: 30 }); assert.equal(r.countryReads.length, 0); });

for (const args of [{ configError: true }, { country: 'CI', configError: true, countryRate: 25 }, { type: 'restaurant', configError: true, countryRate: 30 }, { country: 'CI', countryError: true }, { type: 'restaurant', countryError: true }]) test('commission read failure is 503: '+JSON.stringify(args), async () => { const r = await run(args); assert.equal(r.status, 503); assert.equal(r.created.length, 0); if(args.configError) assert.equal(r.countryReads.length, 0); });
test('individual commission skips both configuration lookups even when unavailable', async () => { const r = await run({ individual: 7, configError: true, countryError: true }); assert.equal(r.status, 200); assert.equal(r.created[0].commission_pct, 7); assert.equal(r.configReads.length, 0); assert.equal(r.countryReads.length, 0); });
