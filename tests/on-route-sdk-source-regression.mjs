import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hook = readFileSync('src/hooks/useOnRouteProposals.js', 'utf8');
const card = readFileSync('src/components/livreur/OnRouteProposalCard.jsx', 'utf8');
assert.match(hook, /const res = rawRes\?\.data \?\? rawRes;/);
assert.equal((card.match(/const res = rawRes\?\.data \?\? rawRes;/g) || []).length, 2);
assert.match(card, /response: "accept"/);
assert.match(card, /response: "refuse"/);
assert.match(card, /isExpired/);
console.log('PASS on-route SDK source wiring (static checks, not backend validation)');

async function exercise(name, body, expired = false) {
  const start = card.indexOf(`const ${name} = async () => {`);
  const end = card.indexOf('\n  };', start) + '\n  };'.length;
  assert.ok(start >= 0 && end > start);
  const calls = [];
  const notifications = [];
  let dismissed = false;
  const factory = new Function('base44', 'proposal', 'livreurProfil', 'responding',
    'isExpired', 'setResponding', 'toast', 'queryClient', 'onDismiss',
    `${card.slice(start, end)}; return ${name};`);
  const handler = factory({ functions: { invoke: async (...args) => {
    calls.push(args); return { data: body };
  } } }, { proposal_id: 'test-proposal' }, { id: 'test-driver' }, false,
  expired, () => {}, {
    success: text => notifications.push(text), info: text => notifications.push(text),
    error: text => notifications.push(text),
  }, { invalidateQueries: () => {} }, () => { dismissed = true; });
  await handler();
  return { calls, notifications, dismissed };
}

assert.equal((await exercise('handleAccept', { success: true, accepted: true })).dismissed, true);
assert.equal((await exercise('handleRefuse', { success: true, accepted: false })).dismissed, true);
const expired = await exercise('handleAccept', { reason: 'proposal_expired' });
assert.equal(expired.dismissed, false);
assert.match(expired.notifications[0], /expir/);
assert.equal((await exercise('handleAccept', {}, true)).calls.length, 0);
console.log('PASS actual accept/refuse/expiry handlers with simulated SDK; no production calls');
