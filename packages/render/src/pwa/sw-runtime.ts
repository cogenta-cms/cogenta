import { chooseStrategy } from './strategy.js'
import type { PwaConfig, RequestDescriptor, StrategyDecision } from './types.js'
import { cacheNameFor, cachesToPurge } from './version.js'

/**
 * The service worker runtime, written as ordinary TypeScript.
 *
 * It is never *imported* by a browser: `renderServiceWorker` inlines the source
 * text of these functions into the script it generates. That indirection buys
 * three things a hand-written string template cannot. The runtime is
 * type-checked and linted like the rest of the package. The routing decision
 * shipped to browsers is character-for-character the function the unit tests
 * exercise, so the two cannot drift. And there is no bundler in the loop, which
 * matters because a service worker must be one self-contained file served from
 * the site root.
 *
 * The constraint that comes with it: **nothing in this file may reference
 * module scope.** Only the parameters, and the three helpers that are inlined
 * alongside (`chooseStrategy`, `cacheNameFor`, `cachesToPurge`). A test asserts
 * that the generated script defines each of them.
 *
 * The scope is typed against the minimal interfaces below rather than
 * `lib.webworker`: the package compiles with `lib: ES2023`, and a narrow
 * hand-written surface documents exactly which browser APIs the worker is
 * allowed to touch.
 */

export interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void
}

export interface HeadersLike {
  has(name: string): boolean
}

export interface RequestLike {
  readonly method: string
  readonly url: string
  readonly destination: string
  readonly mode: string
  readonly cache: string
  readonly headers: HeadersLike
}

export interface ResponseLike {
  readonly ok: boolean
  readonly status: number
  clone(): ResponseLike
}

export interface FetchEventLike extends ExtendableEventLike {
  readonly request: RequestLike
  respondWith(response: Promise<ResponseLike>): void
}

export interface MessageEventLike extends ExtendableEventLike {
  readonly data: unknown
}

export interface CacheLike {
  match(request: RequestLike | string): Promise<ResponseLike | undefined>
  put(request: RequestLike | string, response: ResponseLike): Promise<void>
  addAll(urls: readonly string[]): Promise<void>
  keys(): Promise<readonly RequestLike[]>
  delete(request: RequestLike | string): Promise<boolean>
}

export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>
  keys(): Promise<string[]>
  delete(name: string): Promise<boolean>
}

export interface WindowClientLike {
  postMessage(message: unknown): void
}

export interface ClientsLike {
  claim(): Promise<void>
  matchAll(options: { type: 'window' }): Promise<readonly WindowClientLike[]>
}

export interface ResponseInitLike {
  readonly status?: number
  readonly headers?: Record<string, string>
}

export interface ServiceWorkerScope {
  addEventListener(
    type: 'install' | 'activate',
    handler: (event: ExtendableEventLike) => void,
  ): void
  addEventListener(type: 'fetch', handler: (event: FetchEventLike) => void): void
  addEventListener(type: 'message', handler: (event: MessageEventLike) => void): void
  readonly caches: CacheStorageLike
  readonly clients: ClientsLike
  readonly registration: { unregister(): Promise<boolean> }
  readonly location: { readonly origin: string }
  readonly Response: new (body: string | null, init?: ResponseInitLike) => ResponseLike
  fetch(request: RequestLike): Promise<ResponseLike>
  skipWaiting(): Promise<void>
  setTimeout(handler: () => void, ms: number): unknown
}

/** Messages the page may send the worker. Part of the public PWA contract. */
export const SW_MESSAGE_PURGE = 'cogenta:purge'
export const SW_MESSAGE_UNREGISTER = 'cogenta:unregister'
export const SW_MESSAGE_ACTIVATED = 'cogenta:activated'
export const SW_MESSAGE_UNREGISTERED = 'cogenta:unregistered'

