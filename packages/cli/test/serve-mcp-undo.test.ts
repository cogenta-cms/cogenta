import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApiKeyStore, ensureAuthTables } from '@cogenta/auth'
import { createSqliteHandle } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createUser,
  loginWithMfaSetup,
  type RunningServer,
  startServer,
} from './helpers/serve-harness.js'

/**
 * An administrator takes back what an autonomous MCP key did, through
 * `POST /api/mcp/actions/{auditId}/revert`, on a real `cogenta serve` with a
 * real SQLite database (L42, R6).
 */

const PASSWORD = 'correct horse battery staple'

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-mcp-undo-'))
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
      summary: { kind: 'text', options: { max: 200000 } },
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
`,
    'utf8',
  )
  return root
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

async function mintKey(root: string, scope: readonly string[]): Promise<string> {
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  try {
    await ensureAuthTables(db)
    const issued = await createApiKeyStore(db).create({
      name: 'Autonomous publisher',
      scope,
      createdBy: null,
      autonomy: 'autonomous',
    })
    return issued.key
  } finally {
    await db.close()
  }
}

/** A tool call that must complete at once (an autonomous key waits for nobody). */
async function tool(
  base: string,
  key: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const reply = await rpc(base, key, 'tools/call', { name, arguments: args })
  expect(reply.result, `${name}: ${textOf(reply)}`).toMatchObject({ isError: false })
  return JSON.parse(textOf(reply)) as Record<string, unknown>
}

interface AuditRow {
  readonly id: string
  readonly action: string
  readonly actorId: string | null
  readonly diff: Record<string, unknown> | null
}

async function auditRows(base: string, token: string, action: string): Promise<AuditRow[]> {
  const response = await fetch(`${base}/api/audit?action=${encodeURIComponent(action)}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(response.status).toBe(200)
  return ((await response.json()) as { data: AuditRow[] }).data
}

async function firstRow(base: string, token: string, action: string): Promise<AuditRow> {
  const row = (await auditRows(base, token, action))[0]
  if (row === undefined) throw new Error(`no audit entry for ${action}`)
  return row
}

function revertCall(base: string, bearer: string | null, auditId: string): Promise<Response> {
  return fetch(`${base}/api/mcp/actions/${auditId}/revert`, {
    method: 'POST',
    ...(bearer === null ? {} : { headers: { authorization: `Bearer ${bearer}` } }),
  })
}

