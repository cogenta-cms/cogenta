import type { MediaAsset, MediaStore } from '@cogenta/core'
import { describe, expect, it, vi } from 'vitest'
import { createMediaListTool } from '../../../src/tools/core/media-list.js'
import type { ToolContext } from '../../../src/tools/types.js'

const CTX: ToolContext = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:media', roles: ['agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

function asset(overrides: Partial<MediaAsset> & { id: string }): MediaAsset {
  return {
    kind: 'image',
    filename: `${overrides.id}.jpg`,
    mimeType: 'image/jpeg',
    size: 120_000,
    width: 1600,
    height: 900,
    alt: 'A harbour at dusk',
    decorative: false,
    decorativeJustification: null,
    focal: null,
    storageKey: `media/${overrides.id}`,
    tags: [],
    contentHash: 'hash',
    createdAt: '2026-09-01T00:00:00.000Z',
    createdBy: null,
    folderId: null,
    provenance: 'human',
    provenanceDetail: null,
    ...overrides,
  } as MediaAsset
}

function fakeStore(page: { items: MediaAsset[]; nextCursor: string | null }): MediaStore {
  return {
    list: vi.fn(async () => ({ ...page, hasMore: page.nextCursor !== null })),
  } as unknown as MediaStore
}

describe('media.list', () => {
  it('lists the newest assets first, with what a media audit needs and nothing more', async () => {
    const store = fakeStore({ items: [asset({ id: 'a' })], nextCursor: 'cursor-2' })
    const tool = createMediaListTool(store)

    const result = await tool.execute({}, CTX)

    expect(store.list).toHaveBeenCalledWith({
      sort: 'createdAt',
      direction: 'desc',
      limit: 50,
    })
    expect(result).toEqual({
      items: [
        {
          id: 'a',
          kind: 'image',
          filename: 'a.jpg',
          mimeType: 'image/jpeg',
          size: 120_000,
          width: 1600,
          height: 900,
          alt: 'A harbour at dusk',
          decorative: false,
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      nextCursor: 'cursor-2',
    })
    // The storage key is how a file is fetched: an agent auditing alt text has
    // no business with it, so it is not in the shape at all.
    expect(JSON.stringify(result)).not.toContain('storageKey')
    expect(JSON.stringify(result)).not.toContain('media/a')
  })

  it('passes a kind and a cursor through, and caps the page size it will ask for', async () => {
    const store = fakeStore({ items: [], nextCursor: null })
    const tool = createMediaListTool(store)

    await tool.execute({ kind: 'video', limit: 10, cursor: 'from-here' }, CTX)

    expect(store.list).toHaveBeenCalledWith({
      sort: 'createdAt',
      direction: 'desc',
      limit: 10,
      kind: 'video',
      cursor: 'from-here',
    })
    expect(tool.input.safeParse({ limit: 500 }).success).toBe(false)
    expect(tool.input.safeParse({ kind: 'spreadsheet' }).success).toBe(false)
  })

  it('reads, so it asks for the permission that reads — never a new one', () => {
    const tool = createMediaListTool(fakeStore({ items: [], nextCursor: null }))

    expect(tool.permissions).toEqual(['media.read'])
    expect(tool.sideEffects).toBe(false)
  })
})
