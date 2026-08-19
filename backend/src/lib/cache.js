// Tiny in-memory TTL cache. Keys must fully encode the caller's identity
// (e.g. subuser code) — never share a cache entry across different callers.
class TTLCache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.store = new Map();
    const sweeper = setInterval(() => this._sweep(), Math.max(ttlMs, 1000));
    sweeper.unref();
  }

  _sweep() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
  }

  async getOrSet(key, fn) {
    const now = Date.now();
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > now) return hit.value;

    const value = await fn();
    this.store.set(key, { value, expiresAt: now + this.ttlMs });
    return value;
  }
}

module.exports = { TTLCache };
