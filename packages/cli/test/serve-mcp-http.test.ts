import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ApprovalQueue, createFileApprovalQueue } from '@cogenta/agents'
import { createApiKeyStore, createAuditLog, ensureAuthTables } from '@cogenta/auth'
import { createSqliteHandle } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createUser,
  loginWithMfaSetup,
  type RunningServer,
  startServer,
} from './helpers/serve-harness.js'

/**
 * `/api/mcp` against a real `cogenta serve`, a real SQLite database and the
 * real approval queue the Agents screen decides on — what a remote Claude
 * Code or Claude Desktop does, message for message (Streamable HTTP, one
 * JSON reply per POST). Nothing is mocked.
 *
 * The bar is the one the audit set: a deployed site can be driven from
 * another machine with a URL and a key, the key is checked on every request
 * (a revoked one stops the next message, even one waiting for approval),
 * an invalid write is refused before an administrator is asked, a page's
 * blocks are really written, and a call the client abandons cannot be
 * approved afterwards.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-mcp-http-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com', locales: ['fr'], defaultLocale: 'fr' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
  vector: { path: ${JSON.stringify(join(root, 'vectors'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
      body: { kind: 'blocks', options: { allow: '*' } },
    },
    routing: { pattern: '/:slug' },
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

async function mintKey(
  root: string,
  scope: readonly string[],
): Promise<{ key: string; id: string }> {
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  try {
    await ensureAuthTables(db)
    const issued = await createApiKeyStore(db).create({
      name: 'Claude Code',
      scope,
      createdBy: null,
    })
    return { key: issued.key, id: issued.id }
  } finally {
    await db.close()
  }
}

async function revokeKey(root: string, id: string): Promise<void> {
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  try {
    await createApiKeyStore(db).revoke(id)
  } finally {
    await db.close()
  }
}

function approvals(root: string): ApprovalQueue {
  return createFileApprovalQueue({
    directory: join(root, '.cogenta', 'agents-runtime', 'approvals'),
  })
}

async function nextPending(queue: ApprovalQueue) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const request = (await queue.list('pending')).at(0)
    if (request !== undefined) return request
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('No approval request was submitted.')
}

interface RpcReply {
  readonly id?: number | string | null
  readonly result?: Record<string, unknown>
  readonly error?: { readonly code: number; readonly message: string }
}

let nextId = 1
async function rpc(
  base: string,
  key: string | null,
  method: string,
  params?: Record<string, unknown>,
  init: { readonly signal?: AbortSignal; readonly headers?: Record<string, string> } = {},
): Promise<{ status: number; body: RpcReply | null; headers: Headers }> {
  nextId += 1
  const response = await fetch(`${base}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(key === null ? {} : { authorization: `Bearer ${key}` }),
      ...init.headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId, method, ...(params ? { params } : {}) }),
    ...(init.signal === undefined ? {} : { signal: init.signal }),
  })
  const text = await response.text()
  // A tools/call to a client that accepts SSE is answered as an event
  // stream (keep-alives, progress, then the reply): the reply is its last event.
  const json = (response.headers.get('content-type') ?? '').startsWith('text/event-stream')
    ? (text
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .at(-1)
        ?.slice(6) ?? '')
    : text
  return {
    status: response.status,
    body: json === '' ? null : (JSON.parse(json) as RpcReply),
    headers: response.headers,
  }
}

function textOf(reply: RpcReply | null): string {
  const content = (reply?.result?.['content'] ?? []) as readonly { readonly text: string }[]
  return content.at(0)?.text ?? ''
}

const servers: RunningServer[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop()
})

async function serve(root: string, env?: Record<string, string>): Promise<RunningServer> {
  const server = await startServer(root, env === undefined ? {} : { env })
  servers.push(server)
  return server
}

describe('MCP over HTTP (/api/mcp)', () => {
  it('refuses a request without a key, with a session token, or with a revoked key', async () => {
    const root = await project()
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
    const { key, id } = await mintKey(root, ['editor'])
    const { base } = await serve(root)

    const anonymous = await rpc(base, null, 'initialize')
    expect(anonymous.status).toBe(401)
    expect(anonymous.headers.get('www-authenticate')).toMatch(/^Bearer/u)

    const token = await loginWithMfaSetup(base, 'admin@example.com', 'correct horse battery staple')
    const session = await rpc(base, token, 'initialize')
    expect(session.status).toBe(401)
    expect(session.body?.error?.message).toMatch(/API key/u)

    expect((await rpc(base, key, 'ping')).status).toBe(200)
    await revokeKey(root, id)
    const revoked = await rpc(base, key, 'ping')
    expect(revoked.status).toBe(401)
  }, 60_000)

  it('speaks the protocol: initialize, ping, notifications without a reply, unknown tool as -32602', async () => {
    const root = await project()
    const { key } = await mintKey(root, ['editor'])
    const { base } = await serve(root)

    const init = await rpc(base, key, 'initialize', { protocolVersion: '2025-06-18' })
    expect(init.status).toBe(200)
    expect(init.body?.result).toMatchObject({
      protocolVersion: '2025-06-18',
      serverInfo: { name: 'cogenta' },
      capabilities: { tools: {} },
    })
    expect(String(init.body?.result?.['instructions'])).toMatch(/Actions à approuver/u)

    const notification = await fetch(`${base}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })
    expect(notification.status).toBe(202)
    expect(await notification.text()).toBe('')

    expect((await rpc(base, key, 'ping')).body?.result).toEqual({})

    const unknown = await rpc(base, key, 'tools/call', { name: 'content.purge', arguments: {} })
    expect(unknown.body?.error?.code).toBe(-32602)

    const get = await fetch(`${base}/api/mcp`, { headers: { authorization: `Bearer ${key}` } })
    expect(get.status).toBe(405)

    const batch = await fetch(`${base}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', id: 2, method: 'ping' },
      ]),
    })
    expect(batch.status).toBe(400)
  }, 60_000)

  it('offers the discovery tools, filtered by the role of the key', async () => {
    const root = await project()
    const editor = await mintKey(root, ['editor'])
    const viewer = await mintKey(root, ['viewer'])
    const { base } = await serve(root)

    const namesOf = async (key: string) =>
      (
        ((await rpc(base, key, 'tools/list')).body?.result?.['tools'] ?? []) as readonly {
          readonly name: string
          readonly annotations?: Record<string, unknown>
        }[]
      ).map((tool) => tool.name)

    const editorTools = await namesOf(editor.key)
    for (const name of [
      'content.collections',
      'content.schema',
      'content.list',
      'content.search',
    ]) {
      expect(editorTools).toContain(name)
    }
    expect(editorTools).toContain('content.write_draft')
    const viewerTools = await namesOf(viewer.key)
    expect(viewerTools).toContain('content.list')
    expect(viewerTools).not.toContain('content.write_draft')
    expect(viewerTools).not.toContain('media.write')

    const schema = await rpc(base, editor.key, 'tools/call', {
      name: 'content.schema',
      arguments: { collection: 'page' },
    })
    expect(textOf(schema.body)).toContain('"body"')
  }, 60_000)

  it('refuses an invalid write at once, before any approval is asked', async () => {
    const root = await project()
    const { key } = await mintKey(root, ['editor'])
    const { base } = await serve(root)

    const unknownField = await rpc(base, key, 'tools/call', {
      name: 'content.write_draft',
      arguments: { collection: 'page', values: { title: 'x', nonexistent: 1 } },
    })
    expect(unknownField.body?.result).toMatchObject({ isError: true })
    expect(textOf(unknownField.body)).toMatch(/"nonexistent" is not a field/u)

    const unknownBlock = await rpc(base, key, 'tools/call', {
      name: 'content.write_draft',
      arguments: {
        collection: 'page',
        values: { title: 'x', slug: 'x', body: [{ type: 'carousel3d', data: {} }] },
      },
    })
    expect(textOf(unknownBlock.body)).toMatch(/unknown type "carousel3d"/u)
    expect(await approvals(root).list('pending')).toHaveLength(0)
  }, 60_000)

  it('writes a page with its blocks after a human approval, as generated content', async () => {
    const root = await project()
    const { key, id: keyId } = await mintKey(root, ['editor'])
    const { base } = await serve(root)
    const queue = approvals(root)

    const call = rpc(base, key, 'tools/call', {
      name: 'content.write_draft',
      arguments: {
        collection: 'page',
        values: {
          title: 'Built over MCP',
          slug: 'built-over-mcp',
          body: [{ type: 'hero', data: { title: 'Hello', subtitle: 'From a remote client' } }],
        },
      },
    })
    const request = await nextPending(queue)
    expect(request.agentName).toContain('key "Claude Code"')
    await queue.decide(request.id, 'approved', 'human-admin')
    const reply = await call
    expect(reply.body?.result).toMatchObject({ isError: false })
    const entry = JSON.parse(textOf(reply.body)) as {
      id: string
      state: string
      provenance: string
      createdBy: string
      blocks: { body: { type: string; data: Record<string, unknown> }[] }
    }
    expect(entry.state).toBe('working')
    expect(entry.provenance).toBe('generated')
    expect(entry.createdBy).toBe(`apikey:${keyId}`)
    expect(entry.blocks.body.map((block) => block.type)).toEqual(['hero'])
    expect(entry.blocks.body[0]?.data['title']).toBe('Hello')

    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    try {
      const audit = await createAuditLog(db).list({ action: 'agent.tool.content.write_draft' })
      expect(audit[0]?.diff).toMatchObject({ origin: 'mcp', transport: 'http', ok: true })
    } finally {
      await db.close()
    }
  }, 60_000)

  it('does not run a write whose key was revoked while it waited for approval', async () => {
    const root = await project()
    const { key, id } = await mintKey(root, ['editor'])
    const { base } = await serve(root)
    const queue = approvals(root)

    const call = rpc(base, key, 'tools/call', {
      name: 'content.write_draft',
      arguments: { collection: 'page', values: { title: 'Never written', slug: 'never-written' } },
    })
    const request = await nextPending(queue)
    await revokeKey(root, id)
    await queue.decide(request.id, 'approved', 'human-admin')
    const reply = await call
    expect(reply.body?.result).toMatchObject({ isError: true })
    expect(textOf(reply.body)).toMatch(/revoked/u)
  }, 60_000)

  it('withdraws the approval request of a call the client abandoned', async () => {
    const root = await project()
    const { key } = await mintKey(root, ['editor'])
    const { base } = await serve(root)
    const queue = approvals(root)

    const controller = new AbortController()
    const call = rpc(
      base,
      key,
      'tools/call',
      {
        name: 'content.write_draft',
        arguments: { collection: 'page', values: { title: 'Abandoned', slug: 'abandoned' } },
      },
      { signal: controller.signal },
    ).catch((error: unknown) => error)
    const request = await nextPending(queue)
    controller.abort()
    await call
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if ((await queue.list('pending')).length === 0) break
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    expect(await queue.list('pending')).toHaveLength(0)
    await expect(queue.decide(request.id, 'approved', 'human-admin')).rejects.toThrow(
      /already has a decision/u,
    )
  }, 60_000)

  it('refuses a foreign browser origin and an oversized body', async () => {
    const root = await project()
    const { key } = await mintKey(root, ['editor'])
    const { base } = await serve(root)

    const foreign = await rpc(base, key, 'ping', undefined, {
      headers: { origin: 'https://attacker.example' },
    })
    expect(foreign.status).toBe(403)
    const own = await rpc(base, key, 'ping', undefined, {
      headers: { origin: 'https://example.com' },
    })
    expect(own.status).toBe(200)

    const huge = await fetch(`${base}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
        params: { padding: 'x'.repeat(5 * 1024 * 1024) },
      }),
    })
    expect(huge.status).toBe(413)
  }, 60_000)

  it('is not served at all when the configuration turns it off', async () => {
    const root = await project()
    const { key } = await mintKey(root, ['editor'])
    const { base } = await serve(root, { COGENTA_MCP_HTTP: 'false' })
    const response = await rpc(base, key, 'ping')
    expect(response.status).toBe(404)
  }, 60_000)
})
