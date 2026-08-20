import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L16's acceptance criterion, as a test rather than as a promise.
 *
 * "Ce qui s'affiche dans le builder est pixel-identique à ce que `cogenta
 * serve` rend réellement pour la même page — vérifié par comparaison, pas par
 * confiance."
 *
 * The builder shows the HTML that `POST /api/builder/render` returns, inside
 * an iframe. So the comparison that actually proves the criterion is between
 * *that* HTML and the HTML a visitor gets from the public URL — the same
 * entry, the same blocks, both fetched over real HTTP from one real server.
 * A screenshot diff would prove less and fail more: two byte-identical
 * documents cannot render differently, and comparing bytes cannot pass by
 * accident because a font happened to load the same way twice.
 *
 * It is byte equality rather than a tolerance because the two paths are one
 * function (`renderEntryPage`), which is the whole architectural decision of
 * task 1. If the *body* comparison below ever needs a tolerance, that decision
 * has been undone.
 *
 * The `<head>` is compared separately and deliberately, because writing this
 * test found a real difference there and it turned out to be right. A builder
 * preview reads the **working** face of the entry (`entryState`,
 * `packages/api/src/content/draft-access.ts`), so `@cogenta/seo`'s
 * `isPublished` refuses it and the document carries `noindex, nofollow` and no
 * canonical — exactly as `theme-render.ts` already promised ("a preview render
 * carries `noindex` without this caller remembering to"). Those tags change
 * nothing a person sees; asserting the difference is *only* them is a stronger
 * statement than asserting the documents are equal, which they must not be.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    versioning: { drafts: true, history: true, keep: 10 },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
      body: { kind: 'blocks', options: { allow: '*' } },
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

const BLOCKS = {
  body: [
    {
      key: 'b-hero',
      type: 'hero',
      data: {
        eyebrow: 'Architecture',
        title: 'A CMS that runs itself',
        subtitle: 'The agent runtime is in the core.',
      },
    },
    {
      key: 'b-cta',
      type: 'cta',
      data: {
        title: 'Try it',
        text: 'One command.',
        actions: [{ label: 'Install', target: { href: '/install' }, emphasis: 'primary' }],
      },
    },
  ],
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-builder-'))
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

interface Entry {
  readonly id: string
  readonly blocks: Readonly<Record<string, readonly { key: string; type: string; data: unknown }[]>>
}

/** Creates the page, publishes it, and hands back its id. */
async function seed(base: string, token: string): Promise<string> {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
  const created = (await (
    await fetch(`${base}/api/content/page`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        values: { title: 'A CMS that runs itself', slug: 'runs-itself' },
        blocks: BLOCKS,
      }),
    })
  ).json()) as { data: Entry }
  await fetch(`${base}/api/content/page/${created.data.id}/publish`, { method: 'POST', headers })
  return created.data.id
}

async function renderDraft(
  base: string,
  token: string | null,
  body: unknown,
): Promise<{ status: number; html: string | null }> {
  const response = await fetch(`${base}/api/builder/render`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) return { status: response.status, html: null }
  const parsed = (await response.json()) as { data: { html: string } }
  return { status: response.status, html: parsed.data.html }
}

/**
 * Everything between `<body>` and `</body>` — what the iframe actually
 * shows — with the comment thread (fiche 15 task 6) stripped out.
 *
 * The builder preview deliberately never renders that section at all (see
 * `serve.ts`'s own comment on the builder's render options): its form
 * embeds a render timestamp (`_ts`, the anti-spam minimum-fill-delay field)
 * that is legitimately different on every render, so comparing it
 * byte-for-byte across two separate renders would be comparing two correct
 * values against each other, not catching a real divergence. Stripping the
 * whole section before comparing is what lets this test keep asserting real
 * byte equality for everything it — and the builder — actually claims is
 * identical.
 */
function bodyOf(html: string): string {
  const open = html.indexOf('<body>')
  const close = html.lastIndexOf('</body>')
  if (open === -1 || close === -1) throw new Error('no body in the rendered document')
  return html
    .slice(open, close)
    .split('\n')
    .filter((line) => !line.includes('cg-comments') && line.trim() !== '')
    .join('\n')
}

function headLines(html: string): readonly string[] {
  const open = html.indexOf('<head>')
  const close = html.indexOf('</head>')
  return html
    .slice(open, close)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

describe('the page builder preview renders the real page, not a lookalike (L16 task 1)', () => {
  it('renders a body byte-for-byte identical to what the public URL serves', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const id = await seed(server.base, token)

      // What a visitor with no session gets from the real URL.
      const publicResponse = await fetch(`${server.base}/runs-itself`)
      expect(publicResponse.status).toBe(200)
      const published = await publicResponse.text()

      // What the builder puts in its iframe, handed the blocks unchanged.
      const preview = await renderDraft(server.base, token, {
        collection: 'page',
        entryId: id,
        blocks: BLOCKS,
      })

      expect(preview.status).toBe(200)
      // The whole visible page: skip link, header, `<main>` with every block,
      // footer. Not "looks the same" — the same bytes.
      expect(bodyOf(preview.html ?? '')).toBe(bodyOf(published))
      // And the same stylesheet link, so the same CSS renders those bytes.
      expect(preview.html).toContain('<link rel="stylesheet" href="/_cogenta/styles.css">')
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('never renders the comment thread in preview — the published page does', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const id = await seed(server.base, token)

      const published = await (await fetch(`${server.base}/runs-itself`)).text()
      expect(published).toContain('class="cg-comments"')

      const preview = await renderDraft(server.base, token, {
        collection: 'page',
        entryId: id,
        blocks: BLOCKS,
      })
      expect(preview.html).not.toContain('class="cg-comments"')
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('differs from the published page only by refusing to be indexed', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const id = await seed(server.base, token)
      const published = await (await fetch(`${server.base}/runs-itself`)).text()
      const preview = await renderDraft(server.base, token, {
        collection: 'page',
        entryId: id,
        blocks: BLOCKS,
      })

      const publishedHead = new Set(headLines(published))
      const previewHead = new Set(headLines(preview.html ?? ''))
      const onlyInPreview = [...previewHead].filter((line) => !publishedHead.has(line))
      const onlyInPublished = [...publishedHead].filter((line) => !previewHead.has(line))

      // A preview shows the working face, which is by definition not the
      // published one — so it must never advertise itself as indexable, and
      // must not claim the canonical URL of the page that *is* published.
      expect(onlyInPreview).toEqual(['<meta name="robots" content="noindex, nofollow" />'])
      expect(onlyInPublished).toEqual([
        '<link rel="canonical" href="https://example.com/runs-itself" />',
      ])
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('shows an unsaved edit, and shows it in the block the editor changed', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const id = await seed(server.base, token)

      const edited = {
        body: [
          { ...BLOCKS.body[0], data: { ...BLOCKS.body[0]?.data, title: 'Edited in the builder' } },
          BLOCKS.body[1],
        ],
      }
      const preview = await renderDraft(server.base, token, {
        collection: 'page',
        entryId: id,
        blocks: edited,
      })

      expect(preview.html).toContain('Edited in the builder')
      expect(preview.html).not.toContain('A CMS that runs itself</h1>')
      // The block that was not touched is still there, still itself.
      expect(preview.html).toContain('data-block-key="b-cta"')

      // And nothing was written: the public page is untouched until save.
      const published = await (await fetch(`${server.base}/runs-itself`)).text()
      expect(published).not.toContain('Edited in the builder')
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('marks every block with its key, so the builder can map a click back to one', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const id = await seed(server.base, token)
      const preview = await renderDraft(server.base, token, {
        collection: 'page',
        entryId: id,
        blocks: BLOCKS,
      })

      expect(preview.html).toContain('data-block-key="b-hero"')
      expect(preview.html).toContain('data-block-key="b-cta"')
      expect(preview.html).toContain('data-field="title"')
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('reorders by reordering the block list, never by moving markup around', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const id = await seed(server.base, token)

      const swapped = { body: [BLOCKS.body[1], BLOCKS.body[0]] }
      const preview = await renderDraft(server.base, token, {
        collection: 'page',
        entryId: id,
        blocks: swapped,
      })
      const html = preview.html ?? ''

      expect(html.indexOf('data-block-key="b-cta"')).toBeLessThan(
        html.indexOf('data-block-key="b-hero"'),
      )
    } finally {
      await server.stop()
    }
  }, 30_000)
})

describe('the page builder preview is a permission-checked route like every other', () => {
  it('refuses an anonymous caller before it reads anything', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const id = await seed(server.base, token)

      const preview = await renderDraft(server.base, null, {
        collection: 'page',
        entryId: id,
        blocks: BLOCKS,
      })
      expect(preview.status).toBe(401)
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('refuses a signed-in reader who may not update the collection', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      // `viewer` appears in none of the collection's permission lists, so it
      // can read the published page and nothing more.
      await createUser(root, 'reader@example.com', 'correct horse battery staple', ['viewer'])
      const editorToken = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const id = await seed(server.base, editorToken)
      const readerToken = await loginWithMfaSetup(
        server.base,
        'reader@example.com',
        'correct horse battery staple',
      )

      const preview = await renderDraft(server.base, readerToken, {
        collection: 'page',
        entryId: id,
        blocks: BLOCKS,
      })
      expect(preview.status).toBe(403)
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('answers the same 404 for an unknown entry and an unknown collection', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )

      const missingEntry = await renderDraft(server.base, token, {
        collection: 'page',
        entryId: '0192f0c2-0000-7000-8000-00000000dead',
        blocks: BLOCKS,
      })
      const missingCollection = await renderDraft(server.base, token, {
        collection: 'nope',
        entryId: '0192f0c2-0000-7000-8000-00000000dead',
        blocks: BLOCKS,
      })

      expect(missingEntry.status).toBe(404)
      expect(missingCollection.status).toBe(404)
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('refuses anything but POST', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/api/builder/render`)
      expect(response.status).toBe(405)
    } finally {
      await server.stop()
    }
  }, 30_000)
})

