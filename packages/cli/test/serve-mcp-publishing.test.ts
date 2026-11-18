import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ApprovalQueue, createFileApprovalQueue } from '@cogenta/agents'
import { createApiKeyStore, ensureAuthTables } from '@cogenta/auth'
import { createSqliteHandle } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { type RunningServer, startServer } from './helpers/serve-harness.js'

/**
 * Publishing a bilingual article through `/api/mcp` alone — the job a
 * scheduled publisher does every day. Before these tools, three of its steps
 * needed REST beside MCP: the tags, the cover image and the link between the
 * French and the English entry. Real `cogenta serve`, real SQLite, the real
 * approval queue; each write is approved the way an administrator would.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-mcp-publishing-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'News', url: 'https://example.com', locales: ['en', 'fr', 'de'], defaultLocale: 'en' },
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

async function mintKey(root: string, scope: readonly string[]): Promise<string> {
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  try {
    await ensureAuthTables(db)
    return (await createApiKeyStore(db).create({ name: 'Publisher', scope, createdBy: null })).key
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

/** A write: wait for its approval request, approve it, return the tool's JSON output. */
async function approvedCall(
  base: string,
  key: string,
  queue: ApprovalQueue,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const call = rpc(base, key, 'tools/call', { name, arguments: args })
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const request = (await queue.list('pending')).at(0)
    if (request !== undefined) {
      await queue.decide(request.id, 'approved', 'human-admin')
      break
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  const reply = await call
  expect(reply.result).toMatchObject({ isError: false })
  return JSON.parse(textOf(reply)) as Record<string, unknown>
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

const servers: RunningServer[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop()
})

describe('publishing a bilingual article over MCP alone', () => {
  it('creates tags, the English entry and its linked French translation, then publishes both', async () => {
    const root = await project()
    const key = await mintKey(root, ['editor'])
    const server = await startServer(root)
    servers.push(server)
    const { base } = server
    const queue = approvals(root)

    const listed = await rpc(base, key, 'tools/list')
    const names = ((listed.result?.['tools'] ?? []) as readonly { name: string }[]).map(
      (tool) => tool.name,
    )
    expect(names).toEqual(
      expect.arrayContaining([
        'content.write_translation',
        'taxonomy.list_terms',
        'taxonomy.create_term',
        'media.import_url',
      ]),
    )

    const tag = await approvedCall(base, key, queue, 'taxonomy.create_term', {
      taxonomy: 'tag',
      slug: 'ai-agents',
      labels: { en: 'AI agents', fr: 'Agents IA' },
    })
    expect(tag).toMatchObject({ slug: 'ai-agents', created: true })
    const again = await approvedCall(base, key, queue, 'taxonomy.create_term', {
      taxonomy: 'tag',
      slug: 'ai-agents',
      labels: { en: 'Something else' },
    })
    expect(again).toMatchObject({ id: tag['id'], created: false, labels: { en: 'AI agents' } })

    const terms = JSON.parse(
      textOf(
        await rpc(base, key, 'tools/call', {
          name: 'taxonomy.list_terms',
          arguments: { taxonomy: 'tag' },
        }),
      ),
    ) as { terms: { slug: string }[] }
    expect(terms.terms.map((term) => term.slug)).toEqual(['ai-agents'])

    const english = await approvedCall(base, key, queue, 'content.write_draft', {
      collection: 'post',
      locale: 'en',
      values: { title: 'Agents ship', slug: 'agents-ship', tags: [tag['id']] },
    })
    const french = await approvedCall(base, key, queue, 'content.write_translation', {
      collection: 'post',
      sourceId: english['id'],
      locale: 'fr',
      values: { title: 'Les agents livrent', slug: 'agents-livrent', tags: [tag['id']] },
    })
    expect(french).toMatchObject({ locale: 'fr', translationOf: english['id'] })

    await approvedCall(base, key, queue, 'content.publish', {
      collection: 'post',
      id: english['id'],
    })
    await approvedCall(base, key, queue, 'content.publish', {
      collection: 'post',
      id: french['id'],
    })

    const family = (await (
      await fetch(`${base}/api/content/post/${String(english['id'])}/translations`, {
        headers: { authorization: `Bearer ${key}` },
      })
    ).json()) as { data: { id: string; locale: string; status: string }[] }
    expect(family.data.map((entry) => entry.locale).sort()).toEqual(['en', 'fr'])

    // Translating the French version attaches the German one to the English
    // root: contract A's family is flat, a chain would split it.
    const german = await approvedCall(base, key, queue, 'content.write_translation', {
      collection: 'post',
      sourceId: french['id'],
      locale: 'de',
      values: { title: 'Agenten liefern', slug: 'agenten-liefern' },
    })
    expect(german).toMatchObject({ locale: 'de', translationOf: english['id'] })
  }, 120_000)

  it('refuses before asking anyone: a second translation, an unknown language, a private image address', async () => {
    const root = await project()
    const key = await mintKey(root, ['editor'])
    const server = await startServer(root)
    servers.push(server)
    const { base } = server
    const queue = approvals(root)

    const english = await approvedCall(base, key, queue, 'content.write_draft', {
      collection: 'post',
      locale: 'en',
      values: { title: 'One', slug: 'one' },
    })
    await approvedCall(base, key, queue, 'content.write_translation', {
      collection: 'post',
      sourceId: english['id'],
      locale: 'fr',
      values: { title: 'Un', slug: 'un' },
    })

    expect(
      await refusedAtOnce(base, key, queue, 'content.write_translation', {
        collection: 'post',
        sourceId: english['id'],
        locale: 'fr',
        values: { title: 'Encore', slug: 'encore' },
      }),
    ).toContain('already has a "fr" version')
    expect(
      await refusedAtOnce(base, key, queue, 'content.write_translation', {
        collection: 'post',
        sourceId: english['id'],
        locale: 'en',
        values: { title: 'Same', slug: 'same' },
      }),
    ).toContain('itself written in "en"')
    expect(
      await refusedAtOnce(base, key, queue, 'content.write_translation', {
        collection: 'post',
        sourceId: english['id'],
        locale: 'es',
        values: { title: 'Uno', slug: 'uno' },
      }),
    ).toContain('not a language of this site')
    expect(
      await refusedAtOnce(base, key, queue, 'content.write_translation', {
        collection: 'post',
        sourceId: '01a1ee00-0000-7000-8000-000000000000',
        locale: 'de',
        values: { title: 'Eins', slug: 'eins' },
      }),
    ).toContain('No "post" entry')
    expect(
      await refusedAtOnce(base, key, queue, 'media.import_url', {
        url: 'https://127.0.0.1/cover.png',
        alt: 'A cover',
      }),
    ).toContain('private network')
    expect(
      await refusedAtOnce(base, key, queue, 'media.import_url', {
        url: 'https://[::ffff:7f00:1]/cover.png',
        alt: 'A cover',
      }),
    ).toContain('private network')
    expect(
      await refusedAtOnce(base, key, queue, 'media.import_url', {
        url: 'https://user:secret@images.example.org/cover.png',
        alt: 'A cover',
      }),
    ).toContain('user name or password')
    expect(
      await refusedAtOnce(base, key, queue, 'taxonomy.create_term', {
        taxonomy: 'colour',
        slug: 'red',
        labels: { en: 'Red' },
      }),
    ).toContain('no taxonomy named "colour"')
  }, 120_000)

  it('offers a reader neither the write tools nor the image import', async () => {
    const root = await project()
    const key = await mintKey(root, ['viewer'])
    const server = await startServer(root)
    servers.push(server)

    const listed = await rpc(server.base, key, 'tools/list')
    const names = ((listed.result?.['tools'] ?? []) as readonly { name: string }[]).map(
      (tool) => tool.name,
    )
    expect(names).toContain('taxonomy.list_terms')
    expect(names).not.toContain('taxonomy.create_term')
    expect(names).not.toContain('content.write_translation')
    expect(names).not.toContain('media.import_url')
  }, 60_000)
})
