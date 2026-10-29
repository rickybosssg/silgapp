// Hooks observing the same query share one realtime listener. Different query
// clients and scopes remain independent; the final observer releases the listener.
const owners = new WeakMap();

// Collapse a realtime burst without cancelling a running read or losing the
// event that arrived during it. A stopped account scope never starts more reads.
export function createRealtimeRefresh(refresh, delay = 100, minInterval = 0) {
  let timer = null, running = false, pending = false, stopped = false;
  let lastStarted = -Infinity;
  const schedule = () => {
    if (stopped) return;
    pending = true;
    if (running || timer !== null) return;
    timer = setTimeout(async () => {
      timer = null;
      if (stopped) return;
      pending = false;
      running = true;
      lastStarted = Date.now();
      try { await refresh(); }
      catch { /* Query state retains the error; the polling fallback remains. */ }
      finally {
        running = false;
        if (pending && !stopped) schedule();
      }
    }, Math.max(delay, minInterval - (Date.now() - lastStarted)));
  };
  return { schedule, stop() { stopped = true; pending = false; clearTimeout(timer); timer = null; } };
}

export function acquireQuerySubscription(owner, scope, subscribe) {
  let scopes = owners.get(owner);
  if (!scopes) { scopes = new Map(); owners.set(owner, scopes); }
  let entry = scopes.get(scope);
  if (!entry) {
    entry = { references: 0, unsubscribe: subscribe() };
    scopes.set(scope, entry);
  }
  entry.references++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--entry.references === 0) {
      scopes.delete(scope);
      entry.unsubscribe?.();
    }
  };
}
