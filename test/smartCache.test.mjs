// Offline tests for the Smart Data Persistence cache service (smartCache.js).
// No network, no server, no real browser: a minimal localStorage mock is installed
// on globalThis BEFORE the ES module is imported (smartCache probes storage at load
// time). Every test resets storage so cases are independent.
//
// The 8 required scenarios are mapped to cache-service behaviour below, plus the
// cross-cutting guarantees: request dedupe and never-older-over-newer.

import test from 'node:test';
import assert from 'node:assert/strict';

// ---- localStorage mock -------------------------------------------------------
// A single instance is installed once and cleared between tests. smartCache reads
// the bare `localStorage` global at call time, and its load-time probe captures
// HAS_STORAGE=true, so reusing one store keeps behaviour identical to a browser.
const mockStorage = (() => {
  const store = new Map();
  return {
    _store: store,
    _failWrites: false,
    getItem(k) { return store.has(String(k)) ? store.get(String(k)) : null; },
    setItem(k, v) {
      if (this._failWrites) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      store.set(String(k), String(v));
    },
    removeItem(k) { store.delete(String(k)); },
    clear() { store.clear(); },
    key(i) { return Array.from(store.keys())[i] ?? null; },
    get length() { return store.size; },
  };
})();

globalThis.localStorage = mockStorage;

// Import AFTER the mock exists so smartCache's load-time storage probe succeeds.
const {
  readCache,
  readCacheEntry,
  writeCache,
  invalidate,
  clearPrivateCache,
  cachedFetch,
  getCacheIdentity,
} = await import('../frontend/client-app/src/services/smartCache.js');

// ---- helpers -----------------------------------------------------------------
function resetStorage() {
  mockStorage.clear();
  mockStorage._failWrites = false;
}
function loginAs(id) {
  mockStorage.setItem('user', JSON.stringify({ id }));
}
function logout() {
  mockStorage.removeItem('user');
}
const flush = () => new Promise((r) => setImmediate(r));

// A fetcher we can count and control.
function controlledFetchers() {
  const state = { calls: 0, payload: null, shouldFail: false, gate: null };
  const fetcher = async () => {
    state.calls += 1;
    if (state.gate) await state.gate;
    if (state.shouldFail) throw new Error('network down');
    return state.payload;
  };
  return { state, fetcher };
}

// ---- Scenario 1: first visit with an empty cache ----------------------------
test('Scenario 1 — first visit: empty cache reads null, fetch populates it', async () => {
  resetStorage();
  loginAs('client-1');
  const key = 'client::wallet::v1';
  assert.equal(readCache(key), null, 'no cache on the very first visit');

  const { state, fetcher } = controlledFetchers();
  state.payload = { walletData: { balance: 100 } };
  const result = await cachedFetch(key, fetcher);

  assert.deepEqual(result, { walletData: { balance: 100 } });
  assert.equal(state.calls, 1, 'server was fetched exactly once');
  assert.deepEqual(readCache(key), { walletData: { balance: 100 } }, 'successful data was saved');
});

// ---- Scenario 2: reopening Wallet / Tasks / Plans ---------------------------
test('Scenario 2 — reopen: saved payload is available immediately for instant paint', async () => {
  resetStorage();
  loginAs('client-1');
  const key = 'client::tasks::v1';
  writeCache(key, { tasks: [{ id: 't1' }] });

  // Reopening reads the saved list synchronously (no await, no skeleton).
  const instant = readCache(key);
  assert.deepEqual(instant, { tasks: [{ id: 't1' }] });

  // Background revalidation still runs and refreshes the entry.
  const { state, fetcher } = controlledFetchers();
  state.payload = { tasks: [{ id: 't1' }, { id: 't2' }] };
  const fresh = await cachedFetch(key, fetcher);
  assert.equal(fresh.tasks.length, 2, 'fresh server data applied on reopen');
  assert.equal(readCache(key).tasks.length, 2);
});