async function stateOf(base: string, token: string, auditId: string): Promise<unknown> {
  const response = await fetch(`${base}/api/mcp/actions/${auditId}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  return ((await response.json()) as { data: unknown }).data
}

const servers: RunningServer[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop()
})

interface Site {
  readonly root: string
  readonly base: string
  /** An autonomous API key scoped to `editor`. */
  readonly key: string
  /** The session token of an administrator. */
  readonly admin: string
}

async function site(): Promise<Site> {
  const root = await project()
  await createUser(root, 'admin@example.com', PASSWORD, ['admin', 'editor'])
  const key = await mintKey(root, ['editor'])
  const server = await startServer(root)
  servers.push(server)
  const admin = await loginWithMfaSetup(server.base, 'admin@example.com', PASSWORD)
  return { root, base: server.base, key, admin }
}

const page = (base: string, slug: string) => fetch(`${base}/blog/${slug}`)

describe('undoing what an autonomous MCP key did', () => {
  it('takes a publication back, then the draft, and a second undo of the same call is refused', async () => {
    const s = await site()
    const draft = await tool(s.base, s.key, 'content.write_draft', {
      collection: 'post',
      values: { title: 'Agents ship', slug: 'agents-ship' },
    })
    await tool(s.base, s.key, 'content.publish', { collection: 'post', id: draft['id'] })
    expect((await page(s.base, 'agents-ship')).status).toBe(200)

    const publishRow = await firstRow(s.base, s.admin, 'agent.tool.content.publish')
    const draftRow = await firstRow(s.base, s.admin, 'agent.tool.content.write_draft')
    // What an undo needs is kept in the record: the tool and its receipt.
    expect(publishRow.diff).toMatchObject({ origin: 'mcp', tool: 'content.publish', ok: true })
    expect(publishRow.diff?.['output']).toMatchObject({ undo: { kind: 'unpublish' } })
    expect(await stateOf(s.base, s.admin, publishRow.id)).toMatchObject({
      tool: 'content.publish',
      state: 'available',
    })

    const first = await revertCall(s.base, s.admin, publishRow.id)
    expect(first.status, await first.clone().text()).toBe(200)
    expect((await page(s.base, 'agents-ship')).status).toBe(404)

    const second = await revertCall(s.base, s.admin, draftRow.id)
    expect(second.status, await second.clone().text()).toBe(200)
    const trashed = await fetch(`${s.base}/api/content/post?state=working&trashed=only`, {
      headers: { authorization: `Bearer ${s.admin}` },
    })
    const trashedBody = (await trashed.json()) as { data: { id: string }[] }
    expect(trashedBody.data.map((entry) => entry.id)).toContain(draft['id'])
    expect((await page(s.base, 'agents-ship')).status).toBe(404)

    // The undo is its own entry, linked to the call and written by the person.
    const undone = await auditRows(s.base, s.admin, 'agent.tool.content.publish.revert')
    expect(undone).toHaveLength(1)
    expect(undone[0]?.diff).toMatchObject({ revertOf: publishRow.id, ok: true })
    expect(undone[0]?.actorId).not.toMatch(/^apikey:/u)

    // The same entry cannot be undone twice, and says it was.
    const again = await revertCall(s.base, s.admin, publishRow.id)
    expect(again.status).toBe(409)
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe(
      'RECEIPT_ALREADY_REVERTED',
    )
    expect(await stateOf(s.base, s.admin, publishRow.id)).toMatchObject({ state: 'reverted' })
    expect(await auditRows(s.base, s.admin, 'agent.tool.content.publish.revert')).toHaveLength(1)
  }, 120_000)

  it('refuses an API key, whatever its scope, so an agent cannot undo through itself', async () => {
    const s = await site()
    const adminKey = await mintKey(s.root, ['admin'])
    const draft = await tool(s.base, s.key, 'content.write_draft', {
      collection: 'post',
      values: { title: 'Keep me', slug: 'keep-me' },
    })
    const row = await firstRow(s.base, s.admin, 'agent.tool.content.write_draft')

    for (const bearer of [s.key, adminKey, null]) {
      const response = await revertCall(s.base, bearer, row.id)
      expect([401, 403], `bearer ${bearer === null ? 'none' : bearer.slice(0, 12)}`).toContain(
        response.status,
      )
    }

    // Nothing was undone: the draft is still there and no undo was journalled.
    const entry = await fetch(`${s.base}/api/content/post/${String(draft['id'])}?state=working`, {
      headers: { authorization: `Bearer ${s.admin}` },
    })
    expect(entry.status).toBe(200)
    expect(await auditRows(s.base, s.admin, 'agent.tool.content.write_draft.revert')).toHaveLength(
      0,
    )
  }, 120_000)

  it('refuses an editor session: only an administrator may undo', async () => {
    const s = await site()
    await createUser(s.root, 'editor@example.com', PASSWORD, ['editor'])
    await tool(s.base, s.key, 'content.write_draft', {
      collection: 'post',
      values: { title: 'Draft', slug: 'draft' },
    })
    const row = await firstRow(s.base, s.admin, 'agent.tool.content.write_draft')
    const editor = await loginWithMfaSetup(s.base, 'editor@example.com', PASSWORD)
    expect((await revertCall(s.base, editor, row.id)).status).toBe(403)
  }, 120_000)

  it('returns the tool refusal with its hint when the entry was edited since, and keeps the edit', async () => {
    const s = await site()
    const draft = await tool(s.base, s.key, 'content.write_draft', {
      collection: 'post',
      values: { title: 'Agent text', slug: 'agent-text' },
    })
    const edited = await fetch(`${s.base}/api/content/post/${String(draft['id'])}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${s.admin}` },
      body: JSON.stringify({ values: { title: 'Edited by a person' } }),
    })
    expect(edited.status).toBe(200)

    const row = await firstRow(s.base, s.admin, 'agent.tool.content.write_draft')
    const response = await revertCall(s.base, s.admin, row.id)
    expect(response.status).toBe(409)
    const body = (await response.json()) as {
      error: { code: string; message: string; hint?: string }
    }
    expect(body.error.code).toBe('TOOL_REVERT_REFUSED')
    expect(body.error.hint).toBeTruthy()

    // The refusal is journalled, does not count as an undo, and the edit is intact.
    const attempts = await auditRows(s.base, s.admin, 'agent.tool.content.write_draft.revert')
    expect(attempts).toHaveLength(1)
    expect(attempts[0]?.diff).toMatchObject({ ok: false, revertOf: row.id })
    expect(await stateOf(s.base, s.admin, row.id)).toMatchObject({ state: 'available' })
    const entry = await fetch(`${s.base}/api/content/post/${String(draft['id'])}?state=working`, {
      headers: { authorization: `Bearer ${s.admin}` },
    })
    expect(JSON.stringify(await entry.json())).toContain('Edited by a person')
  }, 120_000)

  it('keeps the receipt of a very long article, so it can still be undone', async () => {
    const s = await site()
    // Input and output each weigh far more than the audit log's 64 KiB bound.
    const draft = await tool(s.base, s.key, 'content.write_draft', {
      collection: 'post',
      values: { title: 'Long read', slug: 'long-read', summary: 'word '.repeat(30_000) },
    })
    const row = await firstRow(s.base, s.admin, 'agent.tool.content.write_draft')
    expect(row.diff).toMatchObject({ origin: 'mcp', tool: 'content.write_draft', ok: true })
    expect(row.diff?.['receiptCompacted']).toBe(true)

    const response = await revertCall(s.base, s.admin, row.id)
    expect(response.status, await response.clone().text()).toBe(200)
    const trashed = await fetch(`${s.base}/api/content/post?state=working&trashed=only`, {
      headers: { authorization: `Bearer ${s.admin}` },
    })
    expect(((await trashed.json()) as { data: { id: string }[] }).data.map((e) => e.id)).toContain(
      draft['id'],
    )
  }, 120_000)

  it('refuses an entry that is not an MCP call, and an unknown one', async () => {
    const s = await site()
    const login = await firstRow(s.base, s.admin, 'auth.login')
    const notMcp = await revertCall(s.base, s.admin, login.id)
    expect(notMcp.status).toBe(404)
    expect(((await notMcp.json()) as { error: { code: string } }).error.code).toBe(
      'RECEIPT_UNKNOWN',
    )
    expect((await revertCall(s.base, s.admin, 'no-such-entry')).status).toBe(404)
  }, 120_000)
})
