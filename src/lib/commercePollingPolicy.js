// Dormant: no timer or subscription starts here. Feed only current scoped query state.
// Query keys must include session user, profile/parent, country, audience and type.
// Clear scoped cached data at logout/scope change; a polling delay is not authorization.
export function commercePollingOptions({ enabled=false, visible=false, status=null, failureCount=0, retryAfterMs=0, audience='client' }={}) {
  const stop = !enabled || !visible || [400,401,403,404].includes(status);
  let interval = false;
  if (!stop) {
    const failures = Number.isSafeInteger(failureCount) && failureCount > 0 ? Math.min(failureCount,10) : 0;
    const failed = failures > 0 || status === 429 || (Number.isFinite(status) && status >= 500);
    const baseline = audience === 'partner' ? 30000 : 60000;
    const backoff = failed ? Math.min(300000,60000 * 2 ** Math.max(0,failures-1)) : baseline;
    const serverDelay = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 0;
    interval = Math.max(backoff,serverDelay);
  }
  return { retry:false, refetchInterval:interval, refetchIntervalInBackground:false, refetchOnWindowFocus:false, refetchOnReconnect:false };
}

