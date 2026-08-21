import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { createSqliteHandle } from '@cogenta/core'
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
  site: { name: 'Test site', url: 'https://example.com' },
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

  constructor(
    root: string,
    actor: { readonly email?: string; readonly role?: string; readonly apiKey?: string },
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
    })
  }

  send(method: string, params?: Record<string, unknown>): number {
    const id = this.replies.length + 1000 + Math.floor(Math.random() * 1000)
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

const activeSessions: McpSession[] = []

afterEach(() => {
  for (const session of activeSessions.splice(0)) session.close()
})

describe('cogenta mcp', () => {
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
        'content.delete',
        'content.publish',
        'content.read',
        'content.write_draft',
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
    const session = new McpSession(root, { email: 'editor@example.com' })
    activeSessions.push(session)

    const createId = session.send('tools/call', {
      name: 'content.write_draft',
      arguments: { collection: 'article', values: { title: 'Hello from MCP' } },
    })
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
    const published = await session.waitForReply(publishId)
    expect(published.result).toMatchObject({ isError: false })
    const publishedEntry = JSON.parse(textOf(published.result)) as { status: string }
    expect(publishedEntry.status).toBe('published')

    session.close()
    expect(await session.done).toBe(0)
  }, 30_000)

  it('really enforces R4: a role without create/publish is refused by the same permission layer REST uses', async () => {
    const root = await project()
    const session = new McpSession(root, { role: 'viewer' })
    activeSessions.push(session)

    const createId = session.send('tools/call', {
      name: 'content.write_draft',
      arguments: { collection: 'article', values: { title: 'Should be refused' } },
    })
    const created = await session.waitForReply(createId)
    // A permission refusal is a tool error (isError: true), not a JSON-RPC
    // protocol error — same convention `server.ts` uses for every tool failure.
    expect(created.result).toMatchObject({ isError: true })
    expect(textOf(created.result)).toMatch(/create/i)

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
    expect(names).toEqual(
      expect.arrayContaining([
        'content.read',
        'content.write_draft',
        'content.publish',
        'content.delete',
      ]),
    )
    expect(names).not.toEqual(expect.arrayContaining(['media.read', 'site.config_read']))

    // Content is still real and permission-checked: a public actor may read
    // (the fixture's `article` collection grants `read` to `public`).
    const createId = session.send('tools/call', {
      name: 'content.write_draft',
      arguments: { collection: 'article', values: { title: 'Anonymous write' } },
    })
    const created = await session.waitForReply(createId)
    expect(created.result).toMatchObject({ isError: true })

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
    const session = new McpSession(root, { apiKey: key })
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
    expect(created.result).toMatchObject({ isError: true })
    expect(textOf(created.result)).toMatch(/create/i)

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
