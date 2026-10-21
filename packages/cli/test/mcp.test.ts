import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import {
  type ApprovalQueue,
  createFileApprovalQueue,
  createMemoryApprovalQueue,
} from '@cogenta/agents'
import { createAuditLog, createUserStore } from '@cogenta/auth'
import { createSqliteHandle } from '@cogenta/core'
import { createSearchIndex } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { runMcp } from '../src/commands/mcp.js'
import { createOutput } from '../src/output.js'
import { createUser } from './helpers/serve-harness.js'

/**
 * Mints a real API key against this project's own database — the exact same
 * `ApiKeyStore` (`@cogenta/auth`) the admin's "MCP"/"Clés API" screens write
 * to and `resolveActor` (`@cogenta/api`) reads from. Returns the raw key,
 * shown only once by the real store, same as it would be to an admin.
 */
async function createApiKey(root: string, scope: readonly string[]): Promise<string> {
  const { createApiKeyStore, ensureAuthTables } = await import('@cogenta/auth')
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await ensureAuthTables(db)
  const apiKeys = createApiKeyStore(db)
  const issued = await apiKeys.create({ name: 'test key', scope, createdBy: null })
  await db.close()
  return issued.key
}

/**
 * `cogenta mcp` against a real project and a real (SQLite) database — a real
 * JSON-RPC conversation over stdin/stdout, exactly the shape an MCP client
 * (Claude Desktop, Claude Code, Cursor) would drive: `initialize`,
 * `tools/list`, `tools/call`.
 *
 * This is the fiche's own acceptance bar: not "the server compiles", but "a
 * real client, talking real JSON-RPC, gets real content back, and a role
 * that may not write is really refused" (R4).
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-mcp-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com', locales: ['fr', 'en'], defaultLocale: 'fr' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      publish: ['editor'],
      delete: ['editor'],
    },
  },
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      body: { kind: 'blocks', options: { allow: ['hero', 'cta'] } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      publish: ['editor'],
      delete: ['editor'],
    },
  },
]
`,
    'utf8',
  )
  return root
}

interface JsonRpcMessage {
  readonly jsonrpc: '2.0'
  readonly id: number
  readonly result?: Record<string, unknown>
  readonly error?: { readonly code: number; readonly message: string }
}

/** The text of a `tools/call` result's first content block — every real reply here has exactly one. */
function textOf(result: Record<string, unknown> | undefined): string {
  const content = (result?.content ?? []) as readonly { readonly text: string }[]
  return content.at(0)?.text ?? ''
}

function toolsOf(result: Record<string, unknown> | undefined): readonly string[] {
  const tools = (result?.tools ?? []) as readonly { readonly name: string }[]
  return tools.map((tool) => tool.name)
}

/** Drives one MCP server instance over a pair of in-memory streams, collecting parsed JSON-RPC replies as they arrive. */
class McpSession {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly done: Promise<number>
  readonly replies: JsonRpcMessage[] = []
  private buffer = ''
  private waiters: (() => void)[] = []
  private nextId = 1000

