import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireQuerySubscription as acquire } from '../src/lib/sharedQuerySubscription.js';
import { createRealtimeRefresh } from '../src/lib/sharedQuerySubscription.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
test('a realtime burst performs one read and retains one trailing read after an in-flight event', async () => {
  let release, reads = 0;
  const queued = createRealtimeRefresh(async () => {
    reads++;
    if (reads === 1) await new Promise(resolve => { release = resolve; });
  }, 5);
  for (let i = 0; i < 20; i++) queued.schedule();
  await wait(20); assert.equal(reads, 1);
  for (let i = 0; i < 20; i++) queued.schedule();
  await wait(20); assert.equal(reads, 1, 'running read is not restarted');
  release(); await wait(25); assert.equal(reads, 2, 'latest entity update is fetched without remount');
  queued.stop(); queued.schedule(); await wait(20); assert.equal(reads, 2);
});
test('unmount cancels a scheduled refresh, and a failed read retains a later event', async () => {
  let calls = 0, reject;
  const stopped = createRealtimeRefresh(() => calls++, 5);
  stopped.schedule(); stopped.stop(); await wait(20); assert.equal(calls, 0);
  const next = createRealtimeRefresh(() => { calls++; return calls === 1 ? new Promise((_, fail) => { reject = fail; }) : undefined; }, 5);
  next.schedule(); await wait(20); next.schedule(); reject(Error('synthetic outage'));
  await wait(25); assert.equal(calls, 2); next.stop();
});

test('same owner and scope share one listener until the last observer leaves', () => {
  const owner = {}, events = []; let listener, subscriptions = 0, cleanups = 0;
  const subscribe = () => { subscriptions++; listener = value => events.push(value); return () => { cleanups++; listener = null; }; };
  const first = acquire(owner, 'BF/driver/public', subscribe);
  const second = acquire(owner, 'BF/driver/public', subscribe);
  assert.equal(subscriptions, 1);
  listener('changed'); assert.deepEqual(events, ['changed']);
  first(); first(); assert.equal(cleanups, 0, 'cleanup is idempotent and retains the remaining observer');
  listener('again'); assert.deepEqual(events, ['changed', 'again']);
  second(); assert.equal(cleanups, 1); assert.equal(listener, null);
  const remount = acquire(owner, 'BF/driver/public', subscribe);
  assert.equal(subscriptions, 2); remount(); assert.equal(cleanups, 2);
});

test('account, country, tenant and query-client scopes remain independent', () => {
  const owner = {}, other = {}; let opened = 0, closed = 0;
  const subscribe = () => { opened++; return () => closed++; };
  const cleanups = ['BF/a/public', 'CI/a/public', 'BF/b/public', 'BF/a/private'].map(scope => acquire(owner, scope, subscribe));
  cleanups.push(acquire(other, 'BF/a/public', subscribe));
  assert.equal(opened, 5);
  cleanups[0](); assert.equal(closed, 1);
  const same = acquire(owner, 'CI/a/public', subscribe); assert.equal(opened, 5);
  cleanups.slice(1).forEach(cleanup => cleanup()); assert.equal(closed, 4);
  same(); assert.equal(closed, 5);
});

test('failed subscription is not retained and next mount retries', () => {
  const owner = {}; let calls = 0;
  assert.throws(() => acquire(owner, 'scope', () => { calls++; throw Error('synthetic subscribe failure'); }), /synthetic/);
  const cleanup = acquire(owner, 'scope', () => { calls++; return () => {}; });
  assert.equal(calls, 2); cleanup();
});