export function serviceWorkerMain(scope: ServiceWorkerScope, config: PwaConfig): void {
  const shellCacheName = cacheNameFor(config.cachePrefix, config.version, 'shell')

  // Declared inside the function, like everything else here, because the
  // function body is inlined into the generated script and module-scope
  // constants would not travel with it. Used only when the network is down
  // *and* the precached offline page is missing: it says what happened instead
  // of rendering nothing, since a blank tab reads as "this site is broken",
  // which is a different and unactionable claim from "you are offline".
  const lastResortOfflineHtml =
    '<!doctype html><html lang="en"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Offline</title><body style="font:1rem/1.5 system-ui;margin:2rem">' +
    '<h1>You are offline</h1><p>This page is not available without a network ' +
    'connection. It will load again once you are back online.</p>'

  const tellClients = async (message: unknown): Promise<void> => {
    const windows = await scope.clients.matchAll({ type: 'window' })
    for (const client of windows) client.postMessage(message)
  }

  const purge = async (everything: boolean): Promise<string[]> => {
    const names = await scope.caches.keys()
    const doomed = everything
      ? names.filter((name) => name.startsWith(`${config.cachePrefix}:`))
      : cachesToPurge(names, config.cachePrefix, config.version)
    await Promise.all(doomed.map((name) => scope.caches.delete(name)))
    return doomed
  }

  const describe = (request: RequestLike): RequestDescriptor => ({
    method: request.method,
    url: request.url,
    origin: scope.location.origin,
    destination: request.destination,
    mode: request.mode,
    cacheMode: request.cache,
    hasRange: request.headers.has('range'),
  })

  const store = async (
    cache: CacheLike,
    request: RequestLike,
    response: ResponseLike,
    maxEntries: number | null,
  ): Promise<void> => {
    // `ok` is false for opaque cross-origin responses (status 0) and for every
    // error status, so neither can be stored. Caching a 404 is how a site keeps
    // showing "not found" long after the page came back.
    if (!response.ok) return
    await cache.put(request, response.clone())
    if (maxEntries === null) return
    // `keys()` is in insertion order, so the head of the list is the least
    // recently *added*. A true LRU would need a side index in IndexedDB; the
    // cap exists to bound disk use, not to be optimal.
    const keys = await cache.keys()
    const excess = keys.length - maxEntries
    for (let i = 0; i < excess; i++) {
      const key = keys[i]
      if (key !== undefined) await cache.delete(key)
    }
  }

  const offlineFallback = async (): Promise<ResponseLike> => {
    const shell = await scope.caches.open(shellCacheName)
    const page = await shell.match(config.offlineUrl)
    if (page !== undefined) return page
    return new scope.Response(lastResortOfflineHtml, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  /**
   * Races the network against a timer rather than aborting it. The losing
   * request is deliberately left running: it still fills the cache, so the
   * *next* view gets fresh content even though this one was served stale.
   */
  const withTimeout = async (
    network: Promise<ResponseLike>,
    ms: number | null,
  ): Promise<ResponseLike> => {
    if (ms === null) return network
    return Promise.race([
      network,
      new Promise<ResponseLike>((_resolve, reject) => {
        scope.setTimeout(() => reject(new Error('network timeout')), ms)
      }),
    ])
  }

  const handle = async (
    event: FetchEventLike,
    request: RequestLike,
    decision: StrategyDecision,
  ): Promise<ResponseLike> => {
    const cache = await scope.caches.open(
      cacheNameFor(config.cachePrefix, config.version, decision.bucket),
    )

    if (decision.strategy === 'cache-first') {
      const hit = await cache.match(request)
      if (hit !== undefined) return hit
      const response = await scope.fetch(request)
      await store(cache, request, response, decision.maxEntries)
      return response
    }

    if (decision.strategy === 'stale-while-revalidate') {
      const hit = await cache.match(request)
      const refresh = scope
        .fetch(request)
        .then(async (response) => {
          await store(cache, request, response, decision.maxEntries)
          return response
        })
        .catch(() => undefined)
      if (hit !== undefined) {
        // The page is already answered; keep the worker alive until the
        // background refresh lands, or the next view is stale again.
        event.waitUntil(refresh)
        return hit
      }
      const fresh = await refresh
      if (fresh !== undefined) return fresh
      return offlineFallback()
    }

    // network-first
    try {
      const response = await withTimeout(
        scope.fetch(request).then(async (fetched) => {
          await store(cache, request, fetched, decision.maxEntries)
          return fetched
        }),
        decision.networkTimeoutMs,
      )
      return response
    } catch {
      const hit = await cache.match(request)
      if (hit !== undefined) return hit
      return offlineFallback()
    }
  }

  scope.addEventListener('install', (event) => {
    event.waitUntil(
      (async () => {
        // Precache into this generation's own cache. A half-written precache
        // therefore never mixes with the previous generation's entries.
        const cache = await scope.caches.open(shellCacheName)
        await cache.addAll(config.precache)
        // Activate as soon as the new generation is complete. See the update
        // strategy documented in `renderServiceWorker`.
        await scope.skipWaiting()
      })(),
    )
  })

  scope.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        await purge(false)
        await scope.clients.claim()
        // Tell the pages, do not reload them. A forced reload loses scroll
        // position, form input and video playback; the page decides what to do
        // with the news.
        await tellClients({ type: 'cogenta:activated', version: config.version })
      })(),
    )
  })

  scope.addEventListener('fetch', (event) => {
    const decision = chooseStrategy(describe(event.request), config.routes)
    // Not calling respondWith at all is not the same as fetching and returning:
    // it hands the request back to the browser untouched, with its own HTTP
    // cache, its own range handling and no worker in the path.
    if (decision.strategy === 'network-only') return
    event.respondWith(handle(event, event.request, decision))
  })

  scope.addEventListener('message', (event) => {
    const data = event.data
    if (typeof data !== 'object' || data === null) return
    const type = (data as { type?: unknown }).type

    // The exit path, callable from the admin. It must live in the worker
    // itself: once a worker controls a page, only the worker can empty the
    // caches it owns without a full "clear site data".
    if (type === 'cogenta:unregister') {
      event.waitUntil(
        (async () => {
          await purge(true)
          await scope.registration.unregister()
          await tellClients({ type: 'cogenta:unregistered' })
        })(),
      )
      return
    }

    if (type === 'cogenta:purge') {
      event.waitUntil(
        (async () => {
          const deleted = await purge(true)
          await tellClients({ type: 'cogenta:purged', caches: deleted })
        })(),
      )
    }
  })
}

/**
 * The tombstone worker.
 *
 * Deployed at the *same URL* as the real worker when the PWA has to be turned
 * off. It registers no fetch handler, empties every cache the site owns and
 * unregisters itself. Browsers re-fetch a service worker script at least every
 * 24 hours, so shipping this file is the only mechanism that reaches clients we
 * can no longer run code on — which is precisely the situation the "zombie
 * worker" incident describes.
 */
export function tombstoneMain(scope: ServiceWorkerScope, cachePrefix: string): void {
  scope.addEventListener('install', (event) => {
    event.waitUntil(scope.skipWaiting())
  })

  scope.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        const names = await scope.caches.keys()
        await Promise.all(
          names
            .filter((name) => name.startsWith(`${cachePrefix}:`))
            .map((name) => scope.caches.delete(name)),
        )
        await scope.registration.unregister()
        const windows = await scope.clients.matchAll({ type: 'window' })
        for (const client of windows) client.postMessage({ type: 'cogenta:unregistered' })
      })(),
    )
  })
}
