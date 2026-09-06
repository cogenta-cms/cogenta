import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L24 task 5's acceptance criterion: the appearance screen's theme gallery
 * shows a real visual, not a placeholder, for every theme this build ships
 * with — proven here by rendering at least two different theme packages
 * through the real server and checking the two documents actually differ,
 * rather than trusting that passing a different name did anything.
 *
 * Same iframe-on-the-real-server-render principle L16 (the visual page
 * builder) already established: `POST /api/theme/gallery-preview` renders a
 * fixed, database-free demo page through the named theme, exactly the way
 * `POST /api/builder/render` renders a real entry's unsaved blocks. No
 * screenshot, no headless browser, no second React reimplementation of the
 * twelve blocks.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-theme-gallery-'))
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
  // No collections needed at all: the gallery preview renders fixed demo
  // content and never touches `ContentGateway` or the database.
  await writeFile(join(root, 'cogenta.schema.mjs'), 'export default []\n', 'utf8')
  return root
}

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function galleryPreview(
  base: string,
  token: string | null,
  theme: string,
  method = 'POST',
  tokens?: Record<string, unknown>,
): Promise<{ status: number; html: string | null }> {
  const response = await fetch(`${base}/api/theme/gallery-preview`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    ...(method === 'GET'
      ? {}
      : { body: JSON.stringify({ theme, ...(tokens === undefined ? {} : { tokens }) }) }),
  })
  if (!response.ok) return { status: response.status, html: null }
  const parsed = (await response.json()) as { data: { html: string } }
  return { status: response.status, html: parsed.data.html }
}

/** A complete, contract-D-valid skin, distinct from every built-in theme's own default. */
const CANDIDATE_TOKENS = {
  color: {
    bg: '#0b0f19',
    fg: '#f5f7fb',
    accent: '#f97316',
    accentFg: '#0b0f19',
    muted: '#161d2e',
    mutedFg: '#aab4c8',
    border: '#232c42',
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
  shadow: { sm: '0 1px 2px rgba(0, 0, 0, 0.3)', md: '0 6px 24px rgba(0, 0, 0, 0.4)' },
}

describe('the appearance screen theme gallery renders a real preview per theme (L24 task 5)', () => {
  it('renders the fixed demo page through a named theme, for an admin', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
      const token = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct horse battery staple',
      )

      const preview = await galleryPreview(server.base, token, '@cogenta/theme-canonical')

      expect(preview.status).toBe(200)
      // The fixed demo content — hero, collectionList, featureGrid — not a
      // placeholder and not real site content, since none was ever seeded.
      expect(preview.html).toContain('A site that looks like yours')
      expect(preview.html).toContain('Latest posts')
      expect(preview.html).toContain('Welcome to your new site')
      // Real CSS is inlined (srcDoc consumption, same reasoning as
      // `/api/theme/preview`), never a bare, unstyled document.
      expect(preview.html).toContain('<style>')
      // Never a database read: this project has zero collections declared,
      // and the render still succeeds.
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('renders visibly different documents for two different themes', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
      const token = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct horse battery staple',
      )

      const canonical = await galleryPreview(server.base, token, '@cogenta/theme-canonical')
      const portfolio = await galleryPreview(server.base, token, '@cogenta/theme-portfolio')

      expect(canonical.status).toBe(200)
      expect(portfolio.status).toBe(200)
      // Passing a different theme name actually changed what came back —
      // not merely accepted and ignored.
      expect(canonical.html).not.toBe(portfolio.html)
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('refuses a non-admin actor', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )

      const preview = await galleryPreview(server.base, token, '@cogenta/theme-canonical')
      expect(preview.status).toBe(403)
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('refuses an unauthenticated caller', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const preview = await galleryPreview(server.base, null, '@cogenta/theme-canonical')
      expect(preview.status).toBe(403)
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('refuses a theme name this instance does not ship', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
      const token = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct horse battery staple',
      )

      const preview = await galleryPreview(server.base, token, '@cogenta/theme-nonexistent')
      expect(preview.status).toBe(404)
    } finally {
      await server.stop()
    }
  }, 30_000)

  it("renders a Theme Creator candidate's own tokens against a theme this site is not currently running (L26 task 5)", async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
      const token = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct horse battery staple',
      )

      const withDefault = await galleryPreview(server.base, token, '@cogenta/theme-portfolio')
      const withCandidate = await galleryPreview(
        server.base,
        token,
        '@cogenta/theme-portfolio',
        'POST',
        CANDIDATE_TOKENS,
      )

      expect(withDefault.status).toBe(200)
      expect(withCandidate.status).toBe(200)
      // Same theme's markup/layout, but the candidate's own colour actually
      // reached the stylesheet — not the theme's on-disk default.
      expect(withCandidate.html).toContain(CANDIDATE_TOKENS.color.accent)
      expect(withDefault.html).not.toContain(CANDIDATE_TOKENS.color.accent)
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('refuses a candidate that fails contract D even for a foreign theme', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
      const token = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct horse battery staple',
      )

      const invalid = { ...CANDIDATE_TOKENS, color: { ...CANDIDATE_TOKENS.color, fg: '#0c0f19' } }
      const preview = await galleryPreview(
        server.base,
        token,
        '@cogenta/theme-portfolio',
        'POST',
        invalid,
      )
      expect(preview.status).toBe(422)
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('refuses anything but POST', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
      const token = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct horse battery staple',
      )
      const preview = await galleryPreview(server.base, token, '@cogenta/theme-canonical', 'GET')
      expect(preview.status).toBe(405)
    } finally {
      await server.stop()
    }
  }, 30_000)
})
