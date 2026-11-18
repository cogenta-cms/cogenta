import type { lookup } from 'node:dns/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMemoryApprovalQueue } from '@cogenta/agents'
import {
  type AccessContext,
  type ContentService,
  createContentService,
  createPermissionLayer,
} from '@cogenta/api'
import { createAuditLog, ensureAuthTables } from '@cogenta/auth'
import { vocabularyRegistry } from '@cogenta/blocks'
import {
  createDatabaseMediaStore,
  createLocalStorage,
  createLogger,
  createSqliteHandle,
  type DatabaseHandle,
  type MediaStore,
  type PinnedFetch,
  type StorageDriver,
} from '@cogenta/core'
import {
  type CollectionDefinition,
  type ContentStore,
  countTermReferences,
  createContentStore,
  createSchemaTables,
  createTaxonomyStore,
  defineCollection,
  defineTaxonomy,
  f,
  type TaxonomyDefinition,
} from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createMcpToolSource,
  type McpIdentity,
  type McpToolSourceWithRevert,
} from '../src/commands/mcp-tools.js'
import { createUrlImageImporter, createUrlImageRemover } from '../src/commands/media-import.js'

/**
 * The undo of every write an autonomous MCP key may run without a person —
 * each one against a real SQLite database, the real content service and
 * permission layer, the real media ingest and the real taxonomy store. Only
 * the network of `media.import_url` is replaced (a fake resolver and
 * transport), the way `media-import.test.ts` does.
 *
 * Nothing in the administration calls `revert` yet; these tests call the same
 * seam (`createMcpToolSource(...).revert`) a screen would.
 */

const tag: TaxonomyDefinition = defineTaxonomy({
  name: 'tag',
  labels: { singular: { en: 'Tag' } },
  hierarchical: false,
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
})

const post: CollectionDefinition = defineCollection({
  name: 'post',
  labels: { singular: 'Post', plural: 'Posts' },
  versioning: { drafts: true, history: true, keep: 10 },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title' }),
    tags: f.taxonomy({ of: 'tag', many: true }),
    cover: f.media(),
  },
  permissions: {
    read: ['public'],
    create: ['editor'],
    update: ['editor'],
    publish: ['editor'],
    delete: ['editor'],
  },
})

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const fakeLookup = (async () => [
  { address: '93.184.216.34', family: 4 },
]) as unknown as typeof lookup
const fakePinnedFetch: PinnedFetch = async () =>
  new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })

const admin: McpIdentity = {
  actor: { id: 'apikey:admin-key', roles: ['admin', 'editor'] },
  authenticated: true,
  label: 'key "Test"',
  autonomy: 'autonomous',
}

interface Stack {
  readonly db: DatabaseHandle
  readonly service: ContentService
  readonly store: ContentStore
  readonly mediaStore: MediaStore
  readonly storage: StorageDriver
  readonly source: McpToolSourceWithRevert
  readonly context: AccessContext
  /** Calls a tool as the governed MCP tool does and returns its raw output. */
  call(name: string, input: Record<string, unknown>): Promise<Record<string, unknown>>
  revert(name: string, receipt: Record<string, unknown>): Promise<void>
}

const directories: string[] = []
const handles: DatabaseHandle[] = []

