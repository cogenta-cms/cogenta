import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L32 step 2, end to end on a real server: a plugin declares a block, an
 * editor puts it on a page, and a visitor gets the markup the plugin
 * produced — through the permission-restricted process, the allowlist, and
 * the theme, without contract B gaining a single name.
 *
 * Only this layer proves it. A unit test on the renderer would prove the
 * renderer runs; it would not prove that a page really saves with a block the
 * vocabulary has never heard of, that the theme really places it, or that a
 * plugin which misbehaves degrades instead of defacing the page.
 */

const MANIFEST = `${JSON.stringify(
  {
    name: 'callout-plugin',
    title: 'Encadrés',
    version: '1.0.0',
    engine: '^1.0.0',
    capabilities: [],
    provides: {
      blocks: [
        {
          name: 'callout',
          label: 'Encadré',
          fallback: 'quote',
          fields: {
            message: { kind: 'text', required: true, options: { max: 300 } },
            tone: { kind: 'select', options: { options: ['info', 'warning'] } },
          },
          fallbackFrom: { text: 'message' },
        },
      ],
    },
    runtime: 'server',
    isolated: true,
  },
  null,
  2,
)}\n`

/** A block that renders a real tree — the same node shape a theme builds. */
const CODE = `({
  onRenderBlock: (input) => ({
    kind: 'element',
    tag: 'aside',
    attrs: { class: 'cg-callout cg-callout--' + (input.values.tone || 'info') },
    children: [
      { kind: 'element', tag: 'p', attrs: {}, children: [
        { kind: 'text', value: input.values.message },
      ] },
    ],
  }),
})`

/** The same block, emitting something no page may hold. */
const HOSTILE = `({
  onRenderBlock: () => ({
    kind: 'element',
    tag: 'section',
    attrs: {},
    children: [
      { kind: 'element', tag: 'script', attrs: {}, children: [
        { kind: 'text', value: 'fetch("/api/auth/session").then(r => r.json())' },
      ] },
    ],
  }),
})`

const COLLECTIONS = `export default [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title', unique: true } },
      body: { kind: 'blocks', options: {} },
    },
    permissions: {
      read: ['public'],
      create: ['editor', 'admin'],
      update: ['editor', 'admin'],
      publish: ['editor', 'admin'],
      delete: ['admin'],
    },
  },
]
`

async function project(code: string = CODE): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-block-plugin-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Block Site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(join(root, 'cogenta.schema.mjs'), COLLECTIONS, 'utf8')
  const pluginDir = join(root, 'plugins', 'callout-plugin')
  await mkdir(pluginDir, { recursive: true })
  await writeFile(join(pluginDir, 'plugin.manifest.json'), MANIFEST, 'utf8')
  await writeFile(join(pluginDir, 'plugin.js'), code, 'utf8')
  return root
}

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function publishPage(
  base: string,
  token: string,
  block: Record<string, unknown>,
): Promise<void> {
  const created = await fetch(`${base}/api/content/page`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      values: { title: 'Une page', slug: 'une-page' },
      blocks: { body: [block] },
    }),
  })
  expect(created.status).toBe(201)
  const id = ((await created.json()) as { data: { id: string } }).data.id
  const published = await fetch(`${base}/api/content/page/${id}/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  expect(published.status).toBe(200)
}

describe('a block a plugin provides, on a real page', () => {
  it('saves, renders the plugin’s own markup, and never joins the vocabulary', async () => {
    const root = await project()
    await createUser(root, 'admin@example.com', 'sup3r-secret-pass', ['admin'])
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await loginWithMfaSetup(server.base, 'admin@example.com', 'sup3r-secret-pass')

      // A block the vocabulary has never heard of is accepted on write,
      // because the site's registry holds it — that is the whole of step 1
      // reaching the writer.
      await publishPage(server.base, token, {
        key: 'c1',
        type: 'callout',
        data: { message: 'La billetterie ouvre lundi.', tone: 'warning' },
      })

      const page = await fetch(`${server.base}/une-page`)
      expect(page.status).toBe(200)
      const html = await page.text()

      // The plugin's own markup, in the page, where the block was placed.
      expect(html).toContain('cg-callout cg-callout--warning')
      expect(html).toContain('La billetterie ouvre lundi.')
      // Stamped with its contract B key like any other block, so the visual
      // builder can still map a click back to it.
      expect(html).toContain('data-block-key="c1"')

      // And the editor is told the block exists, with its label and its
      // fields — the seventeen of the vocabulary are baked into the admin
      // bundle, this one can only come from the server.
      const described = (await (
        await fetch(`${server.base}/api/plugins/blocks`, {
          headers: { authorization: `Bearer ${token}` },
        })
      ).json()) as {
        data: {
          blocks: {
            name: string
            label: string
            plugin: string
            fallback: string
            fields: { name: string; kind: string; required: boolean }[]
          }[]
        }
      }
      expect(described.data.blocks).toHaveLength(1)
      expect(described.data.blocks[0]).toMatchObject({
        name: 'callout',
        label: 'Encadré',
        plugin: 'Encadrés',
        fallback: 'quote',
      })
      expect(described.data.blocks[0]?.fields).toEqual([
        {
          name: 'message',
          kind: 'text',
          required: true,
          localized: false,
          unique: false,
          hasCustomValidation: false,
          options: { max: 300 },
        },
        {
          name: 'tone',
          kind: 'select',
          required: false,
          localized: false,
          unique: false,
          hasCustomValidation: false,
          options: { options: ['info', 'warning'] },
        },
      ])
    } finally {
      await server.stop()
    }
  }, 120_000)

  it('degrades to the fallback it named when the plugin cannot render it', async () => {
    const root = await project(`({ onRenderBlock: () => { throw new Error('nope') } })`)
    await createUser(root, 'admin@example.com', 'sup3r-secret-pass', ['admin'])
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await loginWithMfaSetup(server.base, 'admin@example.com', 'sup3r-secret-pass')
      await publishPage(server.base, token, {
        key: 'c1',
        type: 'callout',
        data: { message: 'La billetterie ouvre lundi.' },
      })

      const html = await (await fetch(`${server.base}/une-page`)).text()

      // The content survives, as the `quote` the manifest named — the page is
      // degraded, never emptied.
      expect(html).toContain('La billetterie ouvre lundi.')
      expect(html).not.toContain('cg-callout')
      expect(html).toContain('blockquote')
    } finally {
      await server.stop()
    }
  }, 120_000)

  it('refuses markup a page may not hold, and degrades instead', async () => {
    const root = await project(HOSTILE)
    await createUser(root, 'admin@example.com', 'sup3r-secret-pass', ['admin'])
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await loginWithMfaSetup(server.base, 'admin@example.com', 'sup3r-secret-pass')
      await publishPage(server.base, token, {
        key: 'c1',
        type: 'callout',
        data: { message: 'La billetterie ouvre lundi.' },
      })

      const html = await (await fetch(`${server.base}/une-page`)).text()

      // The script never reaches the page — not escaped, not sanitised into
      // something else: the whole block was refused and its fallback drawn.
      expect(html).not.toContain('/api/auth/session')
      expect(html).not.toContain('<script>fetch')
      expect(html).toContain('La billetterie ouvre lundi.')
    } finally {
      await server.stop()
    }
  }, 120_000)
})
