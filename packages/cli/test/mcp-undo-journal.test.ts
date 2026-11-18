import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMemoryApprovalQueue } from '@cogenta/agents'
import {
  type AccessContext,
  createContentService,
  createPermissionLayer,
  type RestResponse,
} from '@cogenta/api'
import { type AuditLog, createAuditLog, ensureAuthTables } from '@cogenta/auth'
import { vocabularyRegistry } from '@cogenta/blocks'
import {
  createDatabaseMediaStore,
  createLogger,
  createSqliteHandle,
  type DatabaseHandle,
} from '@cogenta/core'
import {
  type CollectionDefinition,
  type ContentStore,
  createContentStore,
  createSchemaTables,
  defineCollection,
  f,
} from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createMcpToolSource, type McpIdentity } from '../src/commands/mcp-tools.js'
import { createMcpUndoRouter } from '../src/commands/mcp-undo.js'

/**
 * Undoing an MCP action changes the site, so the journal must be able to say
 * who asked before it happens — and must not let an undo go unrecorded. Real
 * SQLite, real content service; only the audit log's write is made to fail, to
 * prove the order of the steps (L42, R6).
 */

const post: CollectionDefinition = defineCollection({
  name: 'post',
  labels: { singular: 'Post', plural: 'Posts' },
  versioning: { drafts: true, history: true, keep: 10 },
  fields: { title: f.text({ required: true, max: 200 }), slug: f.slug({ from: 'title' }) },
  permissions: {
    read: ['public'],
    create: ['editor'],
    update: ['editor'],
    publish: ['editor'],
    delete: ['editor'],
  },
})

const keyIdentity: McpIdentity = {
  actor: { id: 'apikey:k1', roles: ['editor'] },
  authenticated: true,
  label: 'key "Test"',
  autonomy: 'autonomous',
}
const administrator: AccessContext['actor'] = { id: 'admin-1', roles: ['admin', 'editor'] }

const directories: string[] = []
const handles: DatabaseHandle[] = []
afterEach(async () => {
  await Promise.all(handles.splice(0).map((db) => db.close()))
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

type Fail = 'never' | 'all' | 'outcomes'

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-mcp-undo-journal-'))
  directories.push(root)
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  handles.push(db)
  const collections = [post]
  await createSchemaTables(db, collections, [])
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
    routing: { locales: ['en'], defaultLocale: 'en' },
  })

  const real = createAuditLog(db)
  let fail: Fail = 'never'
  const auditLog: AuditLog = {
    ...real,
    record: async (input) => {
      const diff = input.diff as Record<string, unknown> | undefined
      const isUndo = diff?.['origin'] === 'mcp-undo'
      const isOutcome = isUndo && typeof diff?.['ok'] === 'boolean'
      if (fail === 'all' && isUndo) throw new Error('disk full')
      if (fail === 'outcomes' && isOutcome) throw new Error('disk full')
      return real.record(input)
    },
  }

  const tools = {
    collections,
    contentService: service,
    permissions,
    mediaStore: createDatabaseMediaStore({ db }),
    blocks: vocabularyRegistry,
    site: { name: 'News', locales: ['en'], defaultLocale: 'en' },
    logger: createLogger({ level: 'silent' }),
    auditLog,
    approvalQueue: createMemoryApprovalQueue(),
  }
  const callerSource = createMcpToolSource({ ...tools, transport: 'http' }, async () => keyIdentity)
  const router = createMcpUndoRouter({ tools, auditLog, logger: tools.logger })

  const draft = async (title: string): Promise<string> => {
    const tool = (await callerSource()).find((t) => t.spec.name === 'content.write_draft')
    if (tool === undefined) throw new Error('content.write_draft is not offered')
    const output = (await tool.execute(
      { collection: 'post', values: { title, slug: title.toLowerCase() } },
      { signal: new AbortController().signal },
    )) as { id: string }
    return output.id
  }
  const auditIdOf = async (): Promise<string> => {
    const row = (await real.list({ action: 'agent.tool.content.write_draft', limit: 5 }))[0]
    if (row === undefined) throw new Error('the call was not journalled')
    return row.id
  }
  const undo = (auditId: string): Promise<RestResponse> =>
    router.handle(
      { method: 'POST', path: `/api/mcp/actions/${auditId}/revert`, query: {}, headers: {} },
      administrator,
    )
  const trashed = async (id: string): Promise<boolean> =>
    (await storeFor(post).read(id, { state: 'working', trashed: 'include' }))?.deletedAt !== null

  return {
    draft,
    auditIdOf,
    undo,
    trashed,
    journal: () => real.list({ action: 'agent.tool.content.write_draft.revert', limit: 20 }),
    setFail: (mode: Fail) => {
      fail = mode
    },
  }
}

const errorCode = (response: RestResponse): string | undefined =>
  (response.body as { error?: { code?: string } }).error?.code

describe('the journal of an undo of an MCP action', () => {
  it('writes the intent before it undoes, then the outcome', async () => {
    const s = await setup()
    const id = await s.draft('First')
    const response = await s.undo(await s.auditIdOf())

    expect(response.status).toBe(200)
    expect(await s.trashed(id)).toBe(true)
    const entries = (await s.journal()).map((row) => row.diff)
    expect(entries).toHaveLength(2)
    expect(entries.filter((diff) => diff?.['phase'] === 'started')).toHaveLength(1)
    expect(entries.filter((diff) => diff?.['ok'] === true)).toHaveLength(1)
  })

  it('does not undo when the journal cannot be written, and changes nothing', async () => {
    const s = await setup()
    const id = await s.draft('Second')
    const auditId = await s.auditIdOf()
    s.setFail('all')

    const response = await s.undo(auditId)

    expect(response.status).toBe(503)
    expect(errorCode(response)).toBe('AUDIT_WRITE_FAILED')
    // The draft was not taken back: the undo would have been untraceable.
    expect(await s.trashed(id)).toBe(false)

    // Once the journal works again, the same entry can still be undone.
    s.setFail('never')
    expect((await s.undo(auditId)).status).toBe(200)
    expect(await s.trashed(id)).toBe(true)
  })

  it('reports an undo whose outcome could not be journalled, and refuses to repeat it', async () => {
    const s = await setup()
    const id = await s.draft('Third')
    const auditId = await s.auditIdOf()
    s.setFail('outcomes')

    const response = await s.undo(auditId)

    // The undo ran, and the answer says so instead of a plain success.
    expect(await s.trashed(id)).toBe(true)
    expect(response.status).toBe(503)
    expect(errorCode(response)).toBe('AUDIT_WRITE_FAILED')
    const body = response.body as { error: { message: string; hint?: string } }
    expect(body.error.message).toContain('was undone')
    expect(body.error.hint).toContain('Do not undo it again')

    // The journal holds only the intent, so this process remembers it was done.
    s.setFail('never')
    const again = await s.undo(auditId)
    expect(again.status).toBe(409)
    expect(errorCode(again)).toBe('RECEIPT_ALREADY_REVERTED')
  })
})
