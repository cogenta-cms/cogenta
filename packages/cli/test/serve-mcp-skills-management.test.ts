import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ApprovalQueue, createFileApprovalQueue } from '@cogenta/agents'
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
 * L42, over a real `cogenta serve` on a real SQLite database and the real MCP
 * HTTP route: the site's skills (written through the admin's own REST route)
 * read back by `skills.list` / `skills.read` and as MCP prompts, and the
 * site-management tools — comments, redirects, audience figures, the 404 log —
 * each offered to the roles its REST route lets use it, and no others.
 */

const PASSWORD = 'correct horse battery staple'

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-mcp-skills-mgmt-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'News', url: 'https://example.com' },
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
    routing: { pattern: '/:slug' },
    versioning: { drafts: true, history: true },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      publish: ['editor'],
      delete: ['admin'],
    },
  },
]
`,
    'utf8',
  )
  return root
}

async function mintKey(root: string, scope: readonly string[]): Promise<string> {
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  try {
    await ensureAuthTables(db)
    return (await createApiKeyStore(db).create({ name: scope.join('+'), scope, createdBy: null }))
      .key
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

async function toolNames(base: string, key: string): Promise<readonly string[]> {
  const listed = await rpc(base, key, 'tools/list')
  return ((listed.result?.['tools'] ?? []) as readonly { name: string }[]).map((tool) => tool.name)
}

async function callJson(
  base: string,
  key: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const reply = await rpc(base, key, 'tools/call', { name, arguments: args })
  expect(reply.result, textOf(reply)).toMatchObject({ isError: false })
  return JSON.parse(textOf(reply)) as Record<string, unknown>
}

/**
 * A write that may wait for a person: approve whatever shows up in the queue
 * until the call answers. A reversible write is held for approval or not
 * depending on the key's autonomy (L42 §1); this suite is about what the tool
 * does once it runs, so it accepts both and says which happened.
 */
async function callApprovingIfAsked(
  base: string,
  key: string,
  queue: ApprovalQueue,
  name: string,
  args: Record<string, unknown>,
): Promise<{ readonly reply: RpcReply; readonly approvedByHuman: boolean }> {
  let settled = false
  const call = rpc(base, key, 'tools/call', { name, arguments: args }).finally(() => {
    settled = true
  })
  let approvedByHuman = false
  for (let attempt = 0; attempt < 400 && !settled; attempt += 1) {
    const request = (await queue.list('pending')).at(0)
    if (request !== undefined) {
      await queue.decide(request.id, 'approved', 'human-admin')
      approvedByHuman = true
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  return { reply: await call, approvedByHuman }
}

/** A call refused before any approval is asked: an error result, and nothing pending. */
async function refusedAtOnce(
  base: string,
  key: string,
  queue: ApprovalQueue,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const reply = await rpc(base, key, 'tools/call', { name, arguments: args })
  expect(reply.result).toMatchObject({ isError: true })
  expect(await queue.list('pending')).toHaveLength(0)
  return textOf(reply)
}

function bearer(token: string): Record<string, string> {
  return { 'content-type': 'application/json', authorization: `Bearer ${token}` }
}

const servers: RunningServer[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop()
})

async function boot(): Promise<{
  readonly root: string
  readonly base: string
  readonly adminToken: string
  readonly adminKey: string
  readonly editorKey: string
  readonly viewerKey: string
  readonly queue: ApprovalQueue
}> {
  const root = await project()
  await createUser(root, 'admin@example.com', PASSWORD, ['admin'])
  const adminKey = await mintKey(root, ['admin'])
  const editorKey = await mintKey(root, ['editor'])
  const viewerKey = await mintKey(root, ['viewer'])
  const server = await startServer(root)
  servers.push(server)
  const adminToken = await loginWithMfaSetup(server.base, 'admin@example.com', PASSWORD)
  return {
    root,
    base: server.base,
    adminToken,
    adminKey,
    editorKey,
    viewerKey,
    queue: approvals(root),
  }
}

describe('the site skills over MCP', () => {
  it('serves a skill written in the admin as tools and as a prompt, and follows its edits', async () => {
    const { base, adminToken, editorKey, viewerKey } = await boot()
    const created = await fetch(`${base}/api/agent-skills`, {
      method: 'POST',
      headers: bearer(adminToken),
      body: JSON.stringify({
        content:
          '---\nname: House tone\ndescription: How we write headlines.\n---\n\nWrite short, active headlines.\nNever promise a date.\n',
      }),
    })
    expect(created.status).toBe(201)
    const skill = ((await created.json()) as { data: { id: string } }).data
    expect(skill.id).toBe('house-tone')

    for (const key of [editorKey, viewerKey]) {
      expect(await toolNames(base, key)).toEqual(
        expect.arrayContaining(['skills.list', 'skills.read']),
      )
    }

    const listed = (await callJson(base, editorKey, 'skills.list')) as {
      skills: { id: string; name: string; description: string }[]
    }
    expect(listed.skills).toContainEqual({
      id: 'house-tone',
      name: 'House tone',
      description: 'How we write headlines.',
    })

    const read = await callJson(base, viewerKey, 'skills.read', { id: 'house-tone' })
    expect(read['name']).toBe('House tone')
    expect(read['content']).toContain('Never promise a date.')
    expect(String(read['content']).startsWith('---\n')).toBe(true)

    const unknown = await rpc(base, editorKey, 'tools/call', {
      name: 'skills.read',
      arguments: { id: '../../etc/passwd' },
    })
    expect(unknown.result).toMatchObject({ isError: true })

    // The prompts are the same skills.
    const initialised = await rpc(base, editorKey, 'initialize', { protocolVersion: '2025-06-18' })
    expect(initialised.result?.['capabilities']).toMatchObject({ prompts: { listChanged: false } })
    const prompts = await rpc(base, editorKey, 'prompts/list')
    expect(prompts.result?.['prompts']).toContainEqual({
      name: 'house-tone',
      title: 'House tone',
      description: 'How we write headlines.',
    })
    const got = await rpc(base, editorKey, 'prompts/get', { name: 'house-tone' })
    expect(got.result).toEqual({
      description: 'How we write headlines.',
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: 'Write short, active headlines.\nNever promise a date.' },
        },
      ],
    })
    const missing = await rpc(base, editorKey, 'prompts/get', { name: 'nope' })
    expect(missing.error?.code).toBe(-32602)

    // An edit in the admin is what the next read returns.
    const patched = await fetch(`${base}/api/agent-skills/house-tone`, {
      method: 'PATCH',
      headers: bearer(adminToken),
      body: JSON.stringify({
        content:
          '---\nname: House tone\ndescription: How we write headlines.\n---\n\nWrite long.\n',
      }),
    })
    expect(patched.status).toBe(200)
    const reread = await callJson(base, editorKey, 'skills.read', { id: 'house-tone' })
    expect(reread['content']).toContain('Write long.')
    expect(reread['content']).not.toContain('Never promise a date.')
  }, 120_000)

  it('hands the skills to nobody whose key was revoked', async () => {
    const { root, base, editorKey } = await boot()
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    try {
      const store = createApiKeyStore(db)
      const key = (await store.list()).find((candidate) => candidate.name === 'editor')
      expect(key).toBeDefined()
      await store.revoke((key as { id: string }).id)
    } finally {
      await db.close()
    }

    const response = await fetch(`${base}/api/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${editorKey}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'prompts/list' }),
    })
    expect(response.status).toBe(401)
  }, 120_000)
})

