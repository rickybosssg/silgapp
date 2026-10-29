const budgets = new WeakMap();

export function isRateLimited(error) {
  return Number(error?.response?.status ?? error?.status) === 429 ||
    /rate limit exceeded|entity_list allows/i.test(String(error?.message || ''));
}

export function createFeedReadBudget(now = Date.now) {
  let until = 0, lastError;
  return {
    async read(operation) {
      if (now() < until) throw lastError;
      try { return await operation(); }
      catch (error) {
        if (isRateLimited(error)) {
          const headers = error?.response?.headers;
          const value = headers?.get?.('retry-after') ?? headers?.['retry-after'] ?? headers?.['Retry-After'];
          const seconds = Number(value);
          const wait = value != null && String(value).trim() !== '' && Number.isFinite(seconds)
            ? seconds * 1000 : Date.parse(value) - now();
          // A one-second quota response must not start another realtime storm.
          until = Math.max(until, now() + Math.max(15000, Number.isFinite(wait) ? wait : 60000));
          lastError = error;
        }
        throw error;
      }
    },
  };
}

export function acquireFeedReadBudget(owner, scope) {
  let scopes = budgets.get(owner);
  if (!scopes) { scopes = new Map(); budgets.set(owner, scopes); }
  if (!scopes.has(scope)) scopes.set(scope, createFeedReadBudget());
  return scopes.get(scope);
}

export function retryFeedRead(failureCount, error) {
  return !isRateLimited(error) && failureCount < 1;
}
