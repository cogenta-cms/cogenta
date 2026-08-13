import process from 'node:process'

/**
 * A batching, de-duplicating loader.
 *
 * The L1 spec names "GraphQL and N+1" as a known trap and asks for a dataloader
 * **in the first implementation, not after the first slowness report**. This is
 * that dataloader, written here rather than pulled in: it is thirty lines, and
 * rule R9 prefers no dependency to a small one.
 *
 * The whole idea is one sentence: a key asked for during the current tick is
 * not fetched immediately, it is queued; when the tick ends the queue is
 * fetched once. A list of twenty articles each resolving `author` therefore
 * produces one batch of twenty keys — three of them distinct, in practice —
 * instead of twenty round trips.
 */

/** Resolves the keys it was given. A key with no value is simply absent. */
export type BatchLoadFn<TKey, TValue> = (
  keys: readonly TKey[],
) => Promise<ReadonlyMap<TKey, TValue>>

export interface Loader<TKey, TValue> {
  load(key: TKey): Promise<TValue | null>
  loadMany(keys: readonly TKey[]): Promise<readonly (TValue | null)[]>
}

interface Settler<TValue> {
  readonly resolve: (value: TValue | null) => void
  readonly reject: (error: unknown) => void
}

/**
 * Loaders are **per request**, never module-level: the cache below is a
 * consistency device for one query, not a shared cache. A process-wide one
 * would hand a reader another reader's permissions and stale content.
 */
export function createLoader<TKey, TValue>(batch: BatchLoadFn<TKey, TValue>): Loader<TKey, TValue> {
  const cache = new Map<TKey, Promise<TValue | null>>()
  const settlers = new Map<TKey, Settler<TValue>>()
  let queue: TKey[] = []
  let scheduled = false

  function flush(): void {
    const keys = queue
    queue = []
    scheduled = false
    if (keys.length === 0) return

    const pending = new Map(settlers)
    settlers.clear()

    batch(keys).then(
      (found) => {
        for (const key of keys) pending.get(key)?.resolve(found.get(key) ?? null)
      },
      (error: unknown) => {
        // Evict, so a retry within the same request is not poisoned by a
        // rejected promise that will never be retried on its own.
        for (const key of keys) {
          cache.delete(key)
          pending.get(key)?.reject(error)
        }
      },
    )
  }

  function schedule(): void {
    if (scheduled) return
    scheduled = true
    // Drain the microtask queue first, then flush on the next tick. A bare
    // `queueMicrotask` would fire between two `await`s of the same resolver
    // pass and split one batch into several; `process.nextTick` after an
    // already-resolved promise is the point where every sibling resolver of
    // the current field set has had its turn.
    void Promise.resolve().then(() => {
      process.nextTick(flush)
    })
  }

  function load(key: TKey): Promise<TValue | null> {
    const cached = cache.get(key)
    if (cached !== undefined) return cached

    const promise = new Promise<TValue | null>((resolve, reject) => {
      settlers.set(key, { resolve, reject })
    })
    cache.set(key, promise)
    queue.push(key)
    schedule()
    return promise
  }

  return {
    load,
    loadMany: (keys) => Promise.all(keys.map(load)),
  }
}
