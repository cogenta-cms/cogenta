import { type CacheDriver, createMemoryCache, isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import {
  createReadRecorder,
  createRenderCache,
  pageCacheKey,
  recordingContentClient,
  recordingRenderContext,
} from '../../src/cache/index.js'
import type { ContentClient, ContentEntry, Page } from '../../src/content/types.js'
import { createRenderContext } from '../../src/context/render-context.js'

/**
 * The render cache is judged on one sentence of the L3 acceptance criteria:
 * publishing a piece of content invalidates exactly the pages concerned, and
 * not the whole cache. Every test below checks both halves — what went, and
 * what stayed.
 */

const site = {
  name: 'Test',
  url: 'https://example.test',
  locales: ['fr'],
  defaultLocale: 'fr',
} as const

function entry(id: string, title: string): ContentEntry {
  return {
    id,
    locale: 'fr',
    status: 'published',
    publishedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    translationOf: null,
    version: 1,
    values: { title },
    blocks: {},
  }
}

/** A content API with no network behind it. It only has to answer the same way twice. */
function fakeContent(entries: Map<string, ContentEntry>): ContentClient {
  return {
    entry: async (_collection, id) => entries.get(id) ?? null,
    byPath: async (path) => entries.get(path.replace(/^\/article\//u, '')) ?? null,
    list: async (): Promise<Page<ContentEntry>> => ({
      items: [...entries.values()],
      nextCursor: null,
      hasMore: false,
    }),
  }
}

describe('the render cache', () => {
  it('serves a second request from the cache without rendering again', async () => {
    const entries = new Map([['a1', entry('a1', 'One')]])
    const cache = createRenderCache({ cache: createMemoryCache() })
    let renders = 0

    const render = async () =>
      cache.render({ locale: 'fr', url: '/article/a1' }, async (recorder) => {
        renders += 1
        const found = await recordingContentClient(fakeContent(entries), recorder).entry(
          'article',
          'a1',
        )
        return `<h1>${String(found?.values.title)}</h1>`
      })

    const first = await render()
    const second = await render()

    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(second.value).toBe('<h1>One</h1>')
    expect(renders).toBe(1)
    // Tags survive the round trip, so a hit knows its own dependencies.
    expect(second.tags).toEqual(first.tags)
  })

  it('derives the tags of a page from what the page actually read', async () => {
    const entries = new Map([['a1', entry('a1', 'One')]])
    const cache = createRenderCache({ cache: createMemoryCache() })

    const result = await cache.render({ locale: 'fr', url: '/' }, async (recorder) => {
      const context = recordingRenderContext(
        createRenderContext({
          site,
          locale: 'fr',
          url: 'https://example.test/',
          content: fakeContent(entries),
        }),
        recorder,
      )
      const page = await context.content.list({ collection: 'article' })
      context.image({ id: 'm1', kind: 'image', width: 800, height: 600 })
      return page.items.length
    })

    expect([...result.tags].sort()).toEqual(['collection:article', 'entry:a1', 'media:m1'])
  })

  it('drops the page of a published entry and leaves every other page alone', async () => {
    const entries = new Map([
      ['a1', entry('a1', 'One')],
      ['a2', entry('a2', 'Two')],
    ])
    const cache = createRenderCache({ cache: createMemoryCache() })

    const article = async (id: string) =>
      cache.render({ locale: 'fr', url: `/article/${id}` }, async (recorder) => {
        const found = await recordingContentClient(fakeContent(entries), recorder).entry(
          'article',
          id,
        )
        return String(found?.values.title)
      })

    await article('a1')
    await article('a2')

    await cache.invalidate({ collection: 'article', id: 'a1' })

    expect((await article('a1')).cached).toBe(false)
    expect((await article('a2')).cached).toBe(true)
  })

  it('drops a list page when an entry it never showed is published', async () => {
    const entries = new Map([['a1', entry('a1', 'One')]])
    const cache = createRenderCache({ cache: createMemoryCache() })

    const list = async () =>
      cache.render({ locale: 'fr', url: '/blog' }, async (recorder) => {
        const page = await recordingContentClient(fakeContent(entries), recorder).list({
          collection: 'article',
        })
        return page.items.map((item) => item.id).join(',')
      })

    expect((await list()).value).toBe('a1')

    // The new entry was, by definition, not in the cached page. Only the
    // collection tag can save this — which is the whole point of carrying one.
    entries.set('a2', entry('a2', 'Two'))
    await cache.invalidate({ collection: 'article', id: 'a2' })

    const after = await list()
    expect(after.cached).toBe(false)
    expect(after.value).toBe('a1,a2')
  })

  it('drops the page of a deleted entry, and the page that said it was missing', async () => {
    const entries = new Map([['a1', entry('a1', 'One')]])
    const cache = createRenderCache({ cache: createMemoryCache() })

    const byPath = async (path: string) =>
      cache.render({ locale: 'fr', url: path }, async (recorder) => {
        const found = await recordingContentClient(fakeContent(entries), recorder).byPath(path)
        return found === null ? 'not found' : String(found.values.title)
      })

    expect((await byPath('/article/a1')).value).toBe('One')
    expect((await byPath('/article/a9')).value).toBe('not found')

    entries.delete('a1')
    await cache.invalidate({ collection: 'article', id: 'a1', paths: ['/article/a1'] })
    expect((await byPath('/article/a1')).value).toBe('not found')

    // A 404 page is tagged by the path it failed to resolve, so publishing
    // something at that path later takes it down too.
    entries.set('a9', entry('a9', 'Nine'))
    await cache.invalidate({ collection: 'article', id: 'a9', paths: ['/article/a9'] })
    expect((await byPath('/article/a9')).value).toBe('Nine')
  })

  it('renders normally when the cache itself is broken', async () => {
    const broken: CacheDriver = {
      get: async () => {
        throw new Error('cache down')
      },
      set: async () => {
        throw new Error('cache down')
      },
      delete: async () => {
        throw new Error('cache down')
      },
      invalidateTags: async () => {
        throw new Error('cache down')
      },
      clear: async () => {
        throw new Error('cache down')
      },
    }
    const failures: string[] = []
    const cache = createRenderCache({
      cache: broken,
      onError: (error) => failures.push(error.code),
    })

    const result = await cache.render({ locale: 'fr', url: '/' }, async () => 'rendered anyway')

    expect(result.value).toBe('rendered anyway')
    expect(result.cached).toBe(false)
    // Both the read and the write failed, and neither reached the caller.
    expect(failures).toEqual(['CACHE_FAILED', 'CACHE_FAILED'])
  })

  it('refuses to hide a failed invalidation, because stale pages have no other symptom', async () => {
    const broken = {
      ...createMemoryCache(),
      invalidateTags: async (): Promise<void> => {
        throw new Error('cache down')
      },
    }
    const cache = createRenderCache({ cache: broken })

    const error = await cache
      .invalidate({ collection: 'article', id: 'a1' })
      .catch((e: unknown) => e)

    expect(isCogentaError(error)).toBe(true)
    expect(isCogentaError(error) ? error.code : '').toBe('CACHE_FAILED')
  })

  it('gives one key to one page, whatever the shape of its URL', () => {
    expect(pageCacheKey('render', { locale: 'fr', url: '/blog/' })).toBe(
      pageCacheKey('render', { locale: 'fr', url: 'https://example.test/blog' }),
    )
    expect(pageCacheKey('render', { locale: 'fr', url: '/blog?b=2&a=1' })).toBe(
      pageCacheKey('render', { locale: 'fr', url: '/blog?a=1&b=2' }),
    )
    expect(pageCacheKey('render', { locale: 'fr', url: '/blog' })).not.toBe(
      pageCacheKey('render', { locale: 'en', url: '/blog' }),
    )
    // A page that varies on the skin must not be served across skins.
    expect(pageCacheKey('render', { locale: 'fr', url: '/', variant: { skin: 'dark' } })).not.toBe(
      pageCacheKey('render', { locale: 'fr', url: '/', variant: { skin: 'light' } }),
    )
  })

  it('caches a value of null as a hit rather than re-rendering it forever', async () => {
    const cache = createRenderCache({ cache: createMemoryCache() })
    let renders = 0
    const render = async () =>
      cache.render({ locale: 'fr', url: '/empty' }, async () => {
        renders += 1
        return null
      })

    await render()
    const second = await render()

    expect(second.cached).toBe(true)
    expect(second.value).toBeNull()
    expect(renders).toBe(1)
  })

  it('forgets a single page on request without touching its neighbours', async () => {
    const cache = createRenderCache({ cache: createMemoryCache() })
    const render = async (path: string) =>
      cache.render({ locale: 'fr', url: path }, async () => path)

    await render('/one')
    await render('/two')
    await cache.forget({ locale: 'fr', url: '/one' })

    expect((await render('/one')).cached).toBe(false)
    expect((await render('/two')).cached).toBe(true)
  })

  it('records nothing it was not asked to record', () => {
    const recorder = createReadRecorder()
    expect(recorder.tags()).toEqual([])
    recorder.recordEntry('a1')
    recorder.recordEntry('a1')
    expect(recorder.tags()).toEqual(['entry:a1'])
  })
})