  constructor(
    root: string,
    actor: { readonly email?: string; readonly role?: string; readonly apiKey?: string },
    approvalQueue?: ApprovalQueue,
  ) {
    this.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8')
      let newline = this.buffer.indexOf('\n')
      while (newline !== -1) {
        const line = this.buffer.slice(0, newline).trim()
        this.buffer = this.buffer.slice(newline + 1)
        if (line.length > 0) this.replies.push(JSON.parse(line) as JsonRpcMessage)
        newline = this.buffer.indexOf('\n')
      }
      for (const waiter of this.waiters.splice(0)) waiter()
    })

    this.done = runMcp({
      out: createOutput(() => undefined, false),
      stderr: () => undefined,
      cwd: root,
      env: { COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret' },
      stdin: this.stdin,
      stdout: this.stdout,
      ...actor,
      ...(approvalQueue === undefined ? {} : { approvalQueue }),
    })
  }

  send(method: string, params?: Record<string, unknown>): number {
    // A counter, never a random number: two requests sent before either is
    // answered once drew the same id on an ARM runner, and the reply to one
    // was read as the reply to the other.
    this.nextId += 1
    const id = this.nextId
    this.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) })}\n`,
    )
    return id
  }

  async waitForReply(id: number, timeoutMs = 5000): Promise<JsonRpcMessage> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const found = this.replies.find((reply) => reply.id === id)
      if (found !== undefined) return found
      if (Date.now() > deadline)
        throw new Error(`No reply for request ${id} within ${timeoutMs}ms.`)
      await new Promise<void>((resolvePromise) => {
        this.waiters.push(resolvePromise)
        setTimeout(resolvePromise, 25)
      })
    }
  }

  close(): void {
    this.stdin.end()
  }
}

async function approveNext(queue: ApprovalQueue): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const request = (await queue.list('pending')).at(0)
    if (request !== undefined) {
      await queue.decide(request.id, 'approved', 'human-reviewer')
      return
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('No approval request was submitted.')
}

const activeSessions: McpSession[] = []

afterEach(() => {
  for (const session of activeSessions.splice(0)) session.close()
})

describe('cogenta mcp', () => {
  /**
   * stdout belongs to the protocol, and to nothing else.
   *
   * `cogenta mcp` printed a human readiness line ("MCP server ready — N
   * tool(s)…") through `out`, which the real CLI builds on stdout — the very
   * stream JSON-RPC speaks on. The first thing any client read was therefore
   * not JSON, and the connection failed before `initialize` was answered.
   *
   * Every other test in this file passes `createOutput(() => undefined)`,
   * discarding that channel entirely, so none of them could ever see it. This
   * one wires `out` to the same stream as the protocol, exactly as
   * `src/index.ts` does.
   */
  it('writes nothing but JSON-RPC on the stream the protocol owns', async () => {
    const root = await project()
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])

    const stdin = new PassThrough()
    const stdout = new PassThrough()
    let raw = ''
    stdout.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8')
    })

    const done = runMcp({
      out: createOutput((text) => {
        stdout.write(text)
      }, false),
      stderr: () => undefined,
      cwd: root,
      env: { COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret' },
      stdin,
      stdout,
      email: 'editor@example.com',
    })

    stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })}\n`)
    for (let attempt = 0; attempt < 200 && !raw.includes('"id":1'); attempt += 1) {
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 25))
    }
    stdin.end()
    await done

    const lines = raw.split('\n').filter((line) => line.trim() !== '')
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(() => JSON.parse(line) as unknown).not.toThrow()
    }
  }, 30_000)

  it('answers initialize and tools/list with the real manifest for an authenticated actor', async () => {
    const root = await project()
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const session = new McpSession(root, { email: 'editor@example.com' })
    activeSessions.push(session)

    const initId = session.send('initialize')
    const init = await session.waitForReply(initId)
    expect(init.result).toMatchObject({ serverInfo: { name: 'cogenta' } })

    const listId = session.send('tools/list')
    const list = await session.waitForReply(listId)
    const names = [...toolsOf(list.result)].sort()
    // Content tools always present; media/site-config only for an authenticated actor.
    expect(names).toEqual(
      [
        'content.collections',
        'content.delete',
        'content.list',
        'content.publish',
        'content.read',
        'content.schema',
        'content.search',
        'content.write_draft',
        'media.list',
        'media.read',
        'media.write',
        'site.config_read',
      ].sort(),
    )

    session.close()
    expect(await session.done).toBe(0)
  }, 30_000)

  it('creates, reads and publishes real content through the tool manifest', async () => {
    const root = await project()
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const approvalQueue = createMemoryApprovalQueue()
    const session = new McpSession(root, { email: 'editor@example.com' }, approvalQueue)
    activeSessions.push(session)

    const createId = session.send('tools/call', {
      name: 'content.write_draft',
      arguments: { collection: 'article', values: { title: 'Hello from MCP' } },
    })
    await approveNext(approvalQueue)
    const created = await session.waitForReply(createId)
    expect(created.result).toMatchObject({ isError: false })
    const createdEntry = JSON.parse(textOf(created.result)) as {
      id: string
      values: { title: string }
    }
    expect(createdEntry.values.title).toBe('Hello from MCP')

    const readId = session.send('tools/call', {
      name: 'content.read',
      arguments: { collection: 'article', id: createdEntry.id },
    })
    const read = await session.waitForReply(readId)
    expect(read.result).toMatchObject({ isError: false })

    const publishId = session.send('tools/call', {
      name: 'content.publish',
      arguments: { collection: 'article', id: createdEntry.id },
    })
    await approveNext(approvalQueue)
    const published = await session.waitForReply(publishId)
    expect(published.result).toMatchObject({ isError: false })
    const publishedEntry = JSON.parse(textOf(published.result)) as { status: string }
    expect(publishedEntry.status).toBe('published')
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    try {
      const user = await createUserStore(db).byEmail('editor@example.com')
      expect(JSON.parse(textOf(created.result))).toMatchObject({
        locale: 'fr',
        createdBy: user?.id,
      })
      const search = await (await createSearchIndex({ db })).search({ text: 'Hello', locale: 'fr' })
      expect(search.hits.map((hit) => hit.id)).toContain(createdEntry.id)
      const audit = await createAuditLog(db).list({ action: 'agent.tool.content.write_draft' })
      expect(audit[0]).toMatchObject({
        actorId: user?.id,
        entryId: createdEntry.id,
        diff: {
          origin: 'mcp',
          ok: true,
          input: { values: { title: 'Hello from MCP' } },
          output: { id: createdEntry.id },
        },
      })
    } finally {
      await db.close()
    }

    session.close()
    expect(await session.done).toBe(0)
  }, 30_000)

  it('waits on shared standalone approval and audits rejection without modifying content', async () => {
    const root = await project()
    const session = new McpSession(root, { role: 'editor' })
    activeSessions.push(session)
    const id = session.send('tools/call', {
      name: 'content.write_draft',
      arguments: { collection: 'article', values: { title: 'Must not be written' } },
    })
    const humanQueue = createFileApprovalQueue({
      directory: join(root, '.cogenta', 'agents-runtime', 'approvals'),
    })
    let request = (await humanQueue.list('pending')).at(0)
    for (let attempt = 0; attempt < 200 && request === undefined; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
      request = (await humanQueue.list('pending')).at(0)
    }
    expect(request).toBeDefined()
    expect(session.replies.some((reply) => reply.id === id)).toBe(false)
    if (request === undefined) throw new Error('No human review request.')
    await humanQueue.decide(request.id, 'rejected', 'human-admin', 'Keep the content unchanged.')
    const reply = await session.waitForReply(id)
    expect(reply.result).toMatchObject({ isError: true })
    expect(textOf(reply.result)).toMatch(/rejected/i)
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    try {
      const audit = await createAuditLog(db).list({ action: 'agent.tool.content.write_draft' })
      expect(audit[0]?.diff).toMatchObject({ origin: 'mcp', ok: false })
      const found = await (await createSearchIndex({ db })).search({
        text: 'Must',
        locale: 'fr',
        status: 'draft',
      })
      expect(found.hits).toHaveLength(0)
    } finally {
      await db.close()
    }
  })

  it('withdraws a pending request when its client disconnects, so a later approval cannot run it', async () => {
    const root = await project()
    const session = new McpSession(root, { role: 'editor' })
    activeSessions.push(session)
    session.send('tools/call', {
      name: 'content.write_draft',
      arguments: { collection: 'article', values: { title: 'Disconnected call' } },
    })
    const humanQueue = createFileApprovalQueue({
      directory: join(root, '.cogenta', 'agents-runtime', 'approvals'),
    })
    let request = (await humanQueue.list('pending')).at(0)
    for (let attempt = 0; attempt < 200 && request === undefined; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
      request = (await humanQueue.list('pending')).at(0)
    }
    expect(request).toBeDefined()
    session.close()
    expect(await session.done).toBe(0)
    if (request === undefined) throw new Error('No human review request.')
    // The abandoned request is closed as rejected: nobody can approve an
    // action whose caller already gave up (and may retry, writing twice).
    expect(await humanQueue.list('pending')).toHaveLength(0)
    await expect(humanQueue.decide(request.id, 'approved', 'human-admin')).rejects.toThrow(
      /already has a decision/u,
    )
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    try {
      const found = await (await createSearchIndex({ db })).search({
        text: 'Disconnected',
        locale: 'fr',
        status: 'draft',
      })
      expect(found.hits).toHaveLength(0)
      expect(
        (await createAuditLog(db).list({ action: 'agent.tool.content.write_draft' })).at(0)?.diff,
      ).toMatchObject({ origin: 'mcp', ok: false })
    } finally {
      await db.close()
    }
  })

  it('keeps non-reversible mutations pending until a human approves, then records the decision outcome', async () => {
    const root = await project()
    const queue = createMemoryApprovalQueue()
    const session = new McpSession(root, { role: 'editor' }, queue)
    activeSessions.push(session)
    const id = session.send('tools/call', {
      name: 'content.write_draft',
      arguments: { collection: 'article', locale: 'en', values: { title: 'Pending human review' } },
    })
    for (let attempt = 0; attempt < 200 && (await queue.list('pending')).length === 0; attempt += 1)
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    const pending = (await queue.list('pending')).at(0)
    expect(pending?.toolName).toBe('content.write_draft')
    expect(session.replies.some((reply) => reply.id === id)).toBe(false)
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    try {
      const search = await (await createSearchIndex({ db })).search({
        text: 'Pending',
        locale: 'en',
        status: 'draft',
      })
      expect(search.hits).toHaveLength(0)
    } finally {
      await db.close()
    }
    await approveNext(queue)
    const reply = await session.waitForReply(id)
    expect(reply.result).toMatchObject({ isError: false })
    expect(JSON.parse(textOf(reply.result))).toMatchObject({ locale: 'en' })
  })

  it('refuses a grant revoked by another transport while the action awaits human approval', async () => {
    const root = await project()
    const queue = createMemoryApprovalQueue()
    const session = new McpSession(root, { role: 'editor' }, queue)
    activeSessions.push(session)
    const id = session.send('tools/call', {
      name: 'content.write_draft',
      arguments: { collection: 'article', values: { title: 'Revoked before approval' } },
    })
    for (let attempt = 0; attempt < 200 && (await queue.list('pending')).length === 0; attempt += 1)
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    expect(await queue.list('pending')).toHaveLength(1)
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    try {
      const { loadSchemaModule } = await import('../src/commands/serve.js')
      const { createRolePermissionStore } = await import('@cogenta/schema')
      const { collections, taxonomies } = await loadSchemaModule(root)
      await createRolePermissionStore({ db, collections, taxonomies }).set({
        targetType: 'collection',
        targetName: 'article',
        action: 'create',
        roles: ['admin'],
        updatedBy: 'human-admin',
      })
      await approveNext(queue)
      const reply = await session.waitForReply(id)
      expect(reply.result).toMatchObject({ isError: true })
      expect(textOf(reply.result)).toMatch(/create/i)
      const search = await (await createSearchIndex({ db })).search({
        text: 'Revoked',
        locale: 'fr',
        status: 'draft',
      })
      expect(search.hits).toHaveLength(0)
    } finally {
      await db.close()
    }
  })

  it('gives a real viewer media reading capabilities and refuses metadata mutations without changing storage', async () => {
    const root = await project()
    await createUser(root, 'viewer@example.com', 'correct horse battery staple', ['viewer'])
    const { createDatabaseMediaStore } = await import('@cogenta/core')
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    const store = createDatabaseMediaStore({ db })
    const asset = await store.create({
      kind: 'image',
      filename: 'fixture.png',
      mimeType: 'image/png',
      size: 1,
      storageKey: 'fixture.png',
      alt: 'Original description',
    })
    const session = new McpSession(root, { email: 'viewer@example.com' })
    activeSessions.push(session)
    const list = await session.waitForReply(session.send('tools/list'))
    expect(toolsOf(list.result)).toContain('media.read')
    expect(toolsOf(list.result)).not.toContain('media.write')
    const reply = await session.waitForReply(
      session.send('tools/call', {
        name: 'media.write',
        arguments: { id: asset.id, alt: 'Attack' },
      }),
    )
    expect(reply.error?.message).toContain('media.write')
    expect((await store.get(asset.id))?.alt).toBe('Original description')
    await db.close()
  })

  it('really enforces R4: a role without create/publish is refused by the same permission layer REST uses', async () => {
    const root = await project()
    const session = new McpSession(root, { role: 'viewer' })
    activeSessions.push(session)

    const createId = session.send('tools/call', {
      name: 'content.write_draft',
      arguments: { collection: 'article', values: { title: 'Should be refused' } },
    })
    const created = await session.waitForReply(createId)
    // A capability outside the effective manifest is a JSON-RPC unknown-tool error.
    expect(created.error?.message).toContain('content.write_draft')

    session.close()
    expect(await session.done).toBe(0)
  }, 30_000)

  it('leaves media, site-config and http tools out of the manifest for the anonymous default actor', async () => {
    const root = await project()
    const session = new McpSession(root, {})
    activeSessions.push(session)

    const listId = session.send('tools/list')
    const list = await session.waitForReply(listId)
    const names = toolsOf(list.result)
    expect(names).toEqual(expect.arrayContaining(['content.read']))
    expect(names).not.toEqual(expect.arrayContaining(['media.read', 'site.config_read']))

    // Content is still real and permission-checked: a public actor may read
    // (the fixture's `article` collection grants `read` to `public`).
    const createId = session.send('tools/call', {
      name: 'content.write_draft',
      arguments: { collection: 'article', values: { title: 'Anonymous write' } },
    })
    const created = await session.waitForReply(createId)
    expect(created.error?.message).toContain('content.write_draft')

    session.close()
    expect(await session.done).toBe(0)
  }, 30_000)

  it('refuses --email for a user that does not exist', async () => {
    const root = await project()
    const session = new McpSession(root, { email: 'ghost@example.com' })
    activeSessions.push(session)

    session.close()
    expect(await session.done).toBe(1)
  }, 30_000)

  it('resolves the actor from a real API key, through the same store REST uses', async () => {
    const root = await project()
    const key = await createApiKey(root, ['editor'])
    const approvalQueue = createMemoryApprovalQueue()
    const session = new McpSession(root, { apiKey: key }, approvalQueue)
    activeSessions.push(session)

    const listId = session.send('tools/list')
    const list = await session.waitForReply(listId)
    // A key is an authenticated actor, same as --email/--role: media and
    // site-config tools join the manifest.
    expect(toolsOf(list.result)).toEqual(
      expect.arrayContaining(['media.read', 'media.write', 'site.config_read']),
    )

    const createId = session.send('tools/call', {
      name: 'content.write_draft',
      arguments: { collection: 'article', values: { title: 'Hello from an API key' } },
    })
    await approveNext(approvalQueue)
    const created = await session.waitForReply(createId)
    expect(created.result).toMatchObject({ isError: false })
    const createdEntry = JSON.parse(textOf(created.result)) as { values: { title: string } }
    expect(createdEntry.values.title).toBe('Hello from an API key')

    session.close()
    expect(await session.done).toBe(0)
  }, 30_000)

  it('really enforces R4 for an API key: a scope without create is refused by the same permission layer REST uses', async () => {
    const root = await project()
    const key = await createApiKey(root, ['viewer'])
    const session = new McpSession(root, { apiKey: key })
    activeSessions.push(session)

    const createId = session.send('tools/call', {
      name: 'content.write_draft',
      arguments: { collection: 'article', values: { title: 'Should be refused' } },
    })
    const created = await session.waitForReply(createId)
    expect(created.error?.message).toContain('content.write_draft')

    session.close()
    expect(await session.done).toBe(0)
  }, 30_000)

  it('refuses a revoked API key', async () => {
    const root = await project()
    const { createApiKeyStore, ensureAuthTables } = await import('@cogenta/auth')
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    await ensureAuthTables(db)
    const apiKeys = createApiKeyStore(db)
    const issued = await apiKeys.create({ name: 'revoked key', scope: ['editor'], createdBy: null })
    await apiKeys.revoke(issued.id)
    await db.close()

    const session = new McpSession(root, { apiKey: issued.key })
    activeSessions.push(session)

    session.close()
    expect(await session.done).toBe(1)
  }, 30_000)

  it('refuses a malformed --api-key value without touching the database', async () => {
    const root = await project()
    const session = new McpSession(root, { apiKey: 'not-a-real-key' })
    activeSessions.push(session)

    session.close()
    expect(await session.done).toBe(1)
  }, 30_000)

  it('refuses --api-key combined with --email', async () => {
    const root = await project()
    const key = await createApiKey(root, ['editor'])
    const session = new McpSession(root, { apiKey: key, email: 'editor@example.com' })
    activeSessions.push(session)

    session.close()
    expect(await session.done).toBe(2)
  }, 30_000)
})

