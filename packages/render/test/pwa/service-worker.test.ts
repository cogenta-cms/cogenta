import { describe, expect, it } from 'vitest'
import { DEFAULT_ROUTES } from '../../src/pwa/strategy.js'
import { serviceWorkerMain, tombstoneMain } from '../../src/pwa/sw-runtime.js'
import type { PwaConfig } from '../../src/pwa/types.js'
import { cacheNameFor } from '../../src/pwa/version.js'
import { FakeEvent, FakeResponse, FakeScope, fakeRequest } from './fakes.js'

/**
 * What these tests cover: the worker's own decisions — which cache it opens,
 * what it precaches, what it purges, what it falls back to, and what it does
 * when asked to remove itself. `serviceWorkerMain` takes its scope as an
 * argument for exactly this reason.
 *
 * What they cannot cover, and what therefore needs a real browser (Playwright,
 * alongside the e2e pass of task 16):
 *
 *   - the install → waiting → activate lifecycle itself, and that `skipWaiting`
 *     really shortens it;
 *   - that a byte-changed script is detected as a new worker, and that
 *     `updateViaCache: 'none'` stops the HTTP cache from hiding the change;
 *   - the 24-hour script refresh that makes the tombstone reach clients we can
 *     no longer run code on;
 *   - `clients.claim()` taking over pages loaded before the worker existed;
 *   - real Cache API semantics: `Vary` matching, opaque responses, quota
 *     eviction, and persistence across a browser restart;
 *   - the install prompt (`beforeinstallprompt`) and the platform's own
 *     installability verdict.
 *
 * None of that is faked here. A double that pretends to have a lifecycle would
 * pass while the real thing fails, which is worse than an admitted gap.
 */

const VERSION = 'aaaa1111'
const PREFIX = 'cogenta:pwa'

const CONFIG: PwaConfig = {
  cachePrefix: PREFIX,
  version: VERSION,
  offlineUrl: '/offline.html',
  precache: ['/offline.html'],
  routes: DEFAULT_ROUTES,
}

function boot(): FakeScope {
  const scope = new FakeScope()
  serviceWorkerMain(scope, CONFIG)
  return scope
}

async function install(scope: FakeScope): Promise<void> {
  await scope.dispatch('install', new FakeEvent())
}

async function activate(scope: FakeScope): Promise<void> {
  await scope.dispatch('activate', new FakeEvent())
}

async function get(
  scope: FakeScope,
  url: string,
  overrides: Parameters<typeof fakeRequest>[1] = {},
): Promise<FakeResponse | null> {
  const event = await scope.dispatch('fetch', new FakeEvent(fakeRequest(url, overrides)))
  if (event.response === null) return null
  const response = await event.response
  await event.settle()
  return response instanceof FakeResponse ? response : null
}

describe('installing a new generation', () => {
  it('precaches the offline page into this generation own cache', async () => {
    const scope = boot()

    await install(scope)

    const cache = scope.caches.caches.get(cacheNameFor(PREFIX, VERSION, 'shell'))
    expect(cache?.entries.has('/offline.html')).toBe(true)
  })

  it('takes over immediately instead of waiting for every tab to close', async () => {
    const scope = boot()

    await install(scope)

    expect(scope.skipWaitingCalled).toBe(true)
  })
})

describe('activating, which is where stale content dies', () => {
  it('deletes the caches of previous generations', async () => {
    const scope = boot()
    scope.caches.seed(cacheNameFor(PREFIX, 'old00000', 'documents'), '/', new FakeResponse('old'))

    await activate(scope)

    expect(await scope.caches.keys()).not.toContain('cogenta:pwa:old00000:documents')
  })

  it('leaves another application caches alone', async () => {
    const scope = boot()
    scope.caches.seed('other-app:v1:pages', '/', new FakeResponse('theirs'))

    await activate(scope)

    expect(await scope.caches.keys()).toContain('other-app:v1:pages')
  })

  it('claims open pages and tells them a new version is live, without reloading them', async () => {
    const scope = boot()

    await activate(scope)

    expect(scope.claimed).toBe(true)
    expect(scope.posted).toEqual([{ type: 'cogenta:activated', version: VERSION }])
  })
})