describe('what a visual editing session leaves in the database (L16 acceptance)', () => {
  it('saves semantic blocks and nothing else — no HTML, no CSS, no positions', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
      const id = await seed(server.base, token)

      // A whole builder session, replayed as the state it ends on: a block
      // added, the order changed, one text edited in place.
      const afterSession = {
        body: [
          BLOCKS.body[1],
          { ...BLOCKS.body[0], data: { ...BLOCKS.body[0]?.data, title: 'Edited in place' } },
          { key: 'b-quote', type: 'quote', data: { text: 'Added by dragging.' } },
        ],
      }
      await renderDraft(server.base, token, {
        collection: 'page',
        entryId: id,
        blocks: afterSession,
      })
      await fetch(`${server.base}/api/content/page/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ blocks: afterSession }),
      })

      // `state=working`: the edits are saved but not published, and the
      // default projection of a published entry is its published face.
      const reread = (await (
        await fetch(`${server.base}/api/content/page/${id}?state=working`, { headers })
      ).json()) as { data: Entry }
      const stored = reread.data.blocks['body'] ?? []

      expect(stored.map((block) => block.type)).toEqual(['cta', 'hero', 'quote'])
      // Contract B, still: a key, a type, and semantic data. The serialised
      // form is searched for markup rather than each field being inspected,
      // so a field this test never thought of is covered too.
      const serialised = JSON.stringify(stored)
      expect(serialised).not.toMatch(/<[a-z]/iu)
      expect(serialised).not.toContain('class=')
      expect(serialised).not.toContain('style')
      expect(serialised).not.toContain('cg-')
      for (const block of stored) {
        expect(Object.keys(block).sort()).toEqual(['data', 'key', 'type'])
      }
    } finally {
      await server.stop()
    }
  }, 30_000)
})
