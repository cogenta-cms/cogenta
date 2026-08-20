import { describe, expect, it } from 'vitest'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import type {
  MarketplaceCatalogEntryLike,
  MarketplaceCatalogLike,
  MarketplaceInstallerLike,
  MarketplaceInstallRecordLike,
} from '../../src/rest/marketplace-router.js'
import type {
  CommerceCatalogLike,
  CommerceOrdersLike,
  ContentListProviderLike,
} from '../../src/rest/shell-status-router.js'
import { createShellStatusRouter } from '../../src/rest/shell-status-router.js'
import type { Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * `GET /api/shell-status` (fiche 35 task 3) — one aggregated read behind
 * every badge and feature flag the admin chrome needs, so a navigation never
 * pays for more than one request.
 */

const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }

function request(method = 'GET', path = '/api/shell-status'): RestRequest {
  return { method, path, query: {} }
}

function dataOf<T>(response: RestResponse): T {
  return (response.body as { data: T }).data
}

const emptyContent: ContentListProviderLike = {
  limits: { maxPageSize: 100 },
  list: async () => ({ items: [] }),
}

/** A fake `ContentService.list` that answers a fixed item count per collection, or throws for a collection this actor may not see the trash of. */
function contentWithTrash(
  itemsByCollection: Readonly<Record<string, number>>,
  forbiddenCollections: readonly string[] = [],
): ContentListProviderLike {
  return {
    limits: { maxPageSize: 100 },
    list: async (_context, name) => {
      if (forbiddenCollections.includes(name)) {
        throw new Error(`${name}: FORBIDDEN`)
      }
      const count = itemsByCollection[name] ?? 0
      return { items: Array.from({ length: count }, () => ({})) }
    },
  }
}

