import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * No visitor's address reaches a font provider — end to end, over a real
 * `cogenta serve`, for every built-in theme and every kind of page.
 *
 * A font loaded from a provider's server sends the visitor's IP address there
 * before any consent (LG Munich I, 20 January 2022, 3 O 17493/20). The themes
 * ship their faces; the server sends them. These tests are the proof that a
 * default site makes no request to any other host for a font, and that the one
 * setting that allows it (`appearance.remoteWebFonts`) is the only way it
 * happens.
 */

const THEMES = [
  'canonical',
  'ecommerce',
  'portfolio',
  'entreprise',
  'magazine',
  'blog',
  'saas',
  'docs',
  'restaurant',
  'association',
] as const

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
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

const TOKENS = {
  color: {
    bg: '#ffffff',
    fg: '#16181d',
    accent: '#1d4ed8',
    accentFg: '#ffffff',
    muted: '#f2f4f7',
    mutedFg: '#3f4655',
    border: '#d7dbe2',
  },
  font: {
    sans: 'ui-sans-serif, system-ui, sans-serif',
    serif: 'ui-serif, Georgia, serif',
    mono: 'ui-monospace, monospace',
    scale: 1.25,
    baseSize: '1rem',
  },
  space: { unit: '0.25rem', density: 'comfortable' },
  radius: { sm: '0.25rem', md: '0.5rem', lg: '1rem' },
  motion: { duration: '180ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
  shadow: { sm: '0 1px 2px rgba(22, 24, 29, 0.08)', md: '0 6px 24px rgba(22, 24, 29, 0.12)' },
}

interface ProjectOptions {
  readonly remoteWebFonts?: boolean
  readonly fonts?: { readonly sans: string; readonly serif: string }
}

async function project(options: ProjectOptions = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-fonts-e2e-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
  ${options.remoteWebFonts === undefined ? '' : `appearance: { remoteWebFonts: ${options.remoteWebFonts} },`}
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default ${JSON.stringify(COLLECTIONS, null, 2)}\n`,
    'utf8',
  )
  const tokens = {
    ...TOKENS,
    font: { ...TOKENS.font, ...(options.fonts ?? {}) },
  }
  await writeFile(join(root, 'theme.tokens.json'), `${JSON.stringify(tokens, null, 2)}\n`, 'utf8')
  return root
}

const activeServers: AbortController[] = []
afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

/** Seeds a published home page (an editor's work) and returns an admin session, which activating a theme needs. */
async function seedHomePage(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct-horse-battery', ['editor'])
  const editorToken = await loginWithMfaSetup(base, 'editor@example.com', 'correct-horse-battery')
  const created = (await (
    await fetch(`${base}/api/content/page`, {
      method: 'POST',
      headers: auth(editorToken),
      body: JSON.stringify({ values: { title: 'Home', slug: 'home' } }),
    })
  ).json()) as { data: { id: string } }
  await fetch(`${base}/api/content/page/${created.data.id}/publish`, {
    method: 'POST',
    headers: auth(editorToken),
  })
  await createUser(root, 'admin@example.com', 'correct-horse-battery', ['admin'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct-horse-battery')
}

/** Every URL a document or stylesheet would make a browser request, as written. */
function referencedUrls(html: string): string[] {
  const urls: string[] = []
  for (const match of html.matchAll(
    /<(?:link|script|img|source|iframe|video|audio|embed)\b[^>]*?\s(?:href|src|srcset)=["']([^"']+)["']/giu,
  )) {
    urls.push(match[1] as string)
  }
  return urls
}

/** Raw request, so a traversal path reaches the server exactly as written (`fetch` normalises `..`). */
function rawGet(
  base: string,
  path: string,
  method = 'GET',
): Promise<{ status: number; headers: Record<string, unknown>; body: Buffer }> {
  const url = new URL(base)
  return new Promise((resolve, reject) => {
    const req = request({ host: url.hostname, port: url.port, path, method }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        }),
      )
    })
    req.on('error', reject)
    req.end()
  })
}

describe('a default site never asks a third party for a font', () => {
  it('serves the home page, an entry, search results and the 404 page of all ten themes from the site itself', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await seedHomePage(root, server.base)

    for (const theme of THEMES) {
      const activated = await fetch(`${server.base}/api/theme/activate`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({ theme: `@cogenta/theme-${theme}`, applySkin: true }),
      })
      expect(activated.status, `activating ${theme}`).toBe(200)

      const css = await (await fetch(`${server.base}/_cogenta/styles.css`)).text()
      expect(css, `${theme} stylesheet`).not.toMatch(/googleapis|gstatic/iu)
      expect(css, `${theme} stylesheet`).not.toMatch(/@import/iu)
      expect(css, `${theme} stylesheet`).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//iu)

      // Every font the sheet declares must be a file the server really sends.
      const fontUrls = [...css.matchAll(/url\((\/_cogenta\/fonts\/[^)]+)\)/gu)].map(
        (match) => match[1] as string,
      )
      expect(fontUrls.length, `${theme} declares faces`).toBeGreaterThan(0)
      expect(new Set(fontUrls).size, `${theme} declares each file once`).toBe(fontUrls.length)
      for (const fontUrl of fontUrls) {
        const font = await fetch(`${server.base}${fontUrl}`)
        expect(font.status, `${theme} ${fontUrl}`).toBe(200)
        expect(font.headers.get('content-type')).toBe('font/woff2')
        expect(font.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
        expect(
          Buffer.from(await font.arrayBuffer())
            .subarray(0, 4)
            .toString('latin1'),
        ).toBe('wOF2')
      }

      for (const path of ['/', '/home', '/search?q=essai', '/no-such-page']) {
        const page = await fetch(`${server.base}${path}`)
        const html = await page.text()
        expect(html.length, `${theme} ${path}`).toBeGreaterThan(200)
        expect(html, `${theme} ${path}`).not.toMatch(/googleapis|gstatic/iu)
        expect(html, `${theme} ${path}`).toContain('href="/_cogenta/styles.css?v=')
        for (const referenced of referencedUrls(html)) {
          // Nothing the browser loads for the page may leave the site. (A
          // canonical or alternate link names the site's own address.)
          if (/^(?:https?:)?\/\//u.test(referenced)) {
            expect(referenced, `${theme} ${path} loads ${referenced}`).toMatch(
              /^https:\/\/example\.com\//u,
            )
          }
        }
        // Preconnect to a font host would itself leak the address.
        expect(html, `${theme} ${path}`).not.toMatch(/rel=["']preconnect["']/u)
        // No hint of any kind: the faces come from the stylesheet, and a hint to
        // a font host would itself leak the address.
        expect(html, `${theme} ${path}`).not.toMatch(
          /rel=["'](?:preload|prefetch|dns-prefetch)["']/u,
        )
      }
    }
    await server.stop()
  }, 240_000)
})

describe('GET /_cogenta/fonts/<theme>/<file>', () => {
  it('sends a theme font with an immutable cache and the right type, and nothing else', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })

    const css = await (await fetch(`${server.base}/_cogenta/styles.css`)).text()
    const path = /url\((\/_cogenta\/fonts\/canonical\/[^)]+)\)/u.exec(css)?.[1] as string
    expect(path).toBeDefined()

    const response = await rawGet(server.base, path)
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('font/woff2')
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
    expect(response.body.subarray(0, 4).toString('latin1')).toBe('wOF2')
    expect(response.headers['content-length']).toBe(String(response.body.length))

    const head = await rawGet(server.base, path, 'HEAD')
    expect(head.status).toBe(200)
    expect(head.body.length).toBe(0)
    expect(head.headers['content-length']).toBe(String(response.body.length))

    expect((await rawGet(server.base, path, 'POST')).status).toBe(405)
    expect((await rawGet(server.base, path, 'DELETE')).status).toBe(405)
    await server.stop()
  }, 60_000)

  it('refuses every path that is not a font a theme shipped, traversal included', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const css = await (await fetch(`${server.base}/_cogenta/styles.css`)).text()
    const real = /\/_cogenta\/fonts\/canonical\/([^)]+)/u.exec(css)?.[1] as string

    const refused = [
      // traversal, plain and encoded
      '/_cogenta/fonts/canonical/../blog/x.woff2',
      '/_cogenta/fonts/canonical/../../package.json',
      '/_cogenta/fonts/../../../etc/passwd',
      `/_cogenta/fonts/canonical/%2e%2e/%2e%2e/package.json`,
      `/_cogenta/fonts/canonical/..%2f..%2fpackage.json`,
      `/_cogenta/fonts/canonical/%2e%2e%2f%2e%2e%2fpackage.json`,
      `/_cogenta/fonts/canonical/..%5c..%5cpackage.json`,
      `/_cogenta/fonts/canonical/${real}%00.png`,
      `/_cogenta/fonts/canonical/${real}%2f..%2f..`,
      // shape
      '/_cogenta/fonts/',
      '/_cogenta/fonts/canonical',
      '/_cogenta/fonts/canonical/',
      `/_cogenta/fonts/canonical/${real}/`,
      `/_cogenta/fonts/canonical/sub/${real}`,
      `/_cogenta/fonts//${real}`,
      // unknown theme, third-party package name, wrong theme for a real file
      `/_cogenta/fonts/nonesuch/${real}`,
      `/_cogenta/fonts/Canonical/${real}`,
      `/_cogenta/fonts/@cogenta%2ftheme-canonical/${real}`,
      `/_cogenta/fonts/kit/${real}`,
      `/_cogenta/fonts/blog/${real}`,
      // a file that exists in the package but is not a listed font
      '/_cogenta/fonts/canonical/manifest.json',
      '/_cogenta/fonts/canonical/README.md',
      '/_cogenta/fonts/canonical/OFL-instrument-sans.txt',
      // a font name that was never shipped, and the same bytes under another extension
      '/_cogenta/fonts/canonical/not-a-font.woff2',
      `/_cogenta/fonts/canonical/${real.replace('.woff2', '.woff')}`,
      `/_cogenta/fonts/canonical/${real.toUpperCase()}`,
    ]
    for (const path of refused) {
      const response = await rawGet(server.base, path)
      expect(response.status, path).toBe(404)
      expect(response.body.subarray(0, 4).toString('latin1'), path).not.toBe('wOF2')
    }
    await server.stop()
  }, 60_000)
})