// ---- Scenario 3: reopening after several hours ------------------------------
test('Scenario 3 — reopen after hours: cache persists (stale-while-revalidate)', async () => {
  resetStorage();
  loginAs('client-1');
  const key = 'client::plans::v1';
  // Simulate an entry saved "hours ago" with an old timestamp.
  const oldTs = Date.now() - 6 * 60 * 60 * 1000;
  writeCache(key, { plans: [{ id: 'p1' }] }, oldTs);

  const entry = readCacheEntry(key);
  assert.equal(entry.ts, oldTs, 'old entry survives across time (no TTL eviction)');
  assert.deepEqual(readCache(key), { plans: [{ id: 'p1' }] }, 'stale data shown immediately');

  // A newer background refresh replaces it.
  const { state, fetcher } = controlledFetchers();
  state.payload = { plans: [{ id: 'p1' }, { id: 'p2' }] };
  await cachedFetch(key, fetcher);
  assert.equal(readCache(key).plans.length, 2);
  assert.ok(readCacheEntry(key).ts > oldTs, 'timestamp advanced after revalidation');
});

// ---- Scenario 4: background refresh success AND failure --------------------
test('Scenario 4a — background refresh success updates the screen and cache', async () => {
  resetStorage();
  loginAs('client-1');
  const key = 'client::dashboard::v1';
  writeCache(key, { config: { name: 'old' } });
  const { state, fetcher } = controlledFetchers();
  state.payload = { config: { name: 'new' } };
  await cachedFetch(key, fetcher);
  assert.deepEqual(readCache(key), { config: { name: 'new' } });
});

test('Scenario 4b — background refresh failure retains previous data', async () => {
  resetStorage();
  loginAs('client-1');
  const key = 'client::dashboard::v1';
  writeCache(key, { config: { name: 'saved' } });
  const { state, fetcher } = controlledFetchers();
  state.shouldFail = true;

  await assert.rejects(() => cachedFetch(key, fetcher), /network down/);
  // The failed refresh must NOT wipe or overwrite the retained data.
  assert.deepEqual(readCache(key), { config: { name: 'saved' } });
});

// ---- Scenario 5: new task / recharge / message submission ------------------
test('Scenario 5 — mutation invalidation drops stale cache so new records show', async () => {
  resetStorage();
  loginAs('client-1');
  const key = 'client::wallet::v1';
  writeCache(key, { walletData: { balance: 100 }, rechargeRequests: [] });

  // A recharge submit invalidates the cached wallet (mirrors Wallet.jsx behaviour).
  invalidate(key);
  assert.equal(readCache(key), null, 'stale balance can never be shown after a recharge');

  // Next visit refetches the authoritative, updated balance.
  const { state, fetcher } = controlledFetchers();
  state.payload = { walletData: { balance: 500 }, rechargeRequests: [{ id: 'r1' }] };
  const fresh = await cachedFetch(key, fetcher);
  assert.equal(fresh.walletData.balance, 500);
  assert.equal(readCache(key).rechargeRequests.length, 1, 'new recharge request appears');
});

// ---- Scenario 6: admin-side updates and deletions --------------------------
test('Scenario 6 — admin deletion: synced server payload removes the record', async () => {
  resetStorage();
  loginAs('client-1');
  const key = 'client::tasks::v1';
  writeCache(key, { tasks: [{ id: 't1' }, { id: 't2' }] });

  // Admin deletes t1; the revalidated server payload no longer contains it.
  const { state, fetcher } = controlledFetchers();
  state.payload = { tasks: [{ id: 't2' }] };
  await cachedFetch(key, fetcher);

  const cached = readCache(key);
  assert.equal(cached.tasks.length, 1);
  assert.equal(cached.tasks.some((t) => t.id === 't1'), false, 'deleted record not retained');
});

test('Scenario 6b — admin update: synced server payload replaces stale fields', async () => {
  resetStorage();
  loginAs('client-1');
  const key = 'client::plandetail::v1::p1';
  writeCache(key, { plan: { id: 'p1', status: 'ACTIVE', price: 100 } });
  const { state, fetcher } = controlledFetchers();
  state.payload = { plan: { id: 'p1', status: 'PAUSED', price: 80 } };
  await cachedFetch(key, fetcher);
  assert.equal(readCache(key).plan.status, 'PAUSED');
  assert.equal(readCache(key).plan.price, 80);
});