describe('the shell status transport', () => {
  it('answers an anonymous visitor with an all-empty status, never a refusal', async () => {
    const router = createShellStatusRouter({ content: emptyContent })
    const response = await router.handle(request(), { actor: ANONYMOUS })
    expect(response.status).toBe(200)
    expect(dataOf(response)).toEqual({
      trash: 0,
      commerceOrdersPending: null,
      commerceActive: false,
      marketplaceUpdates: null,
    })
  })

  it('sums trashed counts across every trash-enabled collection this actor may see the trash of', async () => {
    const content = contentWithTrash(
      { article: 3, page: 2, 'secret-memo': 9 },
      // A collection this actor may not see the trash of contributes
      // nothing — the router degrades rather than propagating the refusal.
      ['secret-memo'],
    )
    const router = createShellStatusRouter({
      content,
      trashableCollections: ['article', 'page', 'secret-memo'],
    })
    const response = await router.handle(request(), { actor: EDITOR })
    expect(dataOf<{ trash: number }>(response).trash).toBe(5)
  })

  it('never asks a collection with no trash at all', async () => {
    const asked: string[] = []
    const content: ContentListProviderLike = {
      limits: { maxPageSize: 100 },
      list: async (_context, name) => {
        asked.push(name)
        return { items: [] }
      },
    }
    const router = createShellStatusRouter({ content, trashableCollections: ['article'] })
    await router.handle(request(), { actor: EDITOR })
    expect(asked).toEqual(['article'])
  })

  it('answers null for orders when no commerce domain is mounted', async () => {
    const router = createShellStatusRouter({ content: emptyContent })
    const response = await router.handle(request(), { actor: EDITOR })
    expect(dataOf<{ commerceOrdersPending: number | null }>(response).commerceOrdersPending).toBe(
      null,
    )
  })

  it('counts pending and paid orders as one number, never per status', async () => {
    const calls: string[] = []
    const commerceOrders: CommerceOrdersLike = {
      list: async ({ status }) => {
        calls.push(status)
        if (status === 'pending') return [{}, {}]
        return [{}]
      },
    }
    const router = createShellStatusRouter({ content: emptyContent, commerceOrders })
    const response = await router.handle(request(), { actor: EDITOR })
    expect(dataOf<{ commerceOrdersPending: number }>(response).commerceOrdersPending).toBe(3)
    expect(calls.sort()).toEqual(['paid', 'pending'])
  })

  it('answers null orders for an actor with no role at all (R4 courtesy, not the real gate)', async () => {
    const commerceOrders: CommerceOrdersLike = { list: async () => [{}] }
    const router = createShellStatusRouter({ content: emptyContent, commerceOrders })
    const response = await router.handle(request(), { actor: { id: 'ghost', roles: [] } })
    expect(dataOf<{ commerceOrdersPending: number | null }>(response).commerceOrdersPending).toBe(
      null,
    )
  })

  it('reports the catalogue inactive when it has never held a product', async () => {
    const commerceCatalog: CommerceCatalogLike = { listProducts: async () => [] }
    const router = createShellStatusRouter({ content: emptyContent, commerceCatalog })
    const response = await router.handle(request(), { actor: EDITOR })
    expect(dataOf<{ commerceActive: boolean }>(response).commerceActive).toBe(false)
  })

  it('reports the catalogue active as soon as one product exists', async () => {
    let requestedLimit: number | undefined
    const commerceCatalog: CommerceCatalogLike = {
      listProducts: async (options) => {
        requestedLimit = options.limit
        return [{ id: 'p1' }]
      },
    }
    const router = createShellStatusRouter({ content: emptyContent, commerceCatalog })
    const response = await router.handle(request(), { actor: EDITOR })
    expect(dataOf<{ commerceActive: boolean }>(response).commerceActive).toBe(true)
    // Existence, not a count: never pulls more than one row to answer this.
    expect(requestedLimit).toBe(1)
  })

  function catalogueEntry(
    id: string,
    latestVersion: string | undefined,
  ): MarketplaceCatalogEntryLike {
    return {
      id,
      kind: 'plugin',
      displayName: id,
      description: '',
      category: 'other',
      reference: `local:${id}`,
      ...(latestVersion === undefined
        ? {}
        : { changelog: [{ version: latestVersion, notes: '' }] }),
    }
  }

  function fakeInstaller(
    records: readonly MarketplaceInstallRecordLike[],
  ): MarketplaceInstallerLike {
    return {
      preview: async () => {
        throw new Error('not used')
      },
      install: async () => {
        throw new Error('not used')
      },
      update: async () => {
        throw new Error('not used')
      },
      uninstall: async () => {
        throw new Error('not used')
      },
      activate: async () => {
        throw new Error('not used')
      },
      deactivate: async () => {
        throw new Error('not used')
      },
      list: async () => records,
      get: async () => null,
    }
  }

  function installed(itemId: string, pluginVersion: string | null): MarketplaceInstallRecordLike {
    return {
      itemId,
      kind: 'plugin',
      displayName: itemId,
      reference: `local:${itemId}`,
      pluginName: itemId,
      pluginVersion,
      signatureVerified: true,
      installedBy: 'user-admin',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      enabled: true,
    }
  }

  it('answers null marketplace updates when the marketplace is unmounted', async () => {
    const router = createShellStatusRouter({ content: emptyContent })
    const response = await router.handle(request(), { actor: ADMIN })
    expect(dataOf<{ marketplaceUpdates: number | null }>(response).marketplaceUpdates).toBe(null)
  })

  it('answers null marketplace updates for a non-admin, the only role that can act on one', async () => {
    const marketplaceCatalog: MarketplaceCatalogLike = {
      list: () => [],
      get: (id) => catalogueEntry(id, '2.0.0'),
    }
    const marketplaceInstaller = fakeInstaller([installed('theme-a', '1.0.0')])
    const router = createShellStatusRouter({
      content: emptyContent,
      marketplaceCatalog,
      marketplaceInstaller,
    })
    const response = await router.handle(request(), { actor: EDITOR })
    expect(dataOf<{ marketplaceUpdates: number | null }>(response).marketplaceUpdates).toBe(null)
  })

  it('counts installed items whose catalogue version has moved on', async () => {
    const marketplaceCatalog: MarketplaceCatalogLike = {
      list: () => [],
      get: (id) =>
        id === 'theme-a' ? catalogueEntry('theme-a', '2.0.0') : catalogueEntry(id, '1.0.0'),
    }
    const marketplaceInstaller = fakeInstaller([
      installed('theme-a', '1.0.0'),
      installed('skin-b', '1.0.0'),
    ])
    const router = createShellStatusRouter({
      content: emptyContent,
      marketplaceCatalog,
      marketplaceInstaller,
    })
    const response = await router.handle(request(), { actor: ADMIN })
    // Only `theme-a` moved (1.0.0 installed, 2.0.0 in the catalogue) —
    // `skin-b` is already current.
    expect(dataOf<{ marketplaceUpdates: number }>(response).marketplaceUpdates).toBe(1)
  })

  it('answers 404 for an unrelated path', async () => {
    const router = createShellStatusRouter({ content: emptyContent })
    const response = await router.handle(request('GET', '/api/something-else'), { actor: ADMIN })
    expect(response.status).toBe(404)
  })

  it('answers 405 for a write method', async () => {
    const router = createShellStatusRouter({ content: emptyContent })
    const response = await router.handle(request('POST'), { actor: ADMIN })
    expect(response.status).toBe(405)
  })

  it('defaults to the anonymous actor when no context is given, like every other router', async () => {
    const router = createShellStatusRouter({ content: emptyContent })
    const response: RestResponse = await router.handle(request())
    expect(response.status).toBe(200)
    expect(dataOf<{ trash: number }>(response).trash).toBe(0)
  })

  it('mounts at a custom path when configured', async () => {
    const router = createShellStatusRouter({ content: emptyContent, path: '/api/chrome-status' })
    const atDefault = await router.handle(request('GET', '/api/shell-status'), { actor: ADMIN })
    const atCustom = await router.handle(request('GET', '/api/chrome-status'), { actor: ADMIN })
    expect(atDefault.status).toBe(404)
    expect(atCustom.status).toBe(200)
  })
})