describe('serving a page', () => {
  it('answers a navigation from the network while the network works', async () => {
    const scope = boot()
    scope.responder = async () => new FakeResponse('fresh')

    const response = await get(scope, '/blog/hello', { mode: 'navigate', destination: 'document' })

    expect(response?.body).toBe('fresh')
  })

  it('falls back to the cached page when the network fails', async () => {
    const scope = boot()
    scope.responder = async () => new FakeResponse('fresh')
    await get(scope, '/blog/hello', { mode: 'navigate', destination: 'document' })

    scope.responder = async () => {
      throw new Error('offline')
    }
    const response = await get(scope, '/blog/hello', { mode: 'navigate', destination: 'document' })

    expect(response?.body).toBe('fresh')
  })

  it('serves the offline page, not a blank tab, when nothing is cached', async () => {
    const scope = boot()
    scope.responder = async (request) =>
      request.url.endsWith('/offline.html')
        ? new FakeResponse('<h1>You are offline</h1>')
        : new FakeResponse('page')
    await install(scope)

    scope.responder = async () => {
      throw new Error('offline')
    }
    const response = await get(scope, '/never-visited', {
      mode: 'navigate',
      destination: 'document',
    })

    expect(response?.body).toContain('You are offline')
  })

  it('still says something truthful when even the offline page is missing', async () => {
    const scope = boot()
    scope.responder = async () => {
      throw new Error('offline')
    }

    const response = await get(scope, '/', { mode: 'navigate', destination: 'document' })

    expect(response?.status).toBe(503)
    expect(response?.body).toContain('You are offline')
  })

  it('does not cache an error response, or a site keeps showing 404 after it is fixed', async () => {
    const scope = boot()
    scope.responder = async () => new FakeResponse('gone', { status: 404 })

    await get(scope, '/typo', { mode: 'navigate', destination: 'document' })

    const cache = scope.caches.caches.get(cacheNameFor(PREFIX, VERSION, 'documents'))
    expect(cache?.entries.size ?? 0).toBe(0)
  })
})

describe('serving assets', () => {
  it('does not hit the network twice for a fingerprinted asset', async () => {
    const scope = boot()
    scope.responder = async () => new FakeResponse('js')

    await get(scope, '/_astro/app.C0ffee12.js', { destination: 'script' })
    await get(scope, '/_astro/app.C0ffee12.js', { destination: 'script' })

    expect(scope.fetched.filter((url) => url.includes('app.C0ffee12.js'))).toHaveLength(1)
  })

  it('serves an image from cache and refreshes it in the background', async () => {
    const scope = boot()
    scope.responder = async () => new FakeResponse('v1')
    await get(scope, '/media/a.jpg', { destination: 'image' })

    scope.responder = async () => new FakeResponse('v2')
    const stale = await get(scope, '/media/a.jpg', { destination: 'image' })
    const next = await get(scope, '/media/a.jpg', { destination: 'image' })

    expect(stale?.body).toBe('v1')
    expect(next?.body).toBe('v2')
  })

  it('never intercepts a request it has no rule for', async () => {
    const scope = boot()

    const event = await scope.dispatch('fetch', new FakeEvent(fakeRequest('/x.pdf')))

    expect(event.response).toBeNull()
    expect(scope.fetched).toEqual([])
  })
})

describe('the way out', () => {
  it('empties every cache it owns and unregisters itself when asked', async () => {
    const scope = boot()
    await install(scope)
    scope.caches.seed(cacheNameFor(PREFIX, 'old00000', 'images'), '/a.jpg', new FakeResponse('x'))

    await scope.dispatch('message', new FakeEvent(fakeRequest('/'), { type: 'cogenta:unregister' }))

    expect(await scope.caches.keys()).toEqual([])
    expect(scope.unregistered).toBe(true)
    expect(scope.posted).toContainEqual({ type: 'cogenta:unregistered' })
  })

  it('purges without unregistering when the admin only clears the cache', async () => {
    const scope = boot()
    await install(scope)

    await scope.dispatch('message', new FakeEvent(fakeRequest('/'), { type: 'cogenta:purge' }))

    expect(await scope.caches.keys()).toEqual([])
    expect(scope.unregistered).toBe(false)
  })

  it('ignores a message it does not understand instead of throwing in an event handler', async () => {
    const scope = boot()

    await scope.dispatch('message', new FakeEvent(fakeRequest('/'), 'hello'))
    await scope.dispatch('message', new FakeEvent(fakeRequest('/'), { type: 'other' }))

    expect(scope.unregistered).toBe(false)
  })
})

describe('the tombstone worker', () => {
  it('removes the caches and itself, and never intercepts a request', async () => {
    const scope = new FakeScope()
    scope.caches.seed(cacheNameFor(PREFIX, VERSION, 'documents'), '/', new FakeResponse('old'))
    scope.caches.seed('other-app:v1:pages', '/', new FakeResponse('theirs'))
    tombstoneMain(scope, PREFIX)

    await install(scope)
    await activate(scope)

    const event = await scope.dispatch('fetch', new FakeEvent(fakeRequest('/')))

    expect(scope.skipWaitingCalled).toBe(true)
    expect(scope.unregistered).toBe(true)
    expect(await scope.caches.keys()).toEqual(['other-app:v1:pages'])
    expect(event.response).toBeNull()
  })
})
