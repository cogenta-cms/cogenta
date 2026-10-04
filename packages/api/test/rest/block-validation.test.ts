import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ARTICLE,
  asEditor,
  bodyOf,
  createHarness,
  dataOf,
  type Harness,
  request,
} from './harness.js'

/**
 * What a page builder form sends is checked before it is stored (L36 audit).
 *
 * Found by a real run: a hero whose image had been cleared was stored as
 * `media: null` and crashed the public page on the next request.
 */
describe('writing blocks', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  const write = (blocks: unknown[]) =>
    harness.router.handle(
      request('POST', '/rest_article', {
        body: { values: { title: 'Page' }, blocks: { zone: blocks } },
      }),
      asEditor,
    )

  it('stores an optional field a form left empty as absent, not as an empty value', async () => {
    const response = await write([
      {
        key: 'hero',
        type: 'hero',
        data: { eyebrow: '', title: 'Titre', subtitle: '', media: null, actions: [] },
      },
    ])

    expect(response.status).toBe(201)
    const zone = (dataOf(response)['blocks'] as { zone: { data: Record<string, unknown> }[] }).zone
    expect(zone[0]?.data).toEqual({ title: 'Titre', actions: [] })
  })

  it('refuses a block contract B would not accept, naming the block and the field', async () => {
    const response = await write([{ key: 'hero', type: 'hero', data: { title: '', media: null } }])

    expect(response.status).toBe(400)
    const error = bodyOf(response)['error'] as { code: string }
    expect(error.code).toBe('BLOCK_INVALID')
    expect(JSON.stringify(error)).toContain('title')
  })

  it('leaves a block type it does not know to its own renderer', async () => {
    const response = await write([{ key: 'p', type: 'comparisonTable', data: { rows: [] } }])

    expect(response.status).toBe(201)
  })

  it.each([
    { collection: 'missing' },
    { collection: 'rest_author', sort: { field: 'publishedAt', direction: 'desc' } },
    { collection: 'rest_article', sort: { field: 'title', direction: 'asc' } },
    { collection: 'rest_article', filter: { missing: 'value' } },
    { collection: 'rest_article', filter: { zone: { exists: true } } },
    { collection: 'rest_article', filter: { rating: { gt: 'wrong type' } } },
    { collection: 'rest_article', filter: { featured: { exists: 'true' } } },
  ])('refuses schema-invalid collection list data before creating an entry (%j)', async (data) => {
    const response = await write([
      { key: 'list', type: 'collectionList', data: { layout: 'list', ...data } },
    ])
    expect(response.status).toBe(400)
    expect(bodyOf(response)).toMatchObject({ error: { code: 'BLOCK_INVALID' } })
    expect((await harness.store(ARTICLE).list({ state: 'working' })).items).toHaveLength(0)
  })

  it.each(['createdAt', 'publishedAt'])(
    'accepts a valid collection list ordered by %s',
    async (field) => {
      const response = await write([
        {
          key: 'list',
          type: 'collectionList',
          data: {
            collection: 'rest_article',
            layout: 'grid',
            sort: { field, direction: 'desc' },
            filter: { rating: { gt: 3 } },
          },
        },
      ])
      expect(response.status).toBe(201)
    },
  )

  it('refuses publishing legacy query data without changing the draft or published state', async () => {
    const stored = await harness.store(ARTICLE).create({
      values: { title: 'Legacy' },
      blocks: {
        zone: [
          {
            key: 'list',
            type: 'collectionList',
            data: {
              collection: 'rest_author',
              layout: 'list',
              sort: { field: 'publishedAt', direction: 'desc' },
            },
          },
        ],
      },
    })
    const response = await harness.router.handle(
      request('POST', `/rest_article/${stored.id}/publish`, { body: {} }),
      asEditor,
    )
    expect(response.status).toBe(400)
    expect((await harness.store(ARTICLE).read(stored.id, { state: 'working' }))?.status).toBe(
      'draft',
    )
    expect(await harness.store(ARTICLE).read(stored.id, { state: 'published' })).toBeNull()
  })
})
