import { CogentaError } from '@cogenta/core'
import { describe, expect, it, vi } from 'vitest'
import type {
  ContentAccessContext,
  ContentReadOptions,
  ContentServiceLike,
} from '../../../src/tools/core/content.js'
import {
  createContentPublishTool,
  createContentWriteDraftTool,
  createContentWriteTranslationTool,
} from '../../../src/tools/core/content.js'
import { createMediaImportUrlTool } from '../../../src/tools/core/media-import.js'
import {
  createTaxonomyCreateTermTool,
  type TaxonomyServiceLike,
  type TaxonomyTermLike,
} from '../../../src/tools/core/taxonomy.js'
import type { ToolContext } from '../../../src/tools/types.js'

const CTX: ToolContext = {
  site: { name: 'news', locales: ['en', 'fr'], defaultLocale: 'en' },
  actor: { id: 'apikey:k1', roles: ['editor'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

interface FakeEntry {
  readonly collection: string
  status: string
  /** The version the live row holds. */
  live: number
  readonly versions: Map<number, Record<string, unknown>>
  deleted: boolean
  publishedAt: string | null
}

/**
 * A content service that keeps the version rules of the real store that the
 * undo relies on: a new version on every write, a draft overlay on a
 * published entry when `drafts` is on, a restore that writes a *new*
 * version, and a read of the published face that fails for an entry which is
 * not published.
 */
function statefulService(options: { readonly drafts: boolean; readonly withUndo?: boolean }) {
  const entries = new Map<string, FakeEntry>()
  let counter = 0
  const withUndo = options.withUndo ?? true

  const notFound = () =>
    new CogentaError({
      code: 'CONTENT_NOT_FOUND',
      message: 'No such entry.',
      hint: 'Check the id.',
    })
  const get = (id: string): FakeEntry => {
    const entry = entries.get(id)
    if (entry === undefined || entry.deleted) throw notFound()
    return entry
  }
  const latest = (entry: FakeEntry): number => Math.max(...entry.versions.keys())
  const shown = (id: string, entry: FakeEntry, version: number, status: string) => ({
    id,
    collection: entry.collection,
    version,
    status,
    publishedAt: entry.publishedAt,
    values: { ...entry.versions.get(version) },
  })
  const workingStatus = (entry: FakeEntry): string =>
    latest(entry) > entry.live ? 'draft' : entry.status

  const service: ContentServiceLike = {
    read: async (
      _context: ContentAccessContext,
      _collection: string,
      id: string,
      readOptions: ContentReadOptions,
    ) => {
      const entry = get(id)
      if (readOptions.state === 'published') {
        if (entry.status !== 'published') throw notFound()
        return shown(id, entry, entry.live, 'published')
      }
      return shown(id, entry, latest(entry), workingStatus(entry))
    },
    create: async (_context, collection, input) => {
      counter += 1
      const id = `e${counter}`
      const entry: FakeEntry = {
        collection,
        status: 'draft',
        live: 1,
        versions: new Map([[1, { ...input.values }]]),
        deleted: false,
        publishedAt: null,
      }
      entries.set(id, entry)
      return shown(id, entry, 1, 'draft')
    },
    update: async (_context, _collection, id, input) => {
      const entry = get(id)
      const next = latest(entry) + 1
      entry.versions.set(next, { ...entry.versions.get(latest(entry)), ...input.values })
      if (!(options.drafts && entry.status === 'published')) entry.live = next
      return shown(id, entry, next, workingStatus(entry))
    },
    publish: async (_context, _collection, id) => {
      const entry = get(id)
      entry.live = latest(entry)
      entry.status = 'published'
      entry.publishedAt ??= '2026-11-18T10:00:00.000Z'
      return shown(id, entry, entry.live, 'published')
    },
    remove: async (_context, _collection, id) => {
      get(id).deleted = true
    },
    ...(withUndo
      ? {
          restore: async (_context, _collection, id, version) => {
            const entry = get(id)
            const source = entry.versions.get(version)
            if (source === undefined) {
              throw new CogentaError({
                code: 'CONTENT_NOT_FOUND',
                message: 'This version is no longer kept.',
                hint: 'Pick one the history lists.',
              })
            }
            const next = latest(entry) + 1
            entry.versions.set(next, { ...source })
            if (!(options.drafts && entry.status === 'published')) entry.live = next
            return shown(id, entry, next, workingStatus(entry))
          },
          unpublish: async (_context, _collection, id, input) => {
            const entry = get(id)
            entry.status = input.status ?? 'draft'
            if (input.publishedAt !== undefined) entry.publishedAt = input.publishedAt
            return shown(id, entry, latest(entry), entry.status)
          },
        }
      : {}),
  }
  return { service, entries }
}

describe('content.write_draft revert', () => {
  it('is not reversible when the host cannot restore a version', () => {
    const { service } = statefulService({ drafts: true, withUndo: false })
    const tool = createContentWriteDraftTool(service)
    expect(tool.reversible).toBe(false)
    expect(tool.revert).toBeUndefined()
  })

  it('moves a created draft to the trash', async () => {
    const { service, entries } = statefulService({ drafts: true })
    const tool = createContentWriteDraftTool(service)
    const created = await tool.execute({ collection: 'post', values: { title: 'New' } }, CTX)

    await tool.revert?.(created, CTX)

    expect(entries.get(String(created['id']))?.deleted).toBe(true)
  })

  it('makes the previous working version current again after an update', async () => {
    const { service, entries } = statefulService({ drafts: true })
    const tool = createContentWriteDraftTool(service)
    const created = await tool.execute({ collection: 'post', values: { title: 'First' } }, CTX)
    const id = String(created['id'])
    const updated = await tool.execute({ collection: 'post', id, values: { title: 'Second' } }, CTX)
    expect(updated['undo']).toMatchObject({
      kind: 'restore-version',
      version: 2,
      restoreVersion: 1,
    })

    await tool.revert?.(updated, CTX)

    const entry = entries.get(id)
    // A new version carrying the old values: the history is append-only.
    expect(entry?.versions.get(3)).toEqual({ title: 'First' })
    expect(entry?.versions.get(2)).toEqual({ title: 'Second' })
  })

  it('refuses to restore once the entry was edited after the update', async () => {
    const { service } = statefulService({ drafts: true })
    const tool = createContentWriteDraftTool(service)
    const created = await tool.execute({ collection: 'post', values: { title: 'First' } }, CTX)
    const id = String(created['id'])
    const updated = await tool.execute({ collection: 'post', id, values: { title: 'Second' } }, CTX)
    await tool.execute({ collection: 'post', id, values: { title: 'Third' } }, CTX)

    await expect(tool.revert?.(updated, CTX)).rejects.toMatchObject({
      code: 'TOOL_REVERT_REFUSED',
    })
  })

  it('refuses to trash a created draft that was edited since', async () => {
    const { service, entries } = statefulService({ drafts: true })
    const tool = createContentWriteDraftTool(service)
    const created = await tool.execute({ collection: 'post', values: { title: 'New' } }, CTX)
    const id = String(created['id'])
    await tool.execute({ collection: 'post', id, values: { title: 'Edited by a person' } }, CTX)

    await expect(tool.revert?.(created, CTX)).rejects.toMatchObject({ code: 'TOOL_REVERT_REFUSED' })
    expect(entries.get(id)?.deleted).toBe(false)
  })

  it('refuses a receipt with nothing to undo with instead of guessing a version', async () => {
    const { service } = statefulService({ drafts: true })
    const tool = createContentWriteDraftTool(service)
    await expect(tool.revert?.({ id: 'e1', version: 2 }, CTX)).rejects.toMatchObject({
      code: 'TOOL_REVERT_REFUSED',
    })
  })
})

describe('content.write_translation revert', () => {
  it('moves the created translation to the trash and nothing else', async () => {
    const { service, entries } = statefulService({ drafts: true })
    const source = await service.create(
      { actor: CTX.actor },
      'post',
      { values: { title: 'Hello' } },
      {
        state: 'working',
        depth: 0,
      },
    )
    const tool = createContentWriteTranslationTool(service)
    const translated = await tool.execute(
      {
        collection: 'post',
        sourceId: String(source['id']),
        locale: 'fr',
        values: { title: 'Bonjour' },
      },
      CTX,
    )

    await tool.revert?.(translated, CTX)

    expect(entries.get(String(translated['id']))?.deleted).toBe(true)
    expect(entries.get(String(source['id']))?.deleted).toBe(false)
  })

  it('does not accept the receipt of another tool', async () => {
    const { service } = statefulService({ drafts: true })
    const draft = createContentWriteDraftTool(service)
    const created = await draft.execute({ collection: 'post', values: { title: 'x' } }, CTX)
    const id = String(created['id'])
    const updated = await draft.execute({ collection: 'post', id, values: { title: 'y' } }, CTX)
    await expect(
      createContentWriteTranslationTool(service).revert?.(updated, CTX),
    ).rejects.toMatchObject({ code: 'TOOL_REVERT_REFUSED' })
  })
})

describe('content.publish revert', () => {
  it('is not reversible when the host can neither restore nor unpublish', () => {
    const { service } = statefulService({ drafts: true, withUndo: false })
    expect(createContentPublishTool(service).reversible).toBe(false)
  })

  it('takes a first publication back to the draft it was', async () => {
    const { service, entries } = statefulService({ drafts: true })
    const created = await createContentWriteDraftTool(service).execute(
      { collection: 'post', values: { title: 'Draft' } },
      CTX,
    )
    const id = String(created['id'])
    const tool = createContentPublishTool(service)
    const published = await tool.execute({ collection: 'post', id }, CTX)
    expect(entries.get(id)?.status).toBe('published')

    await tool.revert?.(published, CTX)

    expect(entries.get(id)?.status).toBe('draft')
  })

  it('puts the previously public version back when the entry was published already', async () => {
    const { service, entries } = statefulService({ drafts: true })
    const draft = createContentWriteDraftTool(service)
    const publish = createContentPublishTool(service)
    const created = await draft.execute(
      { collection: 'post', values: { title: 'Public text' } },
      CTX,
    )
    const id = String(created['id'])
    await publish.execute({ collection: 'post', id }, CTX)
    // A pending draft over the public version, then published.
    await draft.execute({ collection: 'post', id, values: { title: 'Pending text' } }, CTX)
    const republished = await publish.execute({ collection: 'post', id }, CTX)
    const before = entries.get(id)
    expect(before?.versions.get(before.live)).toEqual({ title: 'Pending text' })

    await publish.revert?.(republished, CTX)

    const after = entries.get(id)
    expect(after?.status).toBe('published')
    // What visitors see is the earlier text again, as the live version.
    expect(after?.versions.get(after.live)).toEqual({ title: 'Public text' })
  })

  it('does nothing when a republication changed nothing visitors could see', async () => {
    const { service, entries } = statefulService({ drafts: false })
    const created = await createContentWriteDraftTool(service).execute(
      { collection: 'post', values: { title: 'Same' } },
      CTX,
    )
    const id = String(created['id'])
    const publish = createContentPublishTool(service)
    await publish.execute({ collection: 'post', id }, CTX)
    const again = await publish.execute({ collection: 'post', id }, CTX)
    const versionsBefore = entries.get(id)?.versions.size

    await publish.revert?.(again, CTX)

    expect(entries.get(id)?.status).toBe('published')
    expect(entries.get(id)?.versions.size).toBe(versionsBefore)
  })

  it('refuses when the entry was edited after it was published', async () => {
    const { service, entries } = statefulService({ drafts: true })
    const draft = createContentWriteDraftTool(service)
    const created = await draft.execute({ collection: 'post', values: { title: 'a' } }, CTX)
    const id = String(created['id'])
    const publish = createContentPublishTool(service)
    const published = await publish.execute({ collection: 'post', id }, CTX)
    await draft.execute({ collection: 'post', id, values: { title: 'edited after' } }, CTX)

    await expect(publish.revert?.(published, CTX)).rejects.toMatchObject({
      code: 'TOOL_REVERT_REFUSED',
    })
    expect(entries.get(id)?.status).toBe('published')
  })

  it('refuses a receipt that does not describe a publication', async () => {
    const { service } = statefulService({ drafts: true })
    const created = await createContentWriteDraftTool(service).execute(
      { collection: 'post', values: { title: 'a' } },
      CTX,
    )
    await expect(createContentPublishTool(service).revert?.(created, CTX)).rejects.toMatchObject({
      code: 'TOOL_REVERT_REFUSED',
    })
  })
})

function fakeTerms(options: {
  readonly initial?: readonly TaxonomyTermLike[]
  readonly uses?: number
  readonly withUndo?: boolean
}) {
  const terms = [...(options.initial ?? [])]
  const deleted: string[] = []
  const service: TaxonomyServiceLike = {
    list: async () => terms,
    create: async (_taxonomy, input) => {
      const term = {
        id: `t${terms.length + 1}`,
        slug: input.slug,
        parent: input.parent ?? null,
        labels: input.labels,
      }
      terms.push(term)
      return term
    },
    ...(options.withUndo === false
      ? {}
      : {
          usage: async () => options.uses ?? 0,
          delete: async (_taxonomy: string, id: string) => {
            deleted.push(id)
            terms.splice(
              terms.findIndex((term) => term.id === id),
              1,
            )
          },
        }),
  }
  return { service, deleted, terms }
}

const NEW_TERM = { taxonomy: 'tag', slug: 'ai', labels: { en: 'AI' } }

describe('taxonomy.create_term revert', () => {
  it('is not reversible when the host cannot count uses and delete', () => {
    const tool = createTaxonomyCreateTermTool(fakeTerms({ withUndo: false }).service)
    expect(tool.reversible).toBe(false)
  })

  it('deletes the term this call created while nothing uses it', async () => {
    const { service, deleted } = fakeTerms({})
    const tool = createTaxonomyCreateTermTool(service)
    const receipt = await tool.execute(NEW_TERM, CTX)
    expect(receipt).toMatchObject({ created: true, taxonomy: 'tag' })

    await tool.revert?.(receipt, CTX)

    expect(deleted).toEqual([receipt.id])
  })

  it('refuses while an entry carries the term, naming how many', async () => {
    const { service, deleted } = fakeTerms({ uses: 2 })
    const tool = createTaxonomyCreateTermTool(service)
    const receipt = await tool.execute(NEW_TERM, CTX)

    await expect(tool.revert?.(receipt, CTX)).rejects.toMatchObject({
      code: 'TOOL_REVERT_REFUSED',
      details: { uses: 2 },
    })
    expect(deleted).toEqual([])
  })

  it('never deletes a term that already existed before the call', async () => {
    const { service, deleted } = fakeTerms({
      initial: [{ id: 't1', slug: 'ai', parent: null, labels: { en: 'AI' } }],
    })
    const tool = createTaxonomyCreateTermTool(service)
    const receipt = await tool.execute(NEW_TERM, CTX)
    expect(receipt.created).toBe(false)

    await expect(tool.revert?.(receipt, CTX)).rejects.toMatchObject({ code: 'TOOL_REVERT_REFUSED' })
    expect(deleted).toEqual([])
  })

  it('treats a term somebody already deleted as undone', async () => {
    const { service, deleted, terms } = fakeTerms({})
    const tool = createTaxonomyCreateTermTool(service)
    const receipt = await tool.execute(NEW_TERM, CTX)
    terms.length = 0

    await tool.revert?.(receipt, CTX)

    expect(deleted).toEqual([])
  })
})

describe('media.import_url revert', () => {
  const imported = {
    id: 'm1',
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    byteLength: 10,
    width: 1,
    height: 1,
  }

  it('is not reversible without a host that can remove an unreferenced image', () => {
    const tool = createMediaImportUrlTool({ importImage: vi.fn(async () => imported) })
    expect(tool.reversible).toBe(false)
    expect(tool.revert).toBeUndefined()
  })

  it('removes exactly the imported asset', async () => {
    const removeImage = vi.fn(async () => undefined)
    const tool = createMediaImportUrlTool({
      importImage: vi.fn(async () => imported),
      removeImage,
    })
    const receipt = await tool.execute({ url: 'https://example.com/a.jpg', alt: 'x' }, CTX)

    await tool.revert?.(receipt, CTX)

    expect(tool.reversible).toBe(true)
    expect(removeImage).toHaveBeenCalledWith({ id: 'm1' })
  })

  it('lets the host refuse while the image is still in use', async () => {
    const tool = createMediaImportUrlTool({
      importImage: vi.fn(async () => imported),
      removeImage: async () => {
        throw new CogentaError({
          code: 'TOOL_REVERT_REFUSED',
          message: 'In use.',
          hint: 'Remove it from the entries first.',
        })
      },
    })
    const receipt = await tool.execute({ url: 'https://example.com/a.jpg', alt: 'x' }, CTX)
    await expect(tool.revert?.(receipt, CTX)).rejects.toMatchObject({ code: 'TOOL_REVERT_REFUSED' })
  })
})
