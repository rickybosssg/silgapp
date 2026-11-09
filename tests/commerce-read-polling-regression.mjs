import test from 'node:test';
import assert from 'node:assert/strict';
import { commercePollingOptions } from '../src/lib/commercePollingPolicy.js';
test('polling dormant, hidden or denied sessions stop and never auto-retry',()=>{
  assert.equal(commercePollingOptions().refetchInterval,false);
  for(const status of [400,401,403,404]) assert.equal(commercePollingOptions({enabled:true,visible:true,status}).refetchInterval,false);
  assert.equal(commercePollingOptions({enabled:true,visible:false}).refetchInterval,false);
  assert.equal(commercePollingOptions().retry,false);
});
test('visible polling uses bounded baseline and suppresses focus/network bursts',()=>{
  const out=commercePollingOptions({enabled:true,visible:true});
  assert.equal(out.refetchInterval,60000);assert.equal(out.refetchOnWindowFocus,false);assert.equal(out.refetchOnReconnect,false);assert.equal(out.refetchIntervalInBackground,false);
  assert.equal(commercePollingOptions({enabled:true,visible:true,audience:'partner'}).refetchInterval,30000);
});
test('429 and server failures back off and honor longer server retry-after',()=>{
  const base={enabled:true,visible:true,audience:'partner'};
  assert.equal(commercePollingOptions({...base,status:429}).refetchInterval,60000);
  assert.equal(commercePollingOptions({...base,status:503,failureCount:3}).refetchInterval,240000);
  assert.equal(commercePollingOptions({...base,status:503,failureCount:9}).refetchInterval,300000);
  assert.equal(commercePollingOptions({...base,status:429,retryAfterMs:900000}).refetchInterval,900000);
});

