import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

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

/**
 * `/api/theme` (fiche 14), end to end over a real `cogenta serve`/`cogenta
 * dev`. The site here has **no LLM provider**, deliberately, the same
 * discipline `serve-site-plan.test.ts` follows: the appearance screen must
 * work in full without one (R2), and only the AI section's absence needs
 * proving here.
 */

const FILE_TOKENS = {
  color: {
    bg: '#ffffff',
    fg: '#16181d',
    accent: '#1d4ed8',
    accentFg: '#ffffff',
    muted: '#f1f2f4',
    mutedFg: '#4b5057',
    border: '#d7dade',
  },
  font: {
    sans: 'ui-sans-serif, system-ui, sans-serif',
    serif: 'ui-serif, Georgia, serif',
    mono: 'ui-monospace, SFMono-Regular, monospace',
    scale: 1.25,
    baseSize: '1rem',
  },
  space: { unit: '0.25rem', density: 'comfortable' },
  radius: { sm: '2px', md: '6px', lg: '12px' },
  motion: { duration: '200ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
  shadow: { sm: '0 1px 2px rgba(0, 0, 0, 0.06)', md: '0 6px 20px rgba(0, 0, 0, 0.12)' },
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-theme-e2e-'))
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
  await writeFile(
    join(root, 'theme.tokens.json'),
    `${JSON.stringify(FILE_TOKENS, null, 2)}\n`,
    'utf8',
  )
  return root
}

/** Publishes a "home" page so `/` (and this suite's preview requests) resolve to a real document. Content creation needs `editor`, distinct from the `admin` session every theme route needs. */
async function seedHomePage(root: string, base: string): Promise<void> {
  await createUser(root, 'editor@example.com', 'correct-horse-battery', ['editor'])
  const editorToken = await loginWithMfaSetup(base, 'editor@example.com', 'correct-horse-battery')
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${editorToken}` }
  const created = (await (
    await fetch(`${base}/api/content/page`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ values: { title: 'Home', slug: 'home' } }),
    })
  ).json()) as { data: { id: string } }
  await fetch(`${base}/api/content/page/${created.data.id}/publish`, { method: 'POST', headers })
}

const activeServers: AbortController[] = []
const fakeVendors: { close(): Promise<void> }[] = []
afterEach(async () => {
  for (const controller of activeServers.splice(0)) controller.abort()
  for (const fake of fakeVendors.splice(0)) await fake.close()
})

const VALID_SKIN_TOKENS = {
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

/**
 * A minimal, real Anthropic Messages API double that answers by *content*,
 * not by call order — `proposeThemeCandidates` fires several skin-candidate
 * calls in parallel (`Promise.all`), so nothing about their arrival order is
 * guaranteed. Mirrors `packages/agents/test/theme-creator/propose-theme
 * .test.ts`'s own in-process `fakeClient`, just over real HTTP.
 */
async function startFakeThemeVendor(themeName: string): Promise<{
  readonly url: string
  close(): Promise<void>
}> {
  let skinCallCount = 0
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        messages: readonly { content: unknown }[]
      }
      const lastContent = body.messages.at(-1)?.content
      const text =
        typeof lastContent === 'string'
          ? lastContent
          : (Array.isArray(lastContent) ? lastContent : [])
              .map((part) => (typeof part === 'object' && part !== null ? part : {}))
              .map((part) => (part as { text?: string }).text ?? '')
              .join('')
      const isThemeChoice = text.includes('Available themes')
      const replyText = isThemeChoice
        ? JSON.stringify({ themeName, rationale: 'The only theme installed.' })
        : // Each of the several design directions run in parallel must come
          // back distinct — `generateSkinCandidates` drops an exact repeat
          // as "not a real choice" (see its own module comment).
          JSON.stringify({
            ...VALID_SKIN_TOKENS,
            radius: { ...VALID_SKIN_TOKENS.radius, sm: `${1 + skinCallCount++}px` },
          })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          content: [{ type: 'text', text: replyText }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      )
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fake vendor has no port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

async function adminSession(root: string, base: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct-horse-battery', ['admin'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct-horse-battery')
}

async function editorSession(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct-horse-battery', ['editor'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct-horse-battery')
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

describe('GET /api/theme', () => {
  it('reports the file tokens and says the AI section and export are unavailable', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    const response = await fetch(`${server.base}/api/theme`, { headers: auth(token) })
    const body = (await response.json()) as {
      data: { fileTokens: unknown; aiAvailable: boolean; exportAvailable: boolean }
    }

    expect(response.status).toBe(200)
    expect(body.data.fileTokens).toEqual(FILE_TOKENS)
    expect(body.data.aiAvailable).toBe(false)
    expect(body.data.exportAvailable).toBe(false)
    await server.stop()
  }, 60_000)

  it('reports the AI section available once a provider is registered through /admin/providers (L26 task 5 regression)', async () => {
    // The bug this guards: aiAvailable used to be computed from
    // cogenta.config.mjs's static `llm` block only — an admin who
    // configured a provider through the UI (the dynamic, encrypted
    // ProviderConfigStore every other agent already reads from) saw this
    // screen still claim no provider was configured.
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    const before = (await (
      await fetch(`${server.base}/api/theme`, { headers: auth(token) })
    ).json()) as { data: { aiAvailable: boolean } }
    expect(before.data.aiAvailable).toBe(false)

    const configured = await fetch(`${server.base}/api/providers`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({
        provider: 'anthropic',
        apiKey: 'sk-ant-test-key',
        model: 'claude-test',
        baseUrl: 'http://127.0.0.1:1',
      }),
    })
    expect(configured.status).toBe(201)

    const after = (await (
      await fetch(`${server.base}/api/theme`, { headers: auth(token) })
    ).json()) as { data: { aiAvailable: boolean } }
    expect(after.data.aiAvailable).toBe(true)

    await server.stop()
  }, 60_000)

  it('refuses a non-admin', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await editorSession(root, server.base)

    const response = await fetch(`${server.base}/api/theme`, { headers: auth(token) })
    expect(response.status).toBe(403)
    await server.stop()
  }, 60_000)
})

describe('PUT /api/theme/overrides and its hot-swap into the served stylesheet', () => {
  it('saves an override and the public stylesheet reflects it on the very next request', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    const before = await fetch(`${server.base}/_cogenta/styles.css`)
    const beforeCss = await before.text()
    expect(beforeCss).toContain('#1d4ed8')

    const put = await fetch(`${server.base}/api/theme/overrides`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ tokenOverrides: { color: { accent: '#c2410c' } } }),
    })
    expect(put.status).toBe(200)

    const after = await fetch(`${server.base}/_cogenta/styles.css`)
    const afterCss = await after.text()
    expect(afterCss).toContain('#c2410c')
    expect(afterCss).not.toContain('#1d4ed8')

    await server.stop()
  }, 60_000)

  it('refuses an override that would fail contract D contrast, and does not persist it', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    const response = await fetch(`${server.base}/api/theme/overrides`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ tokenOverrides: { color: { fg: '#fefefe' } } }),
    })
    expect(response.status).toBe(422)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('SKIN_CONTRAST_INSUFFICIENT')

    const getAfter = await fetch(`${server.base}/api/theme`, { headers: auth(token) })
    const getBody = (await getAfter.json()) as { data: { overrides: { tokenOverrides: unknown } } }
    expect(getBody.data.overrides.tokenOverrides).toBeNull()

    await server.stop()
  }, 60_000)

  it('serves additional CSS as part of the stylesheet, never as an inline <style> tag', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    await seedHomePage(root, server.base)
    await fetch(`${server.base}/api/theme/overrides`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ additionalCss: '.hand-written{color:pink}' }),
    })

    const css = await (await fetch(`${server.base}/_cogenta/styles.css`)).text()
    expect(css).toContain('.hand-written')

    const home = await fetch(`${server.base}/home`)
    expect(home.status).toBe(200)
    const html = await home.text()
    expect(html).not.toContain('<style')

    await server.stop()
  }, 60_000)
})

describe('POST /api/theme/preview', () => {
  it('renders the real home page with a candidate token overlay, without saving it', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)
    await seedHomePage(root, server.base)

    const response = await fetch(`${server.base}/api/theme/preview`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ tokens: { color: { accent: '#7c3aed' } } }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { html: string } }
    expect(body.data.html).toContain('#7c3aed')

    const getAfter = await fetch(`${server.base}/api/theme`, { headers: auth(token) })
    const getBody = (await getAfter.json()) as { data: { overrides: { tokenOverrides: unknown } } }
    expect(getBody.data.overrides.tokenOverrides).toBeNull()

    await server.stop()
  }, 60_000)

  it('refuses a preview candidate that fails contract D, the same way a save would', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    const response = await fetch(`${server.base}/api/theme/preview`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ tokens: { color: { fg: '#fefefe' } } }),
    })
    expect(response.status).toBe(422)
    await server.stop()
  }, 60_000)

  it('refuses a non-admin', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await editorSession(root, server.base)

    const response = await fetch(`${server.base}/api/theme/preview`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(403)
    await server.stop()
  }, 60_000)
})

describe('POST /api/theme/export (development only, ADR-0010 mirrored)', () => {
  it('refuses on cogenta serve (not development)', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    const response = await fetch(`${server.base}/api/theme/export`, {
      method: 'POST',
      headers: auth(token),
    })
    expect(response.status).toBe(409)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('THEME_EXPORT_NOT_ALLOWED')
    await server.stop()
  }, 60_000)

  it('writes the effective merged tokens to theme.tokens.json under cogenta dev', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers, development: true })
    const token = await adminSession(root, server.base)

    await fetch(`${server.base}/api/theme/overrides`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ tokenOverrides: { color: { accent: '#065f46' } } }),
    })
    const response = await fetch(`${server.base}/api/theme/export`, {
      method: 'POST',
      headers: auth(token),
    })
    expect(response.status).toBe(200)

    const written = JSON.parse(await readFile(join(root, 'theme.tokens.json'), 'utf8')) as {
      color: { accent: string }
    }
    expect(written.color.accent).toBe('#065f46')

    await server.stop()
  }, 60_000)
})

describe('GET /api/theme/skins — the accepted-skin gallery', () => {
  it('starts empty on a fresh site, honestly, rather than pretending there is a catalog', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    const response = await fetch(`${server.base}/api/theme/skins`, { headers: auth(token) })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: readonly unknown[] }
    expect(body.data).toEqual([])
    await server.stop()
  }, 60_000)
})

// Fiche feedback — "je ne sais pas si le traitement est en cours ou pas",
// for the "Générer un thème" screen specifically. Real `cogenta serve`,
// real fake vendor over real HTTP (never the in-process `ProviderClient`
// double `theme-router.test.ts`/`propose-theme.test.ts` already cover) —
// proves `theme-wiring.ts` really threads `progressJobs`/`onProgress`
// through, not just that the router itself knows how to run a job.
describe('POST /api/theme/generate/jobs, GET …/generate/jobs/:jobId', () => {
  it('runs the same generation as POST …/generate, as a watchable job reporting progress', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)
    const fake = await startFakeThemeVendor('@cogenta/theme-canonical')
    fakeVendors.push(fake)

    await fetch(`${server.base}/api/providers`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({
        provider: 'anthropic',
        apiKey: 'sk-ant-test-key',
        model: 'claude-test',
        baseUrl: fake.url,
      }),
    })

    const started = await fetch(`${server.base}/api/theme/generate/jobs`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ description: 'warm, editorial, paper-like' }),
    })
    expect(started.status).toBe(202)
    const jobId = ((await started.json()) as { data: { jobId: string } }).data.jobId
    expect(jobId).toBeTruthy()

    let job:
      | {
          status: string
          events: { message: string }[]
          result?: { candidates: { id: string }[] }
          error?: { message: string }
        }
      | undefined
    for (let attempt = 0; attempt < 40; attempt++) {
      const polled = await fetch(`${server.base}/api/theme/generate/jobs/${jobId}`, {
        headers: auth(token),
      })
      job = ((await polled.json()) as { data: typeof job }).data
      if (job?.status !== 'running') break
      await new Promise((resolve) => setTimeout(resolve, 25))
    }

    expect(job?.status, job?.error?.message ?? JSON.stringify(job)).toBe('done')
    expect(job?.result?.candidates.length).toBeGreaterThanOrEqual(2)
    expect(job?.events.some((e) => e.message.includes('Choosing a base theme'))).toBe(true)
    expect(job?.events.some((e) => e.message.startsWith('Generating "'))).toBe(true)

    await server.stop()
  }, 60_000)
})
