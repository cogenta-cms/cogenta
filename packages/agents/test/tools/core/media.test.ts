import type { MediaAsset, MediaStore } from '@cogenta/core'
import { describe, expect, it, vi } from 'vitest'
import { createMediaReadTool, createMediaWriteTool } from '../../../src/tools/core/media.js'
import type { ToolContext } from '../../../src/tools/types.js'

const CTX: ToolContext = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:accessibility', roles: ['agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

const ASSET: MediaAsset = {
  id: 'm1',
  kind: 'image',
  filename: 'cover.png',
  mimeType: 'image/png',
  size: 1024,
  width: 800,
  height: 600,
  alt: 'A red bicycle',
  decorative: false,
  decorativeJustification: null,
  focal: null,
  storageKey: 'media/m1',
  tags: [],
  contentHash: 'sha256:deadbeef',
  folderId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  provenance: 'human',
  provenanceDetail: null,
}

/**
 * `ASSET` minus the fields contract C keeps out of this already-shipped
 * tool's output — `folderId` (fiche 46) and provenance, which was added to
 * `MediaAsset` so a generated image is never mistaken for a photograph and
 * would otherwise have widened this signature as a side effect. See
 * `media.ts`'s own comment.
 */
const {
  folderId: _assetFolderId,
  provenance: _assetProvenance,
  provenanceDetail: _assetProvenanceDetail,
  ...EXPECTED_TOOL_ASSET
} = ASSET

function fakeStore(overrides: Partial<MediaStore> = {}): MediaStore {
  return {
    create: vi.fn(async () => ASSET),
    get: vi.fn(async () => ASSET),
    list: vi.fn(async () => ({ items: [ASSET], nextCursor: null, hasMore: false })),
    count: vi.fn(async () => 1),
    update: vi.fn(async () => ({ ...ASSET, alt: 'Updated alt' })),
    replace: vi.fn(async () => ASSET),
    delete: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('media.read', () => {
  it('returns the asset when found', async () => {
    const store = fakeStore()
    const tool = createMediaReadTool(store)

    const result = await tool.execute({ id: 'm1' }, CTX)

    expect(result).toEqual(EXPECTED_TOOL_ASSET)
    expect(store.get).toHaveBeenCalledWith('m1')
  })

  // The same rule, and it was nearly broken: provenance was added to
  // `MediaAsset` so a generated image is never mistaken for a photograph,
  // which would have widened this already-shipped tool's output as a side
  // effect. An agent that needs to know what made a file needs a tool whose
  // own signature says so.
  it('never exposes provenance either — contract C figures a shipped signature', async () => {
    const store = fakeStore()
    const tool = createMediaReadTool(store)

    const result = await tool.execute({ id: 'm1' }, CTX)

    expect(result).not.toHaveProperty('provenance')
    expect(result).not.toHaveProperty('provenanceDetail')
  })

  it('never exposes folderId — contract C keeps this tool exactly as figured (fiche 46)', async () => {
    const store = fakeStore()
    const tool = createMediaReadTool(store)

    const result = await tool.execute({ id: 'm1' }, CTX)

    expect(Object.hasOwn(result, 'folderId')).toBe(false)
  })

  it('throws MEDIA_NOT_FOUND when the store returns null', async () => {
    const store = fakeStore({ get: vi.fn(async () => null) })
    const tool = createMediaReadTool(store)

    await expect(tool.execute({ id: 'ghost' }, CTX)).rejects.toThrowError(
      /No media asset with id "ghost"/,
    )
  })
})

describe('media.write', () => {
  it('forwards only the fields given to store.update', async () => {
    const store = fakeStore()
    const tool = createMediaWriteTool(store)

    const result = await tool.execute({ id: 'm1', alt: 'Updated alt' }, CTX)

    expect(result.alt).toBe('Updated alt')
    expect(store.update).toHaveBeenCalledWith('m1', { alt: 'Updated alt' })
  })

  it('omits fields the caller did not provide, rather than sending them as undefined', async () => {
    const store = fakeStore()
    const tool = createMediaWriteTool(store)

    await tool.execute({ id: 'm1', decorative: true }, CTX)

    expect(store.update).toHaveBeenCalledWith('m1', { decorative: true })
  })

  it('is marked sideEffects and not reversible', () => {
    const tool = createMediaWriteTool(fakeStore())
    expect(tool.sideEffects).toBe(true)
    expect(tool.reversible).toBe(false)
  })
})
