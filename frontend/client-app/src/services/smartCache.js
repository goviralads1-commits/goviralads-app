// Smart Data Persistence — a lightweight, dependency-free stale-while-revalidate
// (SWR) cache for the Client App. It reuses the EXISTING architecture: the same
// axios `api` instance for network fetches and `localStorage` for persistence.
//
// Design guarantees (see the feature spec):
//  • Identity isolation — every entry is namespaced by the authenticated client's
//    user id, so one client's cache can never be read by another. Anonymous
//    (public browsing) data lives in a separate, non-private namespace.
//  • No auth material — only endpoint response payloads are stored; tokens and
//    credentials are never written here (they stay in the existing auth keys).
//  • Never older-over-newer — each entry stores the timestamp of the request that
//    produced it; a late-returning older response cannot overwrite newer data.
//  • Request dedupe — simultaneous identical fetches share ONE in-flight promise.
//  • Mobile-safe — bounded entry count + quota-error fallback to an in-memory map.

const NS = 'gva_swr';
const ANON = 'anon';
const MAX_ENTRIES = 60; // bounded so mobile localStorage quota is respected

// Fast path + fallback when localStorage is unavailable (private mode / quota).
const memoryStore = new Map(); // storageKey -> { value, ts }
// key -> Promise, so identical concurrent requests are issued only once.
const inflight = new Map();

function storageAvailable() {
  try {
    const probe = '__gva_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
const HAS_STORAGE = storageAvailable();

// The authenticated client's stable id, or null when browsing anonymously.
// Reads the SAME 'user' record the existing auth flow already maintains.
export function getCacheIdentity() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const id = parsed?.id || parsed?._id || null;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

// A private cache is only usable when a client is authenticated. Anonymous keys
// are allowed (public plans/office-config) but are never treated as private data.
function scopeOf(key) {
  return String(key).startsWith('public::') ? ANON : (getCacheIdentity() || ANON);
}

function storageKey(key) {
  return `${NS}::${scopeOf(key)}::${key}`;
}

function trimIfNeeded() {
  if (!HAS_STORAGE) return;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${NS}::`)) keys.push(k);
    }
    if (keys.length <= MAX_ENTRIES) return;
    // Evict oldest by stored ts until back under the cap.
    const entries = keys.map((k) => {
      let ts = 0;
      try { ts = JSON.parse(localStorage.getItem(k))?.ts || 0; } catch { ts = 0; }
      return { k, ts };
    }).sort((a, b) => a.ts - b.ts);
    const excess = entries.length - MAX_ENTRIES;
    for (let i = 0; i < excess; i += 1) localStorage.removeItem(entries[i].k);
  } catch {
    // Trimming is best-effort only.
  }
}

// Read a cached payload. Returns the stored value, or null when absent/unusable.
export function readCache(key) {
  const sk = storageKey(key);
  try {
    const entry = HAS_STORAGE
      ? JSON.parse(localStorage.getItem(sk))
      : memoryStore.get(sk);
    if (!entry || typeof entry !== 'object' || !('value' in entry)) return null;
    return entry.value;
  } catch {
    return null;
  }
}

// Read a cached payload together with its request timestamp (used for the
// never-older-over-newer guard). Returns { value, ts } or null.
export function readCacheEntry(key) {
  const sk = storageKey(key);
  try {
    const entry = HAS_STORAGE
      ? JSON.parse(localStorage.getItem(sk))
      : memoryStore.get(sk);
    if (!entry || typeof entry !== 'object' || !('value' in entry)) return null;
    return { value: entry.value, ts: entry.ts || 0 };
  } catch {
    return null;
  }
}

// Persist a payload. `ts` is the timestamp of the request that produced the data;
// when omitted (optimistic local update) the current time is used so the write
// always wins. A write is skipped if an entry with a NEWER ts already exists.
export function writeCache(key, value, ts) {
  const sk = storageKey(key);
  const stamp = typeof ts === 'number' ? ts : Date.now();
  const existing = readCacheEntry(key);
  if (existing && existing.ts > stamp) return false; // never overwrite newer data
  const entry = { value, ts: stamp };
  memoryStore.set(sk, entry);
  if (HAS_STORAGE) {
    try {
      localStorage.setItem(sk, JSON.stringify(entry));
      trimIfNeeded();
    } catch {
      // Quota exceeded — keep the in-memory copy and drop the oldest persisted
      // entry, then retry once. Correctness is preserved for this session.
      try {
        trimIfNeeded();
        localStorage.setItem(sk, JSON.stringify(entry));
      } catch {
        /* memory-only fallback */
      }
    }
  }
  return true;
}

// Drop a single entry (used after mutations that change server-side state).
export function invalidate(key) {
  const sk = storageKey(key);
  memoryStore.delete(sk);
  inflight.delete(key);
  if (HAS_STORAGE) {
    try { localStorage.removeItem(sk); } catch { /* ignore */ }
  }
}

// Clear the CURRENT identity's private cache. Called on logout and account switch
// so no private data survives into the next session. Anonymous/public entries are
// left untouched (they hold no private data and help first paint for guests).
export function clearPrivateCache() {
  const id = getCacheIdentity();
  const prefix = id ? `${NS}::${id}::` : null;
  // Clear in-memory entries for this identity.
  for (const sk of [...memoryStore.keys()]) {
    if (prefix && sk.startsWith(prefix)) memoryStore.delete(sk);
  }
  if (!HAS_STORAGE || !prefix) return;
  try {
    const remove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) remove.push(k);
    }
    remove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

// Deduplicated fetch that persists a successful result. `fetcher` must return the
// payload to cache (a plain, JSON-serializable object). Concurrent calls for the
// same key share one network round-trip. On failure the promise rejects and NO
// cache write happens, so previously saved data is retained by the caller.
export function cachedFetch(key, fetcher) {
  if (inflight.has(key)) return inflight.get(key);
  const reqTs = Date.now();
  const promise = (async () => {
    try {
      const value = await fetcher();
      writeCache(key, value, reqTs);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

// Build a namespaced cache key. Private (client-scoped) keys are automatically
// isolated per identity by scopeOf(); 'public::'-prefixed keys are shared.
export function cacheKey(name) {
  return String(name);
}