// ---- Scenario 7: logout and switching between two clients ------------------
test('Scenario 7a — identity isolation: one client never reads another cache', async () => {
  resetStorage();
  loginAs('client-A');
  writeCache('client::wallet::v1', { walletData: { balance: 999 } });

  // Switch to a different authenticated client.
  loginAs('client-B');
  assert.equal(getCacheIdentity(), 'client-B');
  assert.equal(readCache('client::wallet::v1'), null, "client B cannot see client A's data");

  // Client A's entry is still intact under its own namespace.
  loginAs('client-A');
  assert.deepEqual(readCache('client::wallet::v1'), { walletData: { balance: 999 } });
});

test('Scenario 7b — logout clears the current identity private cache only', async () => {
  resetStorage();
  loginAs('client-A');
  writeCache('client::tasks::v1', { tasks: [{ id: 'a1' }] });
  loginAs('client-B');
  writeCache('client::tasks::v1', { tasks: [{ id: 'b1' }] });

  // Logout client B: clearPrivateCache runs while B is still the identity.
  clearPrivateCache();
  logout();

  // B's private data is gone.
  loginAs('client-B');
  assert.equal(readCache('client::tasks::v1'), null, 'client B private cache cleared on logout');

  // A's data was untouched by B's logout.
  loginAs('client-A');
  assert.deepEqual(readCache('client::tasks::v1'), { tasks: [{ id: 'a1' }] }, 'other identity preserved');
});

test('Scenario 7c — account switch on login clears the previous session cache', async () => {
  resetStorage();
  loginAs('client-A');
  writeCache('client::support::v1', { tasks: [{ id: 'conv-A' }] });

  // Simulate login() as client B: the previous identity (A) is cleared first,
  // while A is still the stored identity, then B is stored.
  clearPrivateCache(); // clears A's namespace (previous session)
  loginAs('client-B');

  assert.equal(readCache('client::support::v1'), null, 'B starts with a clean slate');
});

// ---- Scenario 8: network interruption and recovery ------------------------
test('Scenario 8 — interruption retains cache, recovery refreshes it', async () => {
  resetStorage();
  loginAs('client-1');
  const key = 'client::tasks::v1';
  writeCache(key, { tasks: [{ id: 't1' }] });

  const { state, fetcher } = controlledFetchers();
  state.shouldFail = true; // network interruption
  await assert.rejects(() => cachedFetch(key, fetcher));
  assert.deepEqual(readCache(key), { tasks: [{ id: 't1' }] }, 'data retained during outage');

  state.shouldFail = false; // recovery
  state.payload = { tasks: [{ id: 't1' }, { id: 't2' }] };
  await cachedFetch(key, fetcher);
  assert.equal(readCache(key).tasks.length, 2, 'recovered refresh applied');
});

// ---- Cross-cutting: request dedupe ----------------------------------------
test('Dedupe — simultaneous identical requests share one fetch', async () => {
  resetStorage();
  loginAs('client-1');
  const key = 'client::plans::v1';
  let gateResolve;
  const { state, fetcher } = controlledFetchers();
  state.payload = { plans: [{ id: 'p1' }] };
  state.gate = new Promise((r) => { gateResolve = r; });

  // Fire three concurrent fetches for the same key before any resolves.
  const p1 = cachedFetch(key, fetcher);
  const p2 = cachedFetch(key, fetcher);
  const p3 = cachedFetch(key, fetcher);
  assert.equal(state.calls, 1, 'only one in-flight request was issued');

  gateResolve();
  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  assert.deepEqual(r1, r2);
  assert.deepEqual(r2, r3);
  assert.equal(state.calls, 1, 'still a single fetch after all resolved');

  // After completion a new call is allowed to revalidate again.
  state.gate = null;
  await cachedFetch(key, fetcher);
  assert.equal(state.calls, 2);
});

