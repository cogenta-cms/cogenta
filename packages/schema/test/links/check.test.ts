import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { checkLinks } from '../../src/links/check.js'
import { extractLinks } from '../../src/links/extract.js'
import type { ContentStore } from '../../src/store/store.js'
import { createContentStore } from '../../src/store/store.js'
import { createSchemaTables, dropSchemaTables } from '../../src/store/tables.js'
import type {
  BlockZones,
  ContentBlock,
  ContentEntry,
  ContentValues,
} from '../../src/store/types.js'
import type { CollectionDefinition } from '../../src/types.js'

/**
 * A real SQLite store and, for the external half, a real HTTP server: the
 * point of a link checker is what it says about content that really exists,
 * and a mocked store would only prove the walk visits objects.
 */
const page: CollectionDefinition = {
  name: 'link_page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  versioning: { drafts: true, history: true },
  fields: {
    title: { kind: 'text', required: true, options: { max: 200 } },
    slug: { kind: 'slug', required: true, options: { from: 'title' } },
    body: { kind: 'blocks', options: { allow: [] } },
  },
  permissions: { read: ['public'] },
}

function textBlock(key: string, data: Record<string, unknown>): ContentBlock {
  return { key, type: 'prose', data }
}

/** A fully-typed entry for the two pure `extractLinks` cases, which need no store. */
function entryOf(values: ContentValues, blocks: BlockZones): ContentEntry {
  return {
    id: 'e1',
    locale: 'en',
    status: 'published',
    state: 'published',
    publishedAt: null,
    createdAt: '',
    updatedAt: '',
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    translationOf: null,
    provenance: 'human',
    provenanceDetail: null,
    version: 1,
    values,
    blocks,
  }
}

describe('extractLinks', () => {
  it('finds a rich-text external link, an internal reference and a plain url field', () => {
    const links = extractLinks(
      entryOf(
        {
          website: 'ignored — not a url key',
          url: 'https://example.org/docs',
          body: [
            {
              _key: 'b1',
              _type: 'block',
              style: 'normal',
              children: [{ _key: 's1', _type: 'span', text: 'hi', marks: ['m1'] }],
              markDefs: [
                { _key: 'm1', _type: 'link', href: 'https://elsewhere.test/page' },
                { _key: 'm2', _type: 'internalLink', collection: 'link_page', id: 'other' },
              ],
            },
          ],
        },
        {
          main: [
            {
              key: 'cta',
              type: 'cta',
              data: { actions: [{ label: 'Go', target: { href: '/about' } }] },
            },
          ],
        },
      ),
    )

    expect(links).toEqual([
      { kind: 'url', href: 'https://example.org/docs', at: 'url' },
      { kind: 'url', href: 'https://elsewhere.test/page', at: 'body[0].markDefs[0].href' },
      {
        kind: 'entry',
        collection: 'link_page',
        id: 'other',
        at: 'body[0].markDefs[1]',
      },
      { kind: 'url', href: '/about', at: 'blocks.main[0].data.actions[0].target.href' },
    ])
  })

  it('reports one link per distinct target, however many times it appears', () => {
    const links = extractLinks(
      entryOf(
        { url: '/repeated' },
        {
          main: [
            textBlock('a', { href: '/repeated' }),
            textBlock('b', { href: '/repeated' }),
            textBlock('c', { href: '/other' }),
          ],
        },
      ),
    )

    expect(links.map((link) => (link.kind === 'url' ? link.href : link.id))).toEqual([
      '/repeated',
      '/other',
    ])
  })
})