afterEach(async () => {
  await Promise.all(handles.splice(0).map((db) => db.close()))
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function stack(): Promise<Stack> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-mcp-revert-'))
  directories.push(root)
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  handles.push(db)
  const collections = [post]
  await createSchemaTables(db, collections, [tag])
  await ensureAuthTables(db)

  const stores = new Map<string, ContentStore>()
  const storeFor = (collection: CollectionDefinition): ContentStore => {
    const known = stores.get(collection.name)
    if (known !== undefined) return known
    const created = createContentStore({ db, collection, siblings: collections })
    stores.set(collection.name, created)
    return created
  }
  const permissions = createPermissionLayer({ collections })
  const service = createContentService({
    collections,
    permissions,
    storeFor,
    routing: { locales: ['en', 'fr'], defaultLocale: 'en' },
  })
  const mediaStore = createDatabaseMediaStore({ db })
  const storage = createLocalStorage({ path: join(root, 'media') })
  const taxonomyStores = new Map<string, ReturnType<typeof createTaxonomyStore>>()
  const taxonomyStoreFor = (taxonomy: TaxonomyDefinition) => {
    const known = taxonomyStores.get(taxonomy.name)
    if (known !== undefined) return known
    const created = createTaxonomyStore({ db, taxonomy })
    taxonomyStores.set(taxonomy.name, created)
    return created
  }

  const source = createMcpToolSource(
    {
      collections,
      contentService: service,
      permissions,
      mediaStore,
      blocks: vocabularyRegistry,
      site: { name: 'News', locales: ['en', 'fr'], defaultLocale: 'en' },
      logger: createLogger({ level: 'silent' }),
      auditLog: createAuditLog(db),
      approvalQueue: createMemoryApprovalQueue(),
      transport: 'http',
      taxonomies: [tag],
      taxonomyStoreFor,
      importImage: createUrlImageImporter({
        mediaStore,
        storage,
        lookupImpl: fakeLookup,
        pinnedFetch: fakePinnedFetch,
      }),
      termUsage: (taxonomy, termId) => countTermReferences({ db, taxonomy, collections, termId }),
      removeImage: createUrlImageRemover({
        mediaStore,
        storage,
        collections,
        storeFor,
      }),
    },
    async () => admin,
  )

  return {
    db,
    service,
    store: storeFor(post),
    mediaStore,
    storage,
    source,
    context: { actor: admin.actor },
    call: async (name, input) => {
      const tool = (await source()).find((candidate) => candidate.spec.name === name)
      if (tool === undefined) throw new Error(`tool ${name} is not offered`)
      const output = await tool.execute(input, { signal: new AbortController().signal })
      return output as Record<string, unknown>
    },
    revert: (name, receipt) => source.revert(name, receipt),
  }
}

const read = (s: Stack, id: string, state: 'working' | 'published') =>
  s.service.read(s.context, 'post', id, { state, depth: 0 })

function titleOf(entry: { values: Readonly<Record<string, unknown>> }): unknown {
  return entry.values['title']
}

describe('autonomous MCP writes and their undo, on a real site', () => {
  it('runs a reversible write at once for an autonomous caller, and says nothing needs approval', async () => {
    const s = await stack()
    const tools = await s.source()
    const description = (name: string) =>
      tools.find((tool) => tool.spec.name === name)?.spec.description ?? ''

    for (const name of [
      'content.write_draft',
      'content.write_translation',
      'content.publish',
      'taxonomy.create_term',
      'media.import_url',
    ]) {
      expect(description(name), name).toContain('Runs at once')
    }
    // Not reversible: still asks, and says it is the autonomy that cannot waive it.
    for (const name of ['content.delete', 'media.write']) {
      expect(description(name), name).toContain('Requires a human approval')
      expect(description(name), name).toContain('cannot be undone')
    }
  })

  it('moves a created draft to the trash, and refuses once somebody edited it', async () => {
    const s = await stack()
    const created = await s.call('content.write_draft', {
      collection: 'post',
      values: { title: 'New', slug: 'new' },
    })
    const id = String(created['id'])

    await s.revert('content.write_draft', created)

    await expect(read(s, id, 'working')).rejects.toMatchObject({ code: 'CONTENT_NOT_FOUND' })
    expect((await s.store.read(id, { state: 'working', trashed: 'include' }))?.deletedAt).not.toBe(
      null,
    )

    // A second draft that a person then edits: the undo leaves it alone.
    const second = await s.call('content.write_draft', {
      collection: 'post',
      values: { title: 'Second', slug: 'second' },
    })
    await s.service.update(
      s.context,
      'post',
      String(second['id']),
      { values: { title: 'Edited by a person' } },
      { state: 'working', depth: 0 },
    )
    await expect(s.revert('content.write_draft', second)).rejects.toMatchObject({
      code: 'TOOL_REVERT_REFUSED',
    })
    expect(titleOf(await read(s, String(second['id']), 'working'))).toBe('Edited by a person')
  })

  it('puts the previous working version back after an update', async () => {
    const s = await stack()
    const created = await s.call('content.write_draft', {
      collection: 'post',
      values: { title: 'First', slug: 'first' },
    })
    const id = String(created['id'])
    const updated = await s.call('content.write_draft', {
      collection: 'post',
      id,
      values: { title: 'Second' },
    })
    expect(titleOf(await read(s, id, 'working'))).toBe('Second')

    await s.revert('content.write_draft', updated)

    expect(titleOf(await read(s, id, 'working'))).toBe('First')
    // The history only grew: the undo is itself a version.
    const history = await s.service.history(s.context, 'post', id)
    expect(history.length).toBeGreaterThanOrEqual(3)
  })

  it('refuses to undo an update after a later edit instead of restoring over it', async () => {
    const s = await stack()
    const created = await s.call('content.write_draft', {
      collection: 'post',
      values: { title: 'First', slug: 'first' },
    })
    const id = String(created['id'])
    const updated = await s.call('content.write_draft', {
      collection: 'post',
      id,
      values: { title: 'Second' },
    })
    await s.call('content.write_draft', { collection: 'post', id, values: { title: 'Third' } })

    await expect(s.revert('content.write_draft', updated)).rejects.toMatchObject({
      code: 'TOOL_REVERT_REFUSED',
    })
    expect(titleOf(await read(s, id, 'working'))).toBe('Third')
  })

  it('moves a created translation to the trash and leaves its source alone', async () => {
    const s = await stack()
    const english = await s.call('content.write_draft', {
      collection: 'post',
      locale: 'en',
      values: { title: 'Hello', slug: 'hello' },
    })
    const french = await s.call('content.write_translation', {
      collection: 'post',
      sourceId: english['id'],
      locale: 'fr',
      values: { title: 'Bonjour', slug: 'bonjour' },
    })

    await s.revert('content.write_translation', french)

    await expect(read(s, String(french['id']), 'working')).rejects.toMatchObject({
      code: 'CONTENT_NOT_FOUND',
    })
    expect(titleOf(await read(s, String(english['id']), 'working'))).toBe('Hello')
  })

  it('takes a first publication back to a draft that visitors no longer see', async () => {
    const s = await stack()
    const created = await s.call('content.write_draft', {
      collection: 'post',
      values: { title: 'Scoop', slug: 'scoop' },
    })
    const id = String(created['id'])
    const published = await s.call('content.publish', { collection: 'post', id })
    expect(titleOf(await read(s, id, 'published'))).toBe('Scoop')

    await s.revert('content.publish', published)

    await expect(read(s, id, 'published')).rejects.toMatchObject({ code: 'CONTENT_NOT_FOUND' })
    expect(titleOf(await read(s, id, 'working'))).toBe('Scoop')
    expect((await read(s, id, 'working')).status).toBe('draft')
  })

  it('puts the previously public version back when a republication is undone', async () => {
    const s = await stack()
    const created = await s.call('content.write_draft', {
      collection: 'post',
      values: { title: 'Public text', slug: 'public-text' },
    })
    const id = String(created['id'])
    await s.call('content.publish', { collection: 'post', id })
    await s.call('content.write_draft', { collection: 'post', id, values: { title: 'Pending' } })
    const republished = await s.call('content.publish', { collection: 'post', id })
    expect(titleOf(await read(s, id, 'published'))).toBe('Pending')

    await s.revert('content.publish', republished)

    // Visitors see the earlier text again, and the entry is still published.
    expect(titleOf(await read(s, id, 'published'))).toBe('Public text')
    expect((await read(s, id, 'published')).status).toBe('published')
  })

  it('refuses to undo a publication once the entry was edited', async () => {
    const s = await stack()
    const created = await s.call('content.write_draft', {
      collection: 'post',
      values: { title: 'a', slug: 'a' },
    })
    const id = String(created['id'])
    const published = await s.call('content.publish', { collection: 'post', id })
    await s.call('content.write_draft', { collection: 'post', id, values: { title: 'b' } })

    await expect(s.revert('content.publish', published)).rejects.toMatchObject({
      code: 'TOOL_REVERT_REFUSED',
    })
    expect(titleOf(await read(s, id, 'published'))).toBe('a')
  })

  it('deletes a term this call created while unused, and refuses once an entry carries it', async () => {
    const s = await stack()
    const unused = await s.call('taxonomy.create_term', {
      taxonomy: 'tag',
      slug: 'unused',
      labels: { en: 'Unused' },
    })
    await s.revert('taxonomy.create_term', unused)
    const afterFirst = await s.call('taxonomy.list_terms', { taxonomy: 'tag' })
    expect(afterFirst['terms']).toEqual([])

    const used = await s.call('taxonomy.create_term', {
      taxonomy: 'tag',
      slug: 'ai',
      labels: { en: 'AI' },
    })
    const entry = await s.call('content.write_draft', {
      collection: 'post',
      values: { title: 'Tagged', slug: 'tagged', tags: [used['id']] },
    })
    await expect(s.revert('taxonomy.create_term', used)).rejects.toMatchObject({
      code: 'TOOL_REVERT_REFUSED',
    })

    // A trashed entry still holds the term: deleting it would unclassify it for good.
    await s.service.remove(s.context, 'post', String(entry['id']))
    await expect(s.revert('taxonomy.create_term', used)).rejects.toMatchObject({
      code: 'TOOL_REVERT_REFUSED',
    })
    const stillThere = await s.call('taxonomy.list_terms', { taxonomy: 'tag' })
    expect((stillThere['terms'] as { slug: string }[]).map((term) => term.slug)).toEqual(['ai'])
  })

  it('never deletes a term that already existed', async () => {
    const s = await stack()
    await s.call('taxonomy.create_term', { taxonomy: 'tag', slug: 'ai', labels: { en: 'AI' } })
    const again = await s.call('taxonomy.create_term', {
      taxonomy: 'tag',
      slug: 'ai',
      labels: { en: 'AI' },
    })
    expect(again['created']).toBe(false)

    await expect(s.revert('taxonomy.create_term', again)).rejects.toMatchObject({
      code: 'TOOL_REVERT_REFUSED',
    })
    expect(((await s.call('taxonomy.list_terms', { taxonomy: 'tag' }))['terms'] as []).length).toBe(
      1,
    )
  })

  it('deletes an imported image that nothing uses, and keeps one an entry carries', async () => {
    const s = await stack()
    const unused = await s.call('media.import_url', {
      url: 'https://images.example.org/one.png',
      alt: 'One',
    })
    const unusedAsset = await s.mediaStore.get(String(unused['id']))
    expect(unusedAsset).not.toBeNull()
    expect(await s.storage.exists(unusedAsset?.storageKey ?? '')).toBe(true)

    await s.revert('media.import_url', unused)

    expect(await s.mediaStore.get(String(unused['id']))).toBeNull()
    expect(await s.storage.exists(unusedAsset?.storageKey ?? '')).toBe(false)

    const used = await s.call('media.import_url', {
      url: 'https://images.example.org/two.png',
      alt: 'Two',
    })
    const entry = await s.call('content.write_draft', {
      collection: 'post',
      values: { title: 'With a cover', slug: 'with-a-cover', cover: used['id'] },
    })
    await expect(s.revert('media.import_url', used)).rejects.toMatchObject({
      code: 'TOOL_REVERT_REFUSED',
    })
    expect(await s.mediaStore.get(String(used['id']))).not.toBeNull()

    // Trashing the entry does not free the file: restoring it would point at nothing.
    await s.service.remove(s.context, 'post', String(entry['id']))
    await expect(s.revert('media.import_url', used)).rejects.toMatchObject({
      code: 'TOOL_REVERT_REFUSED',
    })
  })

  it('does not delete a library file that a person uploaded, whatever the receipt says', async () => {
    const s = await stack()
    const uploaded = await s.mediaStore.create({
      kind: 'image',
      filename: 'mine.png',
      mimeType: 'image/png',
      size: 1,
      alt: 'mine',
      storageKey: 'media/mine.png',
      createdBy: 'user-1',
    })

    await expect(s.revert('media.import_url', { id: uploaded.id })).rejects.toMatchObject({
      code: 'TOOL_REVERT_REFUSED',
    })
    expect(await s.mediaStore.get(uploaded.id)).not.toBeNull()
  })

  it('refuses to revert a tool that has no undo', async () => {
    const s = await stack()
    await expect(s.revert('content.delete', { ok: true })).rejects.toMatchObject({
      code: 'RECEIPT_NOT_REVERTIBLE',
    })
  })
})
