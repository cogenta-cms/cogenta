import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ApprovalQueue, createFileApprovalQueue } from '@cogenta/agents'
import {
  type ApiKeyAutonomy,
  createApiKeyStore,
  createAuditLog,
  ensureAuthTables,
} from '@cogenta/auth'
import { createSqliteHandle } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createUser,
  loginWithMfaSetup,
  type RunningServer,
  startServer,
} from './helpers/serve-harness.js'

/**
 * What a key's autonomy changes over `/api/mcp`, on a real `cogenta serve`
 * with real SQLite and the real approval queue (L42).
 *
 * - `manual` (the default): every write waits in "Actions à approuver".
 * - `autonomous`: a write that can be undone runs at once, nothing is queued,
 *   and the audit record says so; a write that cannot be undone still waits.
 *
 * The undo itself is exercised on a real stack in `mcp-revert.test.ts`: no
 * route of the site calls `revert` yet, so a test over HTTP cannot.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-mcp-autonomy-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'News', url: 'https://example.com', locales: ['en', 'fr'], defaultLocale: 'en' },
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
    name: 'post',
    labels: { singular: 'Post', plural: 'Posts' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
      tags: { kind: 'taxonomy', options: { of: 'tag', many: true } },
    },
    routing: { pattern: '/blog/:slug' },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      publish: ['editor'],
      delete: ['editor'],
    },
  },
]
export const taxonomies = [
  {
    name: 'tag',
    labels: { singular: { en: 'Tag' }, plural: { en: 'Tags' } },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  },
]
`,
    'utf8',
  )
  return root
}

async function mintKey(
  root: string,
  autonomy?: ApiKeyAutonomy,
): Promise<{ readonly key: string; readonly id: string }> {
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  try {
    await ensureAuthTables(db)
    const issued = await createApiKeyStore(db).create({
      name: autonomy === 'autonomous' ? 'Autonomous publisher' : 'Careful publisher',
      scope: ['editor'],
      createdBy: null,
      ...(autonomy === undefined ? {} : { autonomy }),
    })
    return { key: issued.key, id: issued.id }
  } finally {
    await db.close()
  }
}

function approvals(root: string): ApprovalQueue {
  return createFileApprovalQueue({
    directory: join(root, '.cogenta', 'agents-runtime', 'approvals'),
  })
}

interface RpcReply {
  readonly result?: Record<string, unknown>
  readonly error?: { readonly code: number; readonly message: string }
}

let nextId = 1
async function rpc(
  base: string,
  key: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<RpcReply> {
  nextId += 1
  const response = await fetch(`${base}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId, method, ...(params ? { params } : {}) }),
  })
  const text = await response.text()
  const json = (response.headers.get('content-type') ?? '').startsWith('text/event-stream')
    ? (text
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .at(-1)
        ?.slice(6) ?? '')
    : text
  return JSON.parse(json) as RpcReply
}

function textOf(reply: RpcReply): string {
  const content = (reply.result?.['content'] ?? []) as readonly { readonly text: string }[]
  return content.at(0)?.text ?? ''
}

/** A call that must complete with nothing ever queued for a person. */
async function runsAtOnce(
  base: string,
  key: string,
  queue: ApprovalQueue,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const reply = await rpc(base, key, 'tools/call', { name, arguments: args })
  expect(reply.result, `${name}: ${textOf(reply)}`).toMatchObject({ isError: false })
  expect(await queue.list(), `${name} must not queue anything`).toHaveLength(0)
  return JSON.parse(textOf(reply)) as Record<string, unknown>
}

/** A call that must wait: its request shows up pending, and only an approval lets it finish. */
async function waitsForApproval(
  base: string,
  key: string,
  queue: ApprovalQueue,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let settled = false
  const call = rpc(base, key, 'tools/call', { name, arguments: args }).finally(() => {
    settled = true
  })
  let pending = (await queue.list('pending')).at(0)
  for (let attempt = 0; pending === undefined && attempt < 400; attempt += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
    pending = (await queue.list('pending')).at(0)
  }
  expect(pending, `${name} should have waited for an approval`).toBeDefined()
  expect(pending?.toolName).toBe(name)
  expect(settled, `${name} must not finish before it is approved`).toBe(false)
  await queue.decide(String(pending?.id), 'approved', 'human-admin')
  const reply = await call
  expect(reply.result).toMatchObject({ isError: false })
  return JSON.parse(textOf(reply)) as Record<string, unknown>
}

async function auditOf(root: string, tool: string) {
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  try {
    return await createAuditLog(db).list({ action: `agent.tool.${tool}` })
  } finally {
    await db.close()
  }
}

const servers: RunningServer[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop()
})

async function serve(root: string): Promise<string> {
  const server = await startServer(root)
  servers.push(server)
  return server.base
}

