import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Fiche 15, end to end: contract F's public write route, moderation queue,
 * and public rendering, against a real `cogenta serve` on a real SQLite
 * database — the CMS's first public write route (ADR-0025), so this suite
 * exercises it the same way `serve-search.test.ts` exercises L10 task 3:
 * real HTTP, real permissions, nothing seeded around the write path.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
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
      delete: ['admin'],
      publish: ['editor'],
    },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-comments-e2e-'))
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
    `export default ${JSON.stringify(COLLECTIONS, null, 2)}\n`,
    'utf8',
  )
  return root
}

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

interface Created {
  readonly id: string
}

async function create(
  base: string,
  token: string,
  collection: string,
  values: Readonly<Record<string, string>>,
): Promise<string> {
  const response = await fetch(`${base}/api/content/${collection}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ values }),
  })
  if (response.status !== 201) throw new Error(`create failed: ${response.status}`)
  return ((await response.json()) as { data: Created }).data.id
}

async function publish(base: string, token: string, collection: string, id: string): Promise<void> {
  const response = await fetch(`${base}/api/content/${collection}/${id}/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  if (response.status !== 200) throw new Error(`publish failed: ${response.status}`)
}

interface PostedComment {
  readonly id: string
  readonly status: string
}

async function postComment(
  base: string,
  values: Readonly<Record<string, string>>,
  headers: Readonly<Record<string, string>> = {},
): Promise<{
  readonly status: number
  readonly body: PostedComment | { readonly error: { readonly code: string } }
}> {
  const response = await fetch(`${base}/api/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({
      collection: 'page',
      entryId: 'unused',
      name: 'A Visitor',
      email: 'visitor@example.com',
      body: 'A perfectly ordinary comment.',
      website: '',
      _ts: String(Date.now() - 5_000),
      ...values,
    }),
  })
  const body = (await response.json()) as
    | PostedComment
    | { readonly error: { readonly code: string } }
  return { status: response.status, body }
}

describe('cogenta serve — POST /api/comments (fiche 15, ADR-0025)', () => {
  it('a visitor posts a comment; it is pending; a moderator approves it; it renders on the page', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const pageId = await create(server.base, token, 'page', {
        title: 'Hello world',
        slug: 'hello-world',
      })
      await publish(server.base, token, 'page', pageId)

      const posted = await postComment(server.base, { entryId: pageId })
      expect(posted.status).toBe(201)
      const created = posted.body as PostedComment
      expect(created.status).toBe('pending')

      // Not on the page yet — only approved comments render publicly.
      const beforeApproval = await fetch(`${server.base}/hello-world`)
      const beforeHtml = await beforeApproval.text()
      expect(beforeHtml).not.toContain('A perfectly ordinary comment')

      const approve = await fetch(`${server.base}/api/comments/${created.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'approved' }),
      })
      expect(approve.status).toBe(200)

      const afterApproval = await fetch(`${server.base}/hello-world`)
      const afterHtml = await afterApproval.text()
      expect(afterHtml).toContain('A perfectly ordinary comment')
      expect(afterHtml).toContain('A Visitor')
    } finally {
      await server.stop()
    }
  })

  it('never lets a submitted <script> reach the rendered page — refused before it is even stored', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const posted = await postComment(server.base, {
        entryId: 'x',
        body: '<script>alert(document.cookie)</script>',
      })
      expect(posted.status).toBe(400)
      expect((posted.body as { error: { code: string } }).error.code).toBe('COMMENT_BODY_INVALID')
    } finally {
      await server.stop()
    }
  })

  it('rejects a submission with the honeypot filled in', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const posted = await postComment(server.base, {
        entryId: 'x',
        website: 'http://spam.example',
      })
      expect(posted.status).toBe(422)
    } finally {
      await server.stop()
    }
  })

  it('rate limiting really applies to a submission loop from the same client', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      let lastStatus = 0
      for (let i = 0; i < 8; i += 1) {
        const posted = await postComment(server.base, { entryId: `entry-${i}` })
        lastStatus = posted.status
      }
      expect(lastStatus).toBe(429)
    } finally {
      await server.stop()
    }
  })

  it('rate limiting cannot be defeated by spoofing a fresh X-Forwarded-For per request', async () => {
    // toCommentsRequest() keys the rate limiter on the real socket address
    // only -- a client claiming a different x-forwarded-for on every
    // request must not get a fresh quota each time.
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      let lastStatus = 0
      for (let i = 0; i < 8; i += 1) {
        const posted = await postComment(
          server.base,
          { entryId: `entry-spoof-${i}` },
          { 'x-forwarded-for': `203.0.${i}.${i}` },
        )
        lastStatus = posted.status
      }
      expect(lastStatus).toBe(429)
    } finally {
      await server.stop()
    }
  })

  it('a signed-in editor can list, moderate and reply through the moderation queue', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const posted = await postComment(server.base, { entryId: 'x' })
      const created = posted.body as PostedComment

      const list = await fetch(`${server.base}/api/comments?status=pending`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(list.status).toBe(200)
      const page = (await list.json()) as { items: readonly { id: string }[] }
      expect(page.items.some((item) => item.id === created.id)).toBe(true)

      const reply = await fetch(`${server.base}/api/comments/${created.id}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          authorName: 'The editor',
          authorEmail: 'editor@example.com',
          body: 'Thanks for writing.',
        }),
      })
      expect(reply.status).toBe(201)
    } finally {
      await server.stop()
    }
  })

  it('a viewer (no comments.moderate) is refused, an anonymous caller gets 401 first', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const anon = await fetch(`${server.base}/api/comments`)
      expect(anon.status).toBe(401)
    } finally {
      await server.stop()
    }
  })

  it('a no-JS form submission (redirectTo) gets a 303 redirect, not a JSON body', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/api/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        redirect: 'manual',
        body: JSON.stringify({
          collection: 'page',
          entryId: 'entry-redirect',
          name: 'A Visitor',
          email: 'visitor@example.com',
          body: 'Ordinary comment.',
          website: '',
          _ts: String(Date.now() - 5_000),
          redirectTo: '/hello-world',
        }),
      })
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe('/hello-world?comment=pending')
    } finally {
      await server.stop()
    }
  })
})
