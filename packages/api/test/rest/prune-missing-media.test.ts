import { createBlockRegistry, defineBlock, f } from '@cogenta/blocks'
import type { CollectionDefinition } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import type { SerialisedEntry } from '../../src/content/index.js'
import type { DependencySource } from '../../src/rest/dependencies.js'
import { pruneMissingMedia } from '../../src/rest/prune-missing-media.js'

/**
 * A media reference that no longer resolves must read as "no media chosen".
 *
 * The failure this exists for is a whole page of HTTP 500: a theme renders
 * every block of a page in one call, `RenderContext.image()` is frozen by
 * contract D with no "absent" state to return, so one deleted asset left a
 * published page unservable. Neither the contract nor the ten themes can gain
 * that state without a major bump — so the dead reference is taken out of the
 * data upstream, where "no media chosen" is a case every theme already draws.
 */

const PAGE: CollectionDefinition = {
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  fields: {
    title: { kind: 'text', required: true, options: {} },
    cover: { kind: 'media', options: { accept: ['image'] } },
    attachments: { kind: 'media', options: { accept: ['image'], many: true } },
    body: { kind: 'blocks', options: { allow: '*' } },
  },
  permissions: {
    read: ['public'],
    create: ['editor'],
    update: ['editor'],
    delete: ['admin'],
    publish: ['editor'],
  },
}

const SOURCE: DependencySource = {
  collection: (name) => (name === PAGE.name ? PAGE : undefined),
}

function entry(overrides: Partial<SerialisedEntry> = {}): SerialisedEntry {
  return {
    id: 'page-1',
    collection: 'page',
    locale: 'en',
    status: 'published',
    deletedAt: null,
    reviewState: 'none',
    assignedReviewer: null,
    state: 'published',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: null,
    updatedBy: null,
    translationOf: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    provenance: 'human',
    provenanceDetail: null,
    values: { title: 'A page' },
    blocks: {},
    ...overrides,
  }
}

const alive = (...ids: readonly string[]): ReadonlySet<string> => new Set(ids)

