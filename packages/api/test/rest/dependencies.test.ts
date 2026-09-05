import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ResponseDependencies } from '../../src/rest/dependencies.js'
import type { RestResponse } from '../../src/rest/http.js'
import type { AccessContext } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'
import {
  ARTICLE,
  AUTHOR,
  asEditor,
  asPublic,
  bodyOf,
  createHarness,
  type Harness,
  PAGE,
  request,
  TAG,
} from './harness.js'

/**
 * A read response declares what was actually read to produce it.
 *
 * The failure this exists for is silent: server-side relation expansion inlines
 * an author into an article, the author's identifier never crosses the content
 * client as a request of its own, so a render cache never tags it — and the
 * article page stays stale for ever after the author is renamed, with nothing
 * to see. What a client asked for is not what a response depended on.
 */
describe('what a response declares it was built from', () => {
  let harness: Harness

  const dependenciesOf = (response: RestResponse): ResponseDependencies => {
    const meta = bodyOf(response)['meta']
    const value =
      typeof meta === 'object' && meta !== null
        ? (meta as { dependencies?: unknown }).dependencies
        : undefined
    return (value ?? { entries: [], media: [], collections: [] }) as ResponseDependencies
  }

  beforeEach(async () => {
    harness = await createHarness()

    await harness.store(AUTHOR).create({
      id: 'author-1',
      status: 'published',
      values: { name: 'Ada' },
    })
    await harness.store(TAG).create({ id: 'tag-1', status: 'published', values: { title: 'Ops' } })

    await harness.store(ARTICLE).create({
      id: 'article-1',
      status: 'published',
      values: { title: 'Two planes', writer: 'author-1', tags: ['tag-1'] },
      blocks: {
        zone: [
          { key: 'b-hero', type: 'hero', data: { title: 'Two planes', media: 'media-hero' } },
          {
            key: 'b-gallery',
            type: 'gallery',
            data: {
              layout: 'grid',
              items: [
                { _key: 'i1', media: 'media-shot-1' },
                { _key: 'i2', media: 'media-shot-2' },
              ],
            },
          },
        ],
      },
    })
  })

  afterEach(async () => {
    await harness.dispose()
  })

  it('declares an entry inlined by relation expansion, which the client never asked for', async () => {
    const response = await harness.router.handle(
      request('GET', '/rest_article/article-1', { query: { depth: '1' } }),
      asPublic,
    )

    const dependencies = dependenciesOf(response)
    expect(dependencies.entries).toContain('rest_article:article-1')
    expect(dependencies.entries).toContain('rest_author:author-1')
    expect(dependencies.entries).toContain('rest_tag:tag-1')
    expect(dependencies.collections).toContain('rest_author')
  })

  it('does not claim a relation it left as an identifier', async () => {
    const response = await harness.router.handle(
      request('GET', '/rest_article/article-1', { query: { depth: '0' } }),
      asPublic,
    )

    const dependencies = dependenciesOf(response)
    expect(dependencies.entries).toEqual(['rest_article:article-1'])
  })

  it('declares the media a block points at, including inside a list of items', async () => {
    const response = await harness.router.handle(
      request('GET', '/rest_article/article-1'),
      asPublic,
    )

    expect(dependenciesOf(response).media).toEqual(['media-hero', 'media-shot-1', 'media-shot-2'])
  })

  it('declares the media inside a nested json field named differently than "media"', async () => {
    // `testimonial.attribution` (blocks@2.0) is a `json` field whose own
    // media reference is named `avatar`, matching `quote`'s top-level field
    // of the same name rather than the `media` name every list item uses.
    await harness.store(ARTICLE).create({
      id: 'article-testimonial',
      status: 'published',
      values: { title: 'Testimonial page' },
      blocks: {
        zone: [
          {
            key: 'b-testimonial',
            type: 'testimonial',
            data: {
              quote: [
                { _type: 'block', _key: 'p1', children: [{ _type: 'span', text: 'Great.' }] },
              ],
              attribution: { name: 'Ada', avatar: 'media-avatar-1' },
            },
          },
        ],
      },
    })

    const response = await harness.router.handle(
      request('GET', '/rest_article/article-testimonial'),
      asPublic,
    )

    expect(dependenciesOf(response).media).toEqual(['media-avatar-1'])
  })

  it('declares the collection of a list, so that a first entry still invalidates it', async () => {
    const response = await harness.router.handle(request('GET', '/rest_page'), asPublic)

    const dependencies = dependenciesOf(response)
    expect(dependencies.entries).toEqual([])
    expect(dependencies.collections).toEqual(['rest_page'])
  })

  it('declares the dependencies of a path resolution too', async () => {
    await harness.store(PAGE).create({
      id: 'page-live',
      status: 'published',
      values: { slug: 'hello', title: 'Hello' },
    })

    const response = await harness.router.handle(
      request('GET', '/-/by-path', { query: { path: '/blog/hello' } }),
      asPublic,
    )

    expect(dependenciesOf(response).entries).toEqual(['rest_page:page-live'])
  })

  it('never names an entry the caller was not allowed to see', async () => {
    // A draft author, related from a published article: expansion refuses it and
    // leaves the identifier, so the metadata must not resurrect it either.
    await harness.store(AUTHOR).create({ id: 'author-draft', values: { name: 'Hidden' } })
    await harness.store(ARTICLE).create({
      id: 'article-2',
      status: 'published',
      values: { title: 'Second', writer: 'author-draft' },
    })

    const stranger = await harness.router.handle(
      request('GET', '/rest_article/article-2', { query: { depth: '1' } }),
      asPublic,
    )
    expect(dependenciesOf(stranger).entries).toEqual(['rest_article:article-2'])

    const editor = await harness.router.handle(
      request('GET', '/rest_article/article-2', { query: { depth: '1', state: 'working' } }),
      asEditor,
    )
    expect(dependenciesOf(editor).entries).toContain('rest_author:author-draft')
  })

  it('does not let a preview grant widen the metadata beyond the entry it covers', async () => {
    await harness.store(AUTHOR).create({ id: 'author-draft', values: { name: 'Hidden' } })
    await harness.store(ARTICLE).create({
      id: 'article-3',
      status: 'published',
      values: { title: 'Third', writer: 'author-draft' },
    })
    const grant: AccessContext = {
      actor: ANONYMOUS,
      preview: { collection: 'rest_article', entryId: 'article-3', expiresAt: Date.now() + 60_000 },
    }

    const response = await harness.router.handle(
      request('GET', '/rest_article/article-3', { query: { depth: '1', state: 'working' } }),
      grant,
    )

    expect(dependenciesOf(response).entries).toEqual(['rest_article:article-3'])
  })
})
