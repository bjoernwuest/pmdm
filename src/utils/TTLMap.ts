/**
 * Generic Time-to-Live Map with sliding-window TTL behavior.
 * - Keys and values are generic: TTLMap<K, V>
 * - Constructor: new TTLMap(ttlSeconds?: number, entries?: Iterable<[K, V]>)
 *   - ttlSeconds: time-to-live for each entry in seconds. If <= 0 entries do not expire.
 *   - entries: optional initial entries to populate the map.
 * - Accessing an entry via get(...) or has(...) renews (slides) the TTL for that entry.
 * - The map automatically purges expired entries on a periodic interval.
 *
 * Methods implemented:
 * - get(key): V | undefined
 * - get(key, defaultValue): V | D
 * - put(key, value): previousValue | undefined
 * - has(key): boolean
 * - delete(key): previousValue | undefined
 * - expire(key): previousValue | undefined
 * - expire(): number  // purge all expired entries, returns number removed
 * - entries(): IterableIterator<[K, V]>
 * - keys(): IterableIterator<K>
 * - values(): IterableIterator<V>
 *
 * Notes:
 * - When ttlSeconds <= 0 the map is effectively a normal Map with no expiry.
 * - The internal periodic purger runs only when TTL > 0.
 */

export class TTLMap<K, V> {
    // TTL in milliseconds. If 0 means no expiry.
    private readonly ttlMs: number;
    private readonly map = new Map<K, { value: V; expiresAt: number }>();
    private purgeTimerId: NodeJS.Timeout | undefined;

    constructor(ttlSeconds = 60, entries?: Iterable<[K, V]>) {
        this.ttlMs = ttlSeconds > 0 ? Math.floor(ttlSeconds * 1000) : 0;
        if (entries) {
            const now = Date.now();
            for (const [k, v] of entries) {
                const expiresAt = this.ttlMs > 0 ? now + this.ttlMs : Infinity;
                this.map.set(k, { value: v, expiresAt });
            }
        }

        // Start a periodic purge only if TTL > 0
        if (this.ttlMs > 0) {
            // Purge at least once per second, but typically one tenth the TTL (to be responsive).
            const interval = Math.max(1000, Math.min(this.ttlMs / 10, 60_000));
            this.purgeTimerId = globalThis.setInterval(() => this.expire(), Math.floor(interval));
        }
    }

    // -----------------
    // Core operations
    // -----------------

    /**
     * Get a value or undefined. If defaultValue is provided and the key is missing/expired,
     * return defaultValue. Access renews the TTL (sliding window) when TTL is enabled.
     */
    get(key: K): V | undefined;
    get<D extends V>(key: K, defaultValue: D): V | D;
    get<D extends V>(key: K, defaultValue?: D): V | D | undefined {
        const entry = this.map.get(key);
        if (!entry) return defaultValue;
        if (this.isExpiredEntry(entry)) {
            this.map.delete(key);
            return defaultValue;
        }
        // Renew TTL on access
        if (this.ttlMs > 0) {
            entry.expiresAt = Date.now() + this.ttlMs;
        }
        return entry.value;
    }

    /** Put a value, return the previous value if present (and not expired). */
    put(key: K, value: V): V | undefined {
        const now = Date.now();
        const prev = this.map.get(key);
        let prevValue: V | undefined = undefined;
        if (prev) {
            if (!this.isExpiredEntry(prev)) prevValue = prev.value;
        }
        const expiresAt = this.ttlMs > 0 ? now + this.ttlMs : Infinity;
        this.map.set(key, { value, expiresAt });
        return prevValue;
    }

    /** Returns true if an unexpired mapping exists. Access renews TTL. */
    has(key: K): boolean {
        const entry = this.map.get(key);
        if (!entry) return false;
        if (this.isExpiredEntry(entry)) {
            this.map.delete(key);
            return false;
        }
        if (this.ttlMs > 0) entry.expiresAt = Date.now() + this.ttlMs;
        return true;
    }

    /** Delete mapping and return previous value if present and not expired. */
    delete(key: K): V | undefined {
        const entry = this.map.get(key);
        if (!entry) return undefined;
        if (this.isExpiredEntry(entry)) {
            this.map.delete(key);
            return undefined;
        }
        this.map.delete(key);
        return entry.value;
    }

    /**
     * Expire a single key (remove it) and return its previous value if present.
     * If called without arguments it purges all expired entries and returns the number removed.
     */
    expire(key: K): V | undefined;
    expire(): number;
    expire(key?: K): V | undefined | number {
        if (typeof key !== "undefined") {
            // expire single key
            const entry = this.map.get(key as K);
            if (!entry) return undefined;
            this.map.delete(key as K);
            return entry.value;
        }
        // expire all expired entries
        let removed = 0;
        const now = Date.now();
        for (const [k, entry] of this.map) {
            if (entry.expiresAt <= now) {
                this.map.delete(k);
                removed++;
            }
        }
        return removed;
    }

    // -----------------
    // Iteration helpers
    // -----------------

    *entries(): IterableIterator<[K, V]> {
        const now = Date.now();
        for (const [k, entry] of this.map) {
            if (entry.expiresAt <= now) {
                // remove expired entries while iterating
                this.map.delete(k);
                continue;
            }
            yield [k, entry.value];
        }
    }

    *keys(): IterableIterator<K> {
        for (const [k] of this.entries()) yield k;
    }

    *values(): IterableIterator<V> {
        for (const [, v] of this.entries()) yield v;
    }

    // -----------------
    // Utilities
    // -----------------

    private isExpiredEntry(entry: { value: V; expiresAt: number }): boolean {
        if (this.ttlMs === 0) return false;
        return entry.expiresAt <= Date.now();
    }

    /**
     * Stop internal timer and clear data.
     * Not requested but useful for cleanup in long running processes/tests.
     */
    destroy(): void {
        if (typeof this.purgeTimerId !== "undefined") {
            clearInterval(this.purgeTimerId);
            this.purgeTimerId = undefined;
        }
        this.map.clear();
    }

    /** Number of currently stored (non-expired) entries. */
    get size(): number {
        // purge expired entries first (cheap)
        if (this.ttlMs > 0) {
            this.expire();
        }
        return this.map.size;
    }
}
