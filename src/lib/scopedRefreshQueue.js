// Collapse overlapping dashboard reads while retaining one refresh after the
// active read. A changed identity never waits for or accepts the old response.
export function createScopedRefreshQueue() {
  let current = null;
  return {
    setScope(scope) {
      if (current?.scope !== scope) current = { scope, pending: null, flight: null };
    },
    cancelScope(scope) {
      if (current?.scope === scope) current = null;
    },
    run(scope, task) {
      const bucket = current;
      if (!bucket || bucket.scope !== scope) return Promise.resolve();
      bucket.pending = task;
      if (!bucket.flight) {
        bucket.flight = (async () => {
          await Promise.resolve();
          try {
            let result;
            while (current === bucket && bucket.pending) {
              const next = bucket.pending;
              bucket.pending = null;
              result = await next(() => current === bucket);
            }
            return result;
          } finally {
            bucket.flight = null;
            bucket.pending = null;
          }
        })();
      }
      return bucket.flight;
    },
  };
}