describe('cogenta mcp — protocol, discovery and gates (MCP audit, 2026-10-21)', () => {
  it('answers ping and never answers a notification', async () => {
    const root = await project()
    const session = new McpSession(root, { role: 'editor' })
    activeSessions.push(session)

    session.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
    )
    const ping = await session.waitForReply(session.send('ping'))
    expect(ping.result).toEqual({})
    // The only reply on the stream is the ping's: nothing was sent for the notification.
    expect(session.replies.map((reply) => reply.id)).toEqual([ping.id])
  })

  it('finds content without an id: collections, schema with block types, list and search', async () => {
    const root = await project()
    const queue = createMemoryApprovalQueue()
    const session = new McpSession(root, { role: 'editor' }, queue)
    activeSessions.push(session)

    const created = session.send('tools/call', {
      name: 'content.write_draft',
      arguments: { collection: 'article', values: { title: 'Opening hours' } },
    })
    await approveNext(queue)
    const entry = JSON.parse(textOf((await session.waitForReply(created)).result)) as { id: string }

    const collections = await session.waitForReply(
      session.send('tools/call', { name: 'content.collections', arguments: {} }),
    )
    expect(textOf(collections.result)).toContain('"article"')
    const schema = await session.waitForReply(
      session.send('tools/call', { name: 'content.schema', arguments: { collection: 'page' } }),
    )
    expect(textOf(schema.result)).toContain('"blocks"')
    const list = await session.waitForReply(
      session.send('tools/call', { name: 'content.list', arguments: { collection: 'article' } }),
    )
    expect(textOf(list.result)).toContain(entry.id)
    const search = await session.waitForReply(
      session.send('tools/call', { name: 'content.search', arguments: { query: 'opening' } }),
    )
    expect(textOf(search.result)).toContain(entry.id)
  })

  it('writes page-builder blocks as blocks, validated against contract B, marked as generated', async () => {
    const root = await project()
    const queue = createMemoryApprovalQueue()
    const session = new McpSession(root, { role: 'editor' }, queue)
    activeSessions.push(session)

    const id = session.send('tools/call', {
      name: 'content.write_draft',
      arguments: {
        collection: 'page',
        values: { title: 'Home', body: [{ type: 'hero', data: { title: 'Welcome' } }] },
      },
    })
    await approveNext(queue)
    const reply = await session.waitForReply(id)
    expect(reply.result).toMatchObject({ isError: false })
    const entry = JSON.parse(textOf(reply.result)) as {
      state: string
      provenance: string
      provenanceDetail: { agent: string }
      blocks: { body: { type: string; data: { title: string } }[] }
    }
    expect(entry.state).toBe('working')
    expect(entry.provenance).toBe('generated')
    expect(entry.provenanceDetail.agent).toMatch(/^mcp:/u)
    expect(entry.blocks.body[0]).toMatchObject({ type: 'hero', data: { title: 'Welcome' } })
  })

  it('refuses invalid blocks and unknown fields at once, without asking a human', async () => {
    const root = await project()
    const queue = createMemoryApprovalQueue()
    const session = new McpSession(root, { role: 'editor' }, queue)
    activeSessions.push(session)

    const notAllowed = await session.waitForReply(
      session.send('tools/call', {
        name: 'content.write_draft',
        arguments: {
          collection: 'page',
          values: { title: 'x', body: [{ type: 'faq', data: { items: [] } }] },
        },
      }),
    )
    expect(textOf(notAllowed.result)).toMatch(/does not accept "faq"/u)
    const invalidHero = await session.waitForReply(
      session.send('tools/call', {
        name: 'content.write_draft',
        arguments: {
          collection: 'page',
          values: { title: 'x', body: [{ type: 'hero', data: {} }] },
        },
      }),
    )
    expect(invalidHero.result).toMatchObject({ isError: true })
    expect(textOf(invalidHero.result)).toMatch(/hero/u)
    const unknownField = await session.waitForReply(
      session.send('tools/call', {
        name: 'content.write_draft',
        arguments: { collection: 'article', values: { title: 'x', nonexistent: 1 } },
      }),
    )
    expect(textOf(unknownField.result)).toMatch(/"nonexistent" is not a field/u)
    expect(await queue.list('pending')).toHaveLength(0)
  })

  it('stops an open session at its next message once its key is revoked', async () => {
    const root = await project()
    const key = await createApiKey(root, ['editor'])
    const session = new McpSession(root, { apiKey: key })
    activeSessions.push(session)
    expect((await session.waitForReply(session.send('tools/list'))).result).toBeDefined()

    const { createApiKeyStore } = await import('@cogenta/auth')
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    try {
      const store = createApiKeyStore(db)
      const [only] = await store.list()
      if (only === undefined) throw new Error('No key.')
      await store.revoke(only.id)
    } finally {
      await db.close()
    }
    const after = await session.waitForReply(session.send('tools/list'))
    expect(after.error?.message).toMatch(/revoked/u)
  })

  it('reads the key from COGENTA_MCP_API_KEY when no option names an identity', async () => {
    const root = await project()
    const key = await createApiKey(root, ['editor'])
    let err = ''
    const stdin = new PassThrough()
    const done = runMcp({
      out: createOutput(() => undefined, false),
      stderr: (text) => {
        err += text
      },
      cwd: root,
      env: {
        COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret',
        COGENTA_MCP_API_KEY: key,
      },
      stdin,
      stdout: new PassThrough(),
    })
    for (let attempt = 0; attempt < 200 && !err.includes('ready'); attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    stdin.end()
    expect(await done).toBe(0)
    expect(err).toMatch(/acting as key "test key" \[editor\]/u)
  })

  it('says plainly where to run it when started outside a site folder', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'cogenta-mcp-nowhere-'))
    let err = ''
    const code = await runMcp({
      out: createOutput(() => undefined, false),
      stderr: (text) => {
        err += text
      },
      cwd: empty,
      env: {},
      stdin: new PassThrough(),
      stdout: new PassThrough(),
    })
    expect(code).toBe(1)
    expect(err).toMatch(/CONFIG_NOT_FOUND/u)
    expect(err).toMatch(/--cwd/u)
  })

  it('queues at most five writes from one caller for approval', async () => {
    const root = await project()
    const queue = createMemoryApprovalQueue()
    const session = new McpSession(root, { role: 'editor' }, queue)
    activeSessions.push(session)

    for (let index = 0; index < 5; index += 1) {
      session.send('tools/call', {
        name: 'content.write_draft',
        arguments: { collection: 'article', values: { title: `Waiting ${index}` } },
      })
    }
    for (let attempt = 0; attempt < 200 && (await queue.list('pending')).length < 5; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    const sixth = await session.waitForReply(
      session.send('tools/call', {
        name: 'content.write_draft',
        arguments: { collection: 'article', values: { title: 'One too many' } },
      }),
    )
    expect(sixth.result).toMatchObject({ isError: true })
    expect(textOf(sixth.result)).toMatch(/already waiting/u)
    expect(await queue.list('pending')).toHaveLength(5)
  })
})