// ---- Cross-cutting: never overwrite newer data with an older response ------
test('Never-older-over-newer — a late old response cannot clobber newer data', async () => {
  resetStorage();
  loginAs('client-1');
  const key = 'client::dashboard::v1';

  const newerTs = Date.now();
  writeCache(key, { config: { name: 'newer' } }, newerTs);

  // An older in-flight response (timestamp before the newer write) resolves late.
  const olderTs = newerTs - 5000;
  const wrote = writeCache(key, { config: { name: 'older' } }, olderTs);

  assert.equal(wrote, false, 'older write was rejected');
  assert.deepEqual(readCache(key), { config: { name: 'newer' } }, 'newer data preserved');
});

test('Never-older-over-newer — a slow stale fetch cannot overwrite a fresh write', async () => {
  resetStorage();
  loginAs('client-1');
  const key = 'client::tasks::v1';

  // Start a slow fetch (captured reqTs = now).
  let gateResolve;
  const slow = controlledFetchers();
  slow.state.payload = { tasks: [{ id: 'slow' }] };
  slow.state.gate = new Promise((r) => { gateResolve = r; });
  const slowPromise = cachedFetch(key, slow.fetcher);

  // While it is in flight, a newer write lands (e.g. an optimistic local update).
  await flush();
  writeCache(key, { tasks: [{ id: 'fresh' }] }, Date.now() + 1000);

  gateResolve();
  await slowPromise; // resolves and attempts to write with its older reqTs

  assert.deepEqual(readCache(key), { tasks: [{ id: 'fresh' }] }, 'the newer write survives');
});

// ---- Robustness: quota failure degrades gracefully ------------------------
test('Robustness — localStorage quota failure does not throw', () => {
  resetStorage();
  loginAs('client-1');
  mockStorage._failWrites = true;
  // writeCache must swallow the quota error (memory fallback) and not crash.
  assert.doesNotThrow(() => writeCache('client::wallet::v1', { walletData: { balance: 1 } }));
  mockStorage._failWrites = false;
});

// ---- Robustness: anonymous (public) keys are isolated from private data ----
test('Public namespace — anon keys do not leak into an authenticated identity', () => {
  resetStorage();
  // Write a public entry while logged out.
  logout();
  writeCache('public::office-config::v1', { config: { name: 'public' } });
  // Authenticate; the public key still resolves (shared, non-private) while a
  // private key for the same name does not.
  loginAs('client-1');
  assert.deepEqual(readCache('public::office-config::v1'), { config: { name: 'public' } });
  assert.equal(readCache('client::office-config::v1'), null);
});

// ---- Cold-start resilience: idempotent GET retries -------------------------
test('Retry — a transient timeout is retried and succeeds on a later attempt', async () => {
  resetStorage();
  loginAs('client-1');
  const key = 'client::plans::v1';
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    if (calls < 3) { const e = new Error('timeout of 30000ms exceeded'); e.code = 'ECONNABORTED'; throw e; }
    return { plans: [{ id: 'p1' }] };
  };
  const result = await cachedFetch(key, fetcher, { retries: 2, baseDelayMs: 1 });
  assert.equal(calls, 3, 'retried until the warm server responded');
  assert.deepEqual(result, { plans: [{ id: 'p1' }] });
  assert.deepEqual(readCache(key), { plans: [{ id: 'p1' }] }, 'successful retry was cached');
});

test('Retry — a 4xx response is never retried (auth failures fail fast)', async () => {
  resetStorage();
  loginAs('client-1');
  const key = 'client::tasks::v1';
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    const e = new Error('Request failed with status code 401');
    e.response = { status: 401 };
    throw e;
  };
  await assert.rejects(() => cachedFetch(key, fetcher, { retries: 2, baseDelayMs: 1 }), /401/);
  assert.equal(calls, 1, 'a 4xx that reached the server is not retried');
  assert.equal(readCache(key), null, 'no cache write on failure');
});