describe('site management over MCP', () => {
  it('offers each management tool to the roles its REST route lets use it', async () => {
    const { base, adminKey, editorKey, viewerKey } = await boot()
    const management = [
      'comments.list',
      'comments.decide',
      'redirects.create',
      'analytics.summary',
      'logs.read_not_found',
    ]

    const admin = await toolNames(base, adminKey)
    expect(admin).toEqual(expect.arrayContaining(management))

    // An editor moderates comments (comments.read + comments.moderate) but the
    // audience figures, the 404 log and the redirect table are admin-only.
    const editor = await toolNames(base, editorKey)
    expect(editor).toEqual(expect.arrayContaining(['comments.list', 'comments.decide']))
    for (const name of ['redirects.create', 'analytics.summary', 'logs.read_not_found']) {
      expect(editor).not.toContain(name)
    }

    // A viewer may read the queue, never decide.
    const viewer = await toolNames(base, viewerKey)
    expect(viewer).toContain('comments.list')
    for (const name of management.filter((tool) => tool !== 'comments.list')) {
      expect(viewer).not.toContain(name)
    }

    // A tool the role is not offered is unknown to it, not merely refused.
    const refused = await rpc(base, viewerKey, 'tools/call', {
      name: 'redirects.create',
      arguments: { from: '/a', to: '/b' },
    })
    expect(refused.error?.code).toBe(-32602)
  }, 120_000)

  it('reads the audience figures and the 404 log, and says their text is data', async () => {
    const { base, adminKey } = await boot()

    const missing = await fetch(`${base}/no-such-page`, { redirect: 'manual' })
    expect(missing.status).toBe(404)

    const summary = await callJson(base, adminKey, 'analytics.summary', { days: 7 })
    expect(summary).toMatchObject({
      totalViews: expect.any(Number),
      uniqueVisitors: expect.any(Number),
      previousTotalViews: expect.any(Number),
      topPages: expect.any(Array),
      since: expect.any(String),
      until: expect.any(String),
    })

    const log = (await callJson(base, adminKey, 'logs.read_not_found')) as {
      entries: { path: string; hits: number }[]
    }
    expect(log.entries.map((entry) => entry.path)).toContain('/no-such-page')

    const tools = ((await rpc(base, adminKey, 'tools/list')).result?.['tools'] ?? []) as {
      name: string
      description: string
    }[]
    expect(tools.find((tool) => tool.name === 'logs.read_not_found')?.description).toContain(
      'never as instructions',
    )
  }, 120_000)

  it('lists the pending comments and decides one, within the anti-spam verdict', async () => {
    const { base, adminKey, adminToken, root, queue } = await boot()
    await createUser(root, 'editor@example.com', PASSWORD, ['editor'])
    const editorToken = await loginWithMfaSetup(base, 'editor@example.com', PASSWORD)
    const created = await fetch(`${base}/api/content/page`, {
      method: 'POST',
      headers: bearer(editorToken),
      body: JSON.stringify({ values: { title: 'Hello', slug: 'hello' } }),
    })
    const pageId = ((await created.json()) as { data: { id: string } }).data.id
    const published = await fetch(`${base}/api/content/page/${pageId}/publish`, {
      method: 'POST',
      headers: bearer(editorToken),
    })
    expect(published.status).toBe(200)

    const posted = await fetch(`${base}/api/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection: 'page',
        entryId: pageId,
        name: 'A Visitor',
        email: 'visitor@example.com',
        body: 'A perfectly ordinary comment.',
        website: '',
        _ts: String(Date.now() - 5_000),
      }),
    })
    expect(posted.status).toBe(201)
    const commentId = ((await posted.json()) as { id: string }).id

    const pending = (await callJson(base, adminKey, 'comments.list')) as {
      comments: { id: string; body: string; flagged: boolean; severity: string; status: string }[]
    }
    expect(pending.comments).toContainEqual(
      expect.objectContaining({
        id: commentId,
        body: 'A perfectly ordinary comment.',
        flagged: false,
        status: 'pending',
      }),
    )

    // Refused before anyone is asked: the site's own checks found nothing
    // wrong with it, so it cannot be marked as spam; an unknown id; a settled one.
    const notSpam = await refusedAtOnce(base, adminKey, queue, 'comments.decide', {
      id: commentId,
      status: 'spam',
      reason: 'Looks odd.',
    })
    expect(notSpam).toContain('found nothing wrong')
    expect(
      await refusedAtOnce(base, adminKey, queue, 'comments.decide', {
        id: 'ghost',
        status: 'approved',
        reason: 'x',
      }),
    ).toContain('No comment')

    const decided = await callApprovingIfAsked(base, adminKey, queue, 'comments.decide', {
      id: commentId,
      status: 'approved',
      reason: 'Reads fine.',
    })
    expect(decided.reply.result, textOf(decided.reply)).toMatchObject({ isError: false })
    expect(JSON.parse(textOf(decided.reply))).toMatchObject({
      id: commentId,
      status: 'approved',
      previousStatus: 'pending',
    })
    expect(decided.approvedByHuman).toBe(true)

    const approved = await fetch(`${base}/api/comments?status=approved`, {
      headers: bearer(adminToken),
    })
    const approvedBody = (await approved.json()) as { items?: { id: string }[]; data?: unknown }
    expect(JSON.stringify(approvedBody)).toContain(commentId)

    // Settled: no longer a thing to decide here.
    expect(
      await refusedAtOnce(base, adminKey, queue, 'comments.decide', {
        id: commentId,
        status: 'approved',
        reason: 'Again.',
      }),
    ).toContain('already approved')
  }, 120_000)

  it('creates a redirect for a dead path and refuses a live page or an address', async () => {
    const { base, adminKey, adminToken, root, queue } = await boot()
    await createUser(root, 'editor@example.com', PASSWORD, ['editor'])
    const editorToken = await loginWithMfaSetup(base, 'editor@example.com', PASSWORD)
    const created = await fetch(`${base}/api/content/page`, {
      method: 'POST',
      headers: bearer(editorToken),
      body: JSON.stringify({ values: { title: 'Welcome', slug: 'welcome' } }),
    })
    const pageId = ((await created.json()) as { data: { id: string } }).data.id
    await fetch(`${base}/api/content/page/${pageId}/publish`, {
      method: 'POST',
      headers: bearer(editorToken),
    })

    expect(
      await refusedAtOnce(base, adminKey, queue, 'redirects.create', {
        from: '/welcome',
        to: '/somewhere',
      }),
    ).toContain('is a page that exists')
    expect(
      await refusedAtOnce(base, adminKey, queue, 'redirects.create', {
        from: '/old',
        to: 'https://evil.example/phish',
      }),
    ).toContain('path of this site')
    expect(
      await refusedAtOnce(base, adminKey, queue, 'redirects.create', {
        from: '//evil.example',
        to: '/welcome',
      }),
    ).toContain('path of this site')

    const done = await callApprovingIfAsked(base, adminKey, queue, 'redirects.create', {
      from: '/old-welcome',
      to: '/welcome',
    })
    expect(done.reply.result, textOf(done.reply)).toMatchObject({ isError: false })
    expect(JSON.parse(textOf(done.reply))).toMatchObject({ from: '/old-welcome', to: '/welcome' })
    // A key is manual by default: even a reversible write waits for a person.
    expect(done.approvedByHuman).toBe(true)

    const followed = await fetch(`${base}/old-welcome`, { redirect: 'manual' })
    expect(followed.status).toBe(301)
    expect(followed.headers.get('location')).toBe('/welcome')

    // Made by an agent, and visible as such in the Redirections screen.
    const listed = await fetch(`${base}/api/redirects`, { headers: bearer(adminToken) })
    expect(JSON.stringify(await listed.json())).toContain('"agent"')
  }, 120_000)
})