describe('a page whose media no longer exists', () => {
  it('forgets a collection field pointing at a deleted asset', () => {
    const result = pruneMissingMedia(
      [entry({ values: { title: 'A page', cover: 'gone' } })],
      SOURCE,
      alive(),
    )

    expect(result.entries[0]?.values['cover']).toBeUndefined()
    expect(result.prunedMedia).toEqual(['gone'])
    expect(result.droppedBlocks).toBe(0)
  })

  it('keeps the surviving assets of a multi-valued collection field', () => {
    const result = pruneMissingMedia(
      [entry({ values: { title: 'A page', attachments: ['alive-1', 'gone', 'alive-2'] } })],
      SOURCE,
      alive('alive-1', 'alive-2'),
    )

    expect(result.entries[0]?.values['attachments']).toEqual(['alive-1', 'alive-2'])
    expect(result.prunedMedia).toEqual(['gone'])
  })

  it('leaves an entry untouched when every asset it names still exists', () => {
    const original = entry({ values: { title: 'A page', cover: 'alive-1' } })
    const result = pruneMissingMedia([original], SOURCE, alive('alive-1'))

    expect(result.entries[0]).toBe(original)
    expect(result.prunedMedia).toEqual([])
  })

  it('never writes on the entry it was handed', () => {
    const values = { title: 'A page', cover: 'gone', attachments: ['gone-2', 'alive-1'] }
    const blocks = {
      body: [{ key: 'b1', type: 'hero', data: { title: 'Hi', media: 'gone-3' } }],
    }
    const original = entry({ values, blocks })

    pruneMissingMedia([original], SOURCE, alive('alive-1'))

    expect(values).toEqual({
      title: 'A page',
      cover: 'gone',
      attachments: ['gone-2', 'alive-1'],
    })
    expect(blocks.body[0]?.data).toEqual({ title: 'Hi', media: 'gone-3' })
  })

  it('empties an optional block field rather than losing the block around it', () => {
    const result = pruneMissingMedia(
      [
        entry({
          blocks: {
            body: [
              {
                key: 'b1',
                type: 'hero',
                data: { title: 'Still a headline', media: 'gone' },
              },
            ],
          },
        }),
      ],
      SOURCE,
      alive(),
    )

    const block = result.entries[0]?.blocks['body']?.[0]
    expect(block?.type).toBe('hero')
    expect(block?.data['title']).toBe('Still a headline')
    expect(block?.data['media']).toBeUndefined()
    expect(result.droppedBlocks).toBe(0)
  })

  it('removes a block whose only reason to exist was the deleted image', () => {
    const result = pruneMissingMedia(
      [
        entry({
          blocks: {
            body: [
              { key: 'b1', type: 'mediaFigure', data: { media: 'gone', caption: 'A caption' } },
              { key: 'b2', type: 'hero', data: { title: 'Kept' } },
            ],
          },
        }),
      ],
      SOURCE,
      alive(),
    )

    expect(result.entries[0]?.blocks['body']?.map((block) => block.key)).toEqual(['b2'])
    expect(result.droppedBlocks).toBe(1)
    expect(result.prunedMedia).toEqual(['gone'])
  })

  it('keeps the pictures of a gallery that only lost one of them', () => {
    const result = pruneMissingMedia(
      [
        entry({
          blocks: {
            body: [
              {
                key: 'b1',
                type: 'gallery',
                data: {
                  layout: 'grid',
                  items: [
                    { _key: 'i1', media: 'alive-1' },
                    { _key: 'i2', media: 'gone' },
                    { _key: 'i3', media: 'alive-2' },
                  ],
                },
              },
            ],
          },
        }),
      ],
      SOURCE,
      alive('alive-1', 'alive-2'),
    )

    const items = result.entries[0]?.blocks['body']?.[0]?.data['items']
    expect(items).toEqual([
      { _key: 'i1', media: 'alive-1' },
      { _key: 'i3', media: 'alive-2' },
    ])
    expect(result.droppedBlocks).toBe(0)
  })

  it('removes a gallery that lost every picture it had', () => {
    const result = pruneMissingMedia(
      [
        entry({
          blocks: {
            body: [
              {
                key: 'b1',
                type: 'gallery',
                data: { layout: 'grid', items: [{ _key: 'i1', media: 'gone' }] },
              },
            ],
          },
        }),
      ],
      SOURCE,
      alive(),
    )

    expect(result.entries[0]?.blocks['body']).toEqual([])
    expect(result.droppedBlocks).toBe(1)
  })

  it('keeps a testimonial that only lost its portrait', () => {
    const result = pruneMissingMedia(
      [
        entry({
          blocks: {
            body: [
              {
                key: 'b1',
                type: 'testimonial',
                data: {
                  quote: [],
                  attribution: { name: 'Ada', role: 'Engineer', avatar: 'gone' },
                },
              },
            ],
          },
        }),
      ],
      SOURCE,
      alive(),
    )

    const block = result.entries[0]?.blocks['body']?.[0]
    expect(block?.data['attribution']).toEqual({ name: 'Ada', role: 'Engineer' })
    expect(result.droppedBlocks).toBe(0)
  })

  it('leaves a block of a type it cannot read exactly as it found it', () => {
    const original = entry({
      blocks: {
        body: [{ key: 'b1', type: 'countdown', data: { media: 'gone', until: 'soon' } }],
      },
    })
    const result = pruneMissingMedia([original], SOURCE, alive())

    expect(result.entries[0]?.blocks['body']?.[0]?.data).toEqual({
      media: 'gone',
      until: 'soon',
    })
    expect(result.droppedBlocks).toBe(0)
    expect(result.prunedMedia).toEqual([])
  })

  it('reads a block a plugin registered through the registry it was given', () => {
    const banner = defineBlock({
      name: 'banner',
      version: '1.0.0',
      runtime: 'static',
      fallback: null,
      a11y: { headingLevel: 'none' },
      schema: { media: f.media({ required: true }) },
    })
    const registry = createBlockRegistry([banner])

    const result = pruneMissingMedia(
      [entry({ blocks: { body: [{ key: 'b1', type: 'banner', data: { media: 'gone' } }] } })],
      { ...SOURCE, blocks: registry },
      alive(),
    )

    expect(result.entries[0]?.blocks['body']).toEqual([])
    expect(result.droppedBlocks).toBe(1)
  })

  it('reaches the media of an entry a relation inlined into the response', () => {
    const inlined = entry({ id: 'page-2', values: { title: 'Linked', cover: 'gone' } })
    const holder = entry({ values: { title: 'Holder', related: inlined } })

    const source: DependencySource = {
      collection: (name) =>
        name === 'page'
          ? {
              ...PAGE,
              fields: {
                ...PAGE.fields,
                related: { kind: 'relation', options: { to: 'page' } },
              },
            }
          : undefined,
    }

    const result = pruneMissingMedia([holder], source, alive())
    const related = result.entries[0]?.values['related'] as SerialisedEntry

    expect(related.values['cover']).toBeUndefined()
    expect(inlined.values['cover']).toBe('gone')
  })
})
