import type {
  CacheLike,
  CacheStorageLike,
  ClientsLike,
  FetchEventLike,
  MessageEventLike,
  RequestLike,
  ResponseInitLike,
  ResponseLike,
  ServiceWorkerScope,
  WindowClientLike,
} from '../../src/pwa/sw-runtime.js'

/**
 * Test doubles for the six browser APIs `ServiceWorkerScope` declares.
 *
 * These are not a browser simulation. `serviceWorkerMain` takes its scope as an
 * argument precisely so that its own logic — which cache it opens, what it
 * purges, what it falls back to — can be driven from Node against explicit
 * doubles. What the doubles do *not* model is browser behaviour: worker
 * lifecycle, the waiting state, `Vary` matching, opaque responses, quota. Those
 * need a real browser, and the list of what they cover is stated at the top of
 * `service-worker.test.ts`.
 */

export const ORIGIN = 'https://example.test'

export function fakeRequest(url: string, overrides: Partial<RequestLike> = {}): RequestLike {
  return {
    method: 'GET',
    url: url.startsWith('http') ? url : `${ORIGIN}${url}`,
    destination: '',
    mode: 'no-cors',
    cache: 'default',
    headers: { has: () => false },
    ...overrides,
  }
}

export class FakeResponse implements ResponseLike {
  readonly ok: boolean
  readonly status: number
  readonly body: string

  constructor(body: string | null, init: ResponseInitLike = {}) {
    this.status = init.status ?? 200
    this.ok = this.status >= 200 && this.status < 300
    this.body = body ?? ''
  }

  clone(): ResponseLike {
    return new FakeResponse(this.body, { status: this.status })
  }
}

function keyOf(request: RequestLike | string): string {
  return typeof request === 'string' ? request : request.url
}

type Fetcher = (request: RequestLike) => Promise<ResponseLike>

export class FakeCache implements CacheLike {
  readonly entries = new Map<string, ResponseLike>()
  // Written as a field rather than a constructor parameter property: the
  // workspace compiles with `erasableSyntaxOnly`.
  readonly fetcher: Fetcher

  constructor(fetcher: Fetcher) {
    this.fetcher = fetcher
  }

  async match(request: RequestLike | string): Promise<ResponseLike | undefined> {
    return this.entries.get(keyOf(request))
  }

  async put(request: RequestLike | string, response: ResponseLike): Promise<void> {
    this.entries.set(keyOf(request), response)
  }

  async addAll(urls: readonly string[]): Promise<void> {
    for (const url of urls) {
      const response = await this.fetcher(fakeRequest(url))
      if (!response.ok) throw new Error(`precache failed for ${url}`)
      this.entries.set(url, response)
    }
  }

  async keys(): Promise<readonly RequestLike[]> {
    return [...this.entries.keys()].map((url) => fakeRequest(url))
  }

  async delete(request: RequestLike | string): Promise<boolean> {
    return this.entries.delete(keyOf(request))
  }
}

export class FakeCacheStorage implements CacheStorageLike {
  readonly caches = new Map<string, FakeCache>()
  readonly fetcher: Fetcher

  constructor(fetcher: Fetcher) {
    this.fetcher = fetcher
  }

  async open(name: string): Promise<CacheLike> {
    const existing = this.caches.get(name)
    if (existing !== undefined) return existing
    const created = new FakeCache(this.fetcher)
    this.caches.set(name, created)
    return created
  }

  async keys(): Promise<string[]> {
    return [...this.caches.keys()]
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name)
  }

  /** Seeds a cache directly, standing in for "a previous deploy filled this". */
  seed(name: string, url: string, response: ResponseLike): void {
    const cache = new FakeCache(this.fetcher)
    cache.entries.set(url, response)
    this.caches.set(name, cache)
  }
}

/**
 * One event shape covering both the fetch and message events, so the scope can
 * store its listeners in a single typed list without a cast. Fields that do not
 * apply to a given event are simply unread by the handler under test.
 */
export class FakeEvent implements FetchEventLike, MessageEventLike {
  readonly waited: Promise<unknown>[] = []
  response: Promise<ResponseLike> | null = null

  // Declared and assigned rather than written as constructor parameter
  // properties: `erasableSyntaxOnly` forbids the shorthand, because it is
  // TypeScript that emits runtime code rather than types Node can strip.
  readonly request: RequestLike
  readonly data: unknown

  constructor(request: RequestLike = fakeRequest('/'), data: unknown = null) {
    this.request = request
    this.data = data
  }

  waitUntil(promise: Promise<unknown>): void {
    this.waited.push(promise)
  }

  respondWith(response: Promise<ResponseLike>): void {
    this.response = response
  }

  /** Awaits everything the handler asked to keep the worker alive for. */
  async settle(): Promise<void> {
    await Promise.all(this.waited)
  }
}

type AnyHandler = (event: FetchEventLike & MessageEventLike) => void

export class FakeScope implements ServiceWorkerScope {
  readonly caches: FakeCacheStorage
  readonly posted: unknown[] = []
  readonly fetched: string[] = []
  skipWaitingCalled = false
  claimed = false
  unregistered = false
  /** Set by a test to decide what the network does for a given URL. */
  responder: (request: RequestLike) => Promise<ResponseLike> = async () => new FakeResponse('ok')

  private readonly handlers = new Map<string, AnyHandler[]>()

  constructor() {
    this.caches = new FakeCacheStorage((request) => this.fetch(request))
  }

  readonly location = { origin: ORIGIN }

  readonly registration = {
    unregister: async (): Promise<boolean> => {
      this.unregistered = true
      return true
    },
  }

  readonly clients: ClientsLike = {
    claim: async (): Promise<void> => {
      this.claimed = true
    },
    matchAll: async (): Promise<readonly WindowClientLike[]> => [
      { postMessage: (message: unknown) => this.posted.push(message) },
    ],
  }

  readonly Response = FakeResponse

  addEventListener(type: string, handler: AnyHandler): void {
    const existing = this.handlers.get(type)
    if (existing === undefined) this.handlers.set(type, [handler])
    else existing.push(handler)
  }

  async fetch(request: RequestLike): Promise<ResponseLike> {
    this.fetched.push(request.url)
    return this.responder(request)
  }

  async skipWaiting(): Promise<void> {
    this.skipWaitingCalled = true
  }

  setTimeout(handler: () => void, ms: number): unknown {
    const timer = setTimeout(handler, ms)
    // Nothing in the worker should hold the Node process open after a test.
    timer.unref()
    return timer
  }

  /** Dispatches an event to every listener registered for `type`. */
  async dispatch(type: string, event: FakeEvent): Promise<FakeEvent> {
    for (const handler of this.handlers.get(type) ?? []) handler(event)
    await event.settle()
    return event
  }
}
