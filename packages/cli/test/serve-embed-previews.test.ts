import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L38 end to end: an embed address is resolved once, its thumbnail is served
 * by the site, and a page shows the title and the thumbnail without its HTML
 * ever pointing a visitor at the provider. The provider is a scripted `fetch`:
 * no test reaches the network.
 */

const VIDEO = 'https://www.youtube.com/watch?v=abc123'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 7, 7, 7])

const SCHEMA = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
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

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-embed-previews-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Site', url: 'https://example.com', locales: ['fr'], defaultLocale: 'fr' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default ${JSON.stringify(SCHEMA)}\n`,
    'utf8',
  )
  return root
}

function provider(calls: string[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith('https://www.youtube.com/oembed')) {
      return Response.json({
        title: 'Inspection d’un poste électrique',
        author_name: 'Norvane',
        width: 560,
        height: 315,
        thumbnail_url: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
        thumbnail_width: 480,
        thumbnail_height: 360,
      })
    }
    if (url.startsWith('https://i.ytimg.com/')) {
      return new Response(JPEG, { headers: { 'content-type': 'image/jpeg' } })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}

async function editor(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct horse battery staple')
}

async function pageWithEmbed(base: string, token: string, consentRequired: boolean): Promise<void> {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
  const created = (await (
    await fetch(`${base}/api/content/page`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        values: { title: 'Vidéo', slug: 'video' },
        blocks: {
          body: [
            {
              key: 'e1',
              type: 'embed',
              data: { provider: 'youtube', url: VIDEO, consentRequired },
            },
          ],
        },
      }),
    })
  ).json()) as { data: { id: string } }
  await fetch(`${base}/api/content/page/${created.data.id}/publish`, { method: 'POST', headers })
}

describe('cogenta serve — embed previews (L38)', () => {
  it('resolves an address for a signed-in editor and serves its thumbnail itself', async () => {
    const root = await project()
    const calls: string[] = []
    const server = await startServer(root, {
      registry: activeServers,
      embedsFetchImpl: provider(calls),
    })
    try {
      const anonymous = await fetch(`${server.base}/api/embeds/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: VIDEO }),
      })
      expect(anonymous.status).toBe(401)
      expect(calls).toHaveLength(0)

      const token = await editor(root, server.base)
      const resolved = await fetch(`${server.base}/api/embeds/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: VIDEO }),
      })
      expect(resolved.status).toBe(200)
      const { data } = (await resolved.json()) as {
        data: { provider: string; title: string; ratio: string; thumbnailPath: string }
      }
      expect(data).toMatchObject({ provider: 'youtube', ratio: '16:9' })
      expect(data.thumbnailPath).toMatch(/^\/_cogenta\/embeds\/[0-9a-f]{64}$/u)

      const thumbnail = await fetch(`${server.base}${data.thumbnailPath}`)
      expect(thumbnail.status).toBe(200)
      expect(thumbnail.headers.get('content-type')).toBe('image/jpeg')
      expect(Buffer.from(await thumbnail.arrayBuffer()).equals(JPEG)).toBe(true)
      expect((await fetch(`${server.base}/_cogenta/embeds/${'0'.repeat(64)}`)).status).toBe(404)
    } finally {
      await server.stop()
    }
  })

  it('shows the title and the site’s own thumbnail before consent, once the page was visited', async () => {
    const root = await project()
    const calls: string[] = []
    const server = await startServer(root, {
      registry: activeServers,
      embedsFetchImpl: provider(calls),
    })
    try {
      const token = await editor(root, server.base)
      await pageWithEmbed(server.base, token, true)

      // The first visit renders without a preview and starts resolving it.
      const first = await (await fetch(`${server.base}/video`)).text()
      expect(first).not.toContain('Inspection d’un poste électrique')

      let html = ''
      for (let attempt = 0; attempt < 40; attempt += 1) {
        html = await (await fetch(`${server.base}/video`)).text()
        if (html.includes('Inspection d’un poste électrique')) break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      expect(html).toContain('Inspection d’un poste électrique')
      expect(html).toContain('par Norvane')
      expect(html).toMatch(/src="\/_cogenta\/embeds\/[0-9a-f]{64}"/u)
      // Nothing in the page makes the visitor's browser contact the provider.
      expect(html).not.toContain('ytimg.com')
      expect(html).not.toContain('<iframe')
    } finally {
      await server.stop()
    }
  })

  it('names the player by its title once the address is known', async () => {
    const root = await project()
    const calls: string[] = []
    const server = await startServer(root, {
      registry: activeServers,
      embedsFetchImpl: provider(calls),
    })
    try {
      const token = await editor(root, server.base)
      await pageWithEmbed(server.base, token, false)
      await fetch(`${server.base}/api/embeds/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: VIDEO }),
      })
      const html = await (await fetch(`${server.base}/video`)).text()
      expect(html).toContain('title="YouTube : Inspection d’un poste électrique"')
    } finally {
      await server.stop()
    }
  })
})