describe('an autonomous key over MCP', () => {
  it('publishes a bilingual article with no approval at all, and the audit says it ran autonomously', async () => {
    const root = await project()
    const { key } = await mintKey(root, 'autonomous')
    const base = await serve(root)
    const queue = approvals(root)

    const init = await rpc(base, key, 'initialize', { protocolVersion: '2025-06-18' })
    expect(String(init.result?.['instructions'])).toContain('This key is autonomous')

    const listed = await rpc(base, key, 'tools/list')
    const tools = (listed.result?.['tools'] ?? []) as readonly {
      name: string
      description: string
    }[]
    const described = (name: string) => tools.find((tool) => tool.name === name)?.description ?? ''
    for (const name of [
      'content.write_draft',
      'content.write_translation',
      'content.publish',
      'taxonomy.create_term',
      // Wired by `serve`: without `removeImage` the import could not be undone and would wait.
      'media.import_url',
    ]) {
      expect(described(name), name).toContain('Runs at once')
    }
    for (const name of ['content.delete', 'media.write']) {
      expect(described(name), name).toContain('cannot be undone')
    }

    const tag = await runsAtOnce(base, key, queue, 'taxonomy.create_term', {
      taxonomy: 'tag',
      slug: 'ai-agents',
      labels: { en: 'AI agents', fr: 'Agents IA' },
    })
    const english = await runsAtOnce(base, key, queue, 'content.write_draft', {
      collection: 'post',
      locale: 'en',
      values: { title: 'Agents ship', slug: 'agents-ship', tags: [tag['id']] },
    })
    const french = await runsAtOnce(base, key, queue, 'content.write_translation', {
      collection: 'post',
      sourceId: english['id'],
      locale: 'fr',
      values: { title: 'Les agents livrent', slug: 'agents-livrent', tags: [tag['id']] },
    })
    await runsAtOnce(base, key, queue, 'content.publish', { collection: 'post', id: english['id'] })
    await runsAtOnce(base, key, queue, 'content.publish', { collection: 'post', id: french['id'] })

    // The refusal path of the image import is as immediate as for any caller.
    const refused = await rpc(base, key, 'tools/call', {
      name: 'media.import_url',
      arguments: { url: 'https://127.0.0.1/cover.png', alt: 'A cover' },
    })
    expect(refused.result).toMatchObject({ isError: true })
    expect(textOf(refused)).toContain('private network')
    expect(await queue.list()).toHaveLength(0)

    // Both entries are really public.
    const page = await fetch(`${base}/blog/agents-ship`)
    expect(page.status).toBe(200)

    for (const tool of [
      'taxonomy.create_term',
      'content.write_draft',
      'content.write_translation',
      'content.publish',
    ]) {
      const records = await auditOf(root, tool)
      expect(records.length, tool).toBeGreaterThan(0)
      expect(records[0]?.diff, tool).toMatchObject({
        origin: 'mcp',
        autonomy: 'autonomous',
        autonomyMode: 'autonomous',
        ok: true,
      })
    }
  }, 120_000)

  it('still waits for a human for a write that cannot be undone', async () => {
    const root = await project()
    const { key } = await mintKey(root, 'autonomous')
    const base = await serve(root)
    const queue = approvals(root)

    const draft = await runsAtOnce(base, key, queue, 'content.write_draft', {
      collection: 'post',
      values: { title: 'Doomed', slug: 'doomed' },
    })

    // Deleting is not reversible from the tool: the autonomy does not waive the approval.
    const deleted = await waitsForApproval(base, key, queue, 'content.delete', {
      collection: 'post',
      id: draft['id'],
    })
    expect(deleted).toEqual({ ok: true })

    const records = await auditOf(root, 'content.delete')
    expect(records[0]?.diff).toMatchObject({
      autonomy: 'execute_with_approval',
      autonomyMode: 'autonomous',
    })
  }, 120_000)

  it('is read again on every call: a key switched back to manual waits at its next write', async () => {
    const root = await project()
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
    const { key, id } = await mintKey(root, 'autonomous')
    const base = await serve(root)
    const queue = approvals(root)

    await runsAtOnce(base, key, queue, 'content.write_draft', {
      collection: 'post',
      values: { title: 'Before', slug: 'before' },
    })

    const token = await loginWithMfaSetup(base, 'admin@example.com', 'correct horse battery staple')
    const patched = await fetch(`${base}/api/api-keys/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ autonomy: 'manual' }),
    })
    expect(patched.status).toBe(200)

    await waitsForApproval(base, key, queue, 'content.write_draft', {
      collection: 'post',
      values: { title: 'After', slug: 'after' },
    })
    const records = await auditOf(root, 'content.write_draft')
    expect(records.map((record) => record.diff?.['autonomyMode']).sort()).toEqual([
      'autonomous',
      'manual',
    ])
  }, 120_000)
})

describe('a manual key over MCP', () => {
  it('waits for approval at every write, and says so in its instructions and tool descriptions', async () => {
    const root = await project()
    const { key } = await mintKey(root)
    const base = await serve(root)
    const queue = approvals(root)

    const init = await rpc(base, key, 'initialize', { protocolVersion: '2025-06-18' })
    expect(String(init.result?.['instructions'])).toContain('Every write waits')
    expect(String(init.result?.['instructions'])).not.toContain('This key is autonomous')

    const listed = await rpc(base, key, 'tools/list')
    const tools = (listed.result?.['tools'] ?? []) as readonly {
      name: string
      description: string
    }[]
    for (const name of ['content.write_draft', 'content.publish', 'taxonomy.create_term']) {
      const description = tools.find((tool) => tool.name === name)?.description ?? ''
      expect(description, name).toContain('Requires a human approval')
      expect(description, name).not.toContain('Runs at once')
    }

    const tag = await waitsForApproval(base, key, queue, 'taxonomy.create_term', {
      taxonomy: 'tag',
      slug: 'careful',
      labels: { en: 'Careful' },
    })
    const draft = await waitsForApproval(base, key, queue, 'content.write_draft', {
      collection: 'post',
      values: { title: 'Wait for me', slug: 'wait-for-me', tags: [tag['id']] },
    })
    await waitsForApproval(base, key, queue, 'content.publish', {
      collection: 'post',
      id: draft['id'],
    })

    const records = await auditOf(root, 'content.write_draft')
    expect(records[0]?.diff).toMatchObject({
      autonomy: 'execute_with_approval',
      autonomyMode: 'manual',
    })
  }, 120_000)
})