describe('appearance.remoteWebFonts', () => {
  const FONTS = {
    serif: "'Playfair Display', Georgia, serif",
    sans: "'Geist', system-ui, sans-serif",
  }

  it('is off by default: a skin naming a Google-only family falls back, and a bundled one is served locally', async () => {
    const root = await project({ fonts: FONTS })
    const server = await startServer(root, { registry: activeServers })
    await seedHomePage(root, server.base)

    const css = await (await fetch(`${server.base}/_cogenta/styles.css`)).text()
    expect(css).not.toMatch(/googleapis|gstatic/iu)
    expect(css).not.toContain('@import')
    // Geist is bundled by other themes; the canonical theme does not declare it,
    // yet the skin's choice renders because the site adds the face itself.
    expect(css).toMatch(/@font-face\{[^}]*font-family:\s*'Geist'[^}]*\/_cogenta\/fonts\/saas\//u)
    // Playfair Display is not bundled: no face, no request, the stack falls back.
    expect(css).not.toMatch(/@font-face\{[^}]*Playfair/u)

    const html = await (await fetch(`${server.base}/home`)).text()
    expect(html).not.toMatch(/googleapis|gstatic|preconnect/iu)
    await server.stop()
  }, 60_000)

  it('is the only way a request to Google Fonts happens, and says so in the head', async () => {
    const root = await project({ remoteWebFonts: true, fonts: FONTS })
    const server = await startServer(root, { registry: activeServers })
    await seedHomePage(root, server.base)

    const css = await (await fetch(`${server.base}/_cogenta/styles.css`)).text()
    expect(css).toContain('@import url("https://fonts.googleapis.com/css2?family=Playfair+Display')
    // A bundled family is never fetched remotely, even when remote is allowed.
    expect(css).not.toContain('family=Geist')
    expect(css).toMatch(/@font-face\{[^}]*font-family:\s*'Geist'/u)

    const html = await (await fetch(`${server.base}/home`)).text()
    expect(html).toContain('<link rel="preconnect" href="https://fonts.googleapis.com">')
    await server.stop()
  }, 60_000)

  it('has the font files the stylesheet names in the package the route serves from', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const css = await (await fetch(`${server.base}/_cogenta/styles.css`)).text()
    const path = /url\((\/_cogenta\/fonts\/canonical\/[^)]+)\)/u.exec(css)?.[1] as string
    const served = Buffer.from(await (await fetch(`${server.base}${path}`)).arrayBuffer())
    const onDisk = await readFile(
      new URL(`../../theme-canonical/fonts/${path.split('/').pop()}`, import.meta.url),
    )
    expect(served.equals(onDisk)).toBe(true)
    await server.stop()
  }, 60_000)
})