describe('checkLinks', () => {
  let directory: string
  let db: DatabaseHandle
  let store: ContentStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-links-'))
    db = await createSqliteHandle({ url: join(directory, 'store.db') })
    await createSchemaTables(db, [page])
    store = createContentStore({ db, collection: page })
  })

  afterEach(async () => {
    await dropSchemaTables(db, [page])
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  const options = () => ({
    collections: [page],
    storeFor: () => store,
  })

  async function publish(slug: string, blocks: Record<string, unknown[]> = {}) {
    const created = await store.create({
      values: { title: slug, slug },
      blocks: blocks as never,
    })
    return store.publish(created.id)
  }

  it('finds nothing wrong with a site whose internal links all resolve', async () => {
    await publish('target')
    await publish('source', { body: [textBlock('a', { href: '/target' })] })

    const report = await checkLinks(options())

    expect(report.broken).toEqual([])
    expect(report.checkedEntries).toBe(2)
  })

  it('reports a site-relative path that matches no published entry', async () => {
    await publish('source', { body: [textBlock('a', { href: '/never-existed' })] })

    const report = await checkLinks(options())

    expect(report.broken).toHaveLength(1)
    expect(report.broken[0]).toMatchObject({
      collection: 'link_page',
      reason: 'target_missing',
      at: 'blocks.body[0].data.href',
    })
  })

  it('reports a path that matches no route at all', async () => {
    await publish('source', { body: [textBlock('a', { href: '/deep/nested/nowhere' })] })

    const report = await checkLinks(options())

    expect(report.broken[0]?.reason).toBe('unroutable_path')
  })

  it('tells a deleted target apart from one that is merely unpublished', async () => {
    const draft = await store.create({ values: { title: 'Not yet', slug: 'not-yet' } })
    await publish('source', {
      body: [
        textBlock('a', { collection: 'link_page', id: draft.id }),
        textBlock('b', { collection: 'link_page', id: 'no-such-entry' }),
      ],
    })

    const report = await checkLinks(options())

    expect(report.broken.map((broken) => broken.reason).sort()).toEqual([
      'target_missing',
      'target_unpublished',
    ])
  })

  it('reports a reference to a collection this site does not have', async () => {
    await publish('source', {
      body: [textBlock('a', { collection: 'not_a_collection', id: 'x' })],
    })

    const report = await checkLinks(options())

    expect(report.broken[0]?.reason).toBe('unknown_collection')
  })

  it('ignores anchors, mailto and bare relative references', async () => {
    await publish('source', {
      body: [
        textBlock('a', { href: '#section' }),
        textBlock('b', { href: 'mailto:hello@example.com' }),
        textBlock('c', { href: 'tel:+33100000000' }),
        textBlock('d', { href: 'somewhere-relative' }),
      ],
    })

    const report = await checkLinks(options())

    expect(report.broken).toEqual([])
  })

  it('skips external URLs unless it is asked to follow them', async () => {
    await publish('source', { body: [textBlock('a', { href: 'https://nowhere.invalid/x' })] })

    const report = await checkLinks(options())

    expect(report.broken).toEqual([])
    expect(report.skippedExternal).toBe(1)
  })

  it('checks each distinct target once however many entries point at it', async () => {
    await publish('target')
    for (const slug of ['one', 'two', 'three']) {
      await publish(slug, { body: [textBlock('a', { href: '/target' })] })
    }

    let listCalls = 0
    const counting: ContentStore = {
      ...store,
      list: async (listOptions) => {
        listCalls += 1
        return store.list(listOptions)
      },
    }

    const report = await checkLinks({ collections: [page], storeFor: () => counting })

    expect(report.broken).toEqual([])
    // One page of the crawl itself, plus exactly one resolution of `/target`.
    expect(listCalls).toBe(2)
  })
})

describe('checkLinks against a real external server', () => {
  let server: Server
  let base: string
  let directory: string
  let db: DatabaseHandle
  let store: ContentStore

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/ok') {
        res.writeHead(200).end()
        return
      }
      if (req.url === '/head-refused') {
        // A real and common shape: HEAD refused, GET served.
        res.writeHead(req.method === 'HEAD' ? 405 : 200).end()
        return
      }
      res.writeHead(404).end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    base = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
  })

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-links-ext-'))
    db = await createSqliteHandle({ url: join(directory, 'store.db') })
    await createSchemaTables(db, [page])
    store = createContentStore({ db, collection: page })
  })

  afterEach(async () => {
    await dropSchemaTables(db, [page])
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  async function publishWith(hrefs: readonly string[]) {
    const created = await store.create({
      values: { title: 'source', slug: 'source' },
      blocks: {
        body: hrefs.map((href, index) => textBlock(`b${index}`, { href })),
      } as never,
    })
    await store.publish(created.id)
  }

  it('accepts a URL the server really serves and reports the one it does not', async () => {
    await publishWith([`${base}/ok`, `${base}/gone`])

    const report = await checkLinks({
      collections: [page],
      storeFor: () => store,
      checkExternal: true,
    })

    expect(report.broken).toHaveLength(1)
    expect(report.broken[0]).toMatchObject({ reason: 'http_error', status: 404 })
  })

  it('does not call a URL broken because the server refuses HEAD', async () => {
    await publishWith([`${base}/head-refused`])

    const report = await checkLinks({
      collections: [page],
      storeFor: () => store,
      checkExternal: true,
    })

    expect(report.broken).toEqual([])
  })

  it('reports a host that cannot be reached at all', async () => {
    await publishWith(['http://127.0.0.1:1/nothing-listens-here'])

    const report = await checkLinks({
      collections: [page],
      storeFor: () => store,
      checkExternal: true,
      timeoutMs: 2_000,
    })

    expect(report.broken[0]?.reason).toBe('unreachable')
  })
})
