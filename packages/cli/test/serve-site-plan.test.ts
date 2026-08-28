import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L19 task 7, end to end over HTTP: a site plan proposed elsewhere — by the
 * installer, which is exactly what leaves one of these files behind — is
 * read, reviewed item by item and applied by a running `cogenta serve`.
 *
 * The site here has **no LLM provider**, deliberately. That is the harder
 * and more important half of the task: the drafts must still be readable and
 * appliable, and the routes that genuinely need a model must say so plainly
 * instead of failing (R2). Proposing a *new* plan is covered where the
 * planning code lives, in `@cogenta/agents`; what only this layer can prove
 * is that applying one really changes the site on disk and in the database.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
    },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  },
]

const PROPOSED_DISH: CollectionDefinition = {
  name: 'dish',
  labels: { singular: 'Dish', plural: 'Dishes' },
  fields: {
    title: { kind: 'text', required: true, options: { max: 200 } },
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
}

/** A collection that collides with one the site already serves. */
const PROPOSED_PAGE: CollectionDefinition = {
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  fields: { headline: { kind: 'text', required: true, options: {} } },
  permissions: { read: ['public'] },
}

const TOKENS = {
  color: {
    bg: '#ffffff',
    fg: '#16181d',
    accent: '#047857',
    accentFg: '#ffffff',
    muted: '#f2f4f7',
    mutedFg: '#3f4655',
    border: '#d7dbe2',
  },
  font: { sans: 'sans-serif', serif: 'serif', mono: 'monospace', scale: 1.25, baseSize: '1rem' },
  space: { unit: '0.25rem', density: 'comfortable' },
  radius: { sm: '0.25rem', md: '0.5rem', lg: '1rem' },
  motion: { duration: '180ms', easing: 'linear', reduced: true },
  shadow: { sm: '0 1px 2px rgba(0,0,0,.1)', md: '0 6px 24px rgba(0,0,0,.1)' },
}

function draftFile(collections: readonly CollectionDefinition[]) {
  return {
    draft: {
      id: 'draft-1',
      createdAt: '2026-08-16T09:00:00.000Z',
      brief: {
        activity: 'A neighbourhood restaurant.',
        audience: 'Local diners.',
        tone: 'Warm.',
        languages: ['fr'],
        pages: [],
        contentTypes: [],
        constraints: [
          { kind: 'exclusion', topic: 'blog', quote: 'Pas de blog.', source: 'brief.md' },
        ],
        summary: 'A small showcase site.',
        sources: [{ filename: 'brief.md', format: 'markdown', characters: 900, truncated: false }],
        warnings: [],
      },
      contentModel: {
        collections: collections.map((definition) => ({
          definition,
          rationale: `Proposed ${definition.name}.`,
        })),
      },
      pages: [{ title: 'Contact', slug: 'contact', purpose: 'Reach us.' }],
      skins: [
        {
          id: 'clinical',
          label: 'Clean and clinical',
          rationale: 'Cool.',
          tokens: TOKENS,
          attempts: 1,
        },
      ],
      demoContent: [{ collection: 'dish', values: { title: 'Velouté de courge' } }],
      violations: [],
      structuralGaps: [],
      warnings: [],
    },
    decisions: {},
  }
}

async function project(options: { readonly proposed?: readonly CollectionDefinition[] } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-site-plan-e2e-'))
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
  // Exactly what `create-cogenta` leaves behind when a plan was proposed but
  // not reviewed during the install.
  const plans = join(root, '.cogenta', 'site-plans')
  await mkdir(plans, { recursive: true })
  await writeFile(
    join(plans, 'draft-1.plan.json'),
    `${JSON.stringify(draftFile(options.proposed ?? [PROPOSED_DISH]), null, 2)}\n`,
    'utf8',
  )
  return root
}

const activeServers: AbortController[] = []
afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function adminSession(root: string, base: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct-horse-battery', ['admin'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct-horse-battery')
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

describe('a site plan waiting on a live site', () => {
  it('is listed, and says planning is unavailable without a provider', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    const response = await fetch(`${server.base}/api/site-plans`, { headers: auth(token) })
    const body = (await response.json()) as {
      data: { id: string; appliedAt?: string }[]
      plannerAvailable: boolean
    }

    expect(response.status).toBe(200)
    expect(body.data.map((entry) => entry.id)).toEqual(['draft-1'])
    expect(body.data[0]?.appliedAt).toBeUndefined()
    expect(body.plannerAvailable).toBe(false)
    await server.stop()
  }, 60_000)

  it('refuses to analyse a new document with no provider, saying so rather than failing', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    const response = await fetch(`${server.base}/api/site-plans`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({
        documents: [
          { filename: 'brief.md', contentBase64: Buffer.from('# Hi').toString('base64') },
        ],
      }),
    })

    expect(response.status).toBe(501)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'SITE_PLAN_NO_PROVIDER',
    )
    await server.stop()
  }, 60_000)

  it('refuses to apply until every item has been decided', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers, development: true })
    const token = await adminSession(root, server.base)

    // One item decided out of several.
    await fetch(`${server.base}/api/site-plans/draft-1/decisions`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ decisions: { 'contentModel:dish': 'accepted' } }),
    })
    const response = await fetch(`${server.base}/api/site-plans/draft-1/apply`, {
      method: 'POST',
      headers: auth(token),
    })

    expect(response.status).toBe(400)
    const error = (await response.json()) as { error: { code: string; message: string } }
    expect(error.error.code).toBe('SITE_PLAN_DECISION_MISSING')
    // It names what is still undecided, rather than saying "invalid".
    expect(error.error.message).toContain('brief:locales')

    // And nothing was written.
    const schema = await readFile(join(root, 'cogenta.schema.mjs'), 'utf8')
    expect(schema).not.toContain('"name": "dish"')
    await server.stop()
  }, 60_000)

  it('applies a fully reviewed plan to the real schema file and the real database', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers, development: true })
    const token = await adminSession(root, server.base)

    const sections = (
      (await (
        await fetch(`${server.base}/api/site-plans/draft-1`, { headers: auth(token) })
      ).json()) as {
        data: { sections: { items: { id: string }[] }[] }
      }
    ).data.sections
    // With no planner configured the server cannot flatten the draft into
    // sections, so this site reviews by the ids it knows. A site with a
    // provider gets them from the API; the decision rules are the same.
    expect(sections).toEqual([])

    const decisions = {
      'brief:locales': 'accepted',
      'brief:constraint-0': 'accepted',
      'contentModel:dish': 'accepted',
      'pages:contact': 'rejected',
      'skin:clinical': 'accepted',
      'demoContent:0': 'accepted',
    }
    await fetch(`${server.base}/api/site-plans/draft-1/decisions`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ decisions }),
    })

    const response = await fetch(`${server.base}/api/site-plans/draft-1/apply`, {
      method: 'POST',
      headers: auth(token),
    })
    expect(response.status).toBe(200)
    const report = (
      (await response.json()) as {
        data: {
          report: {
            added: string[]
            entriesSeeded: number
            skinApplied: boolean
            followUp: string[]
          }
        }
      }
    ).data.report

    expect(report.added).toEqual(['dish'])
    expect(report.entriesSeeded).toBe(1)
    expect(report.skinApplied).toBe(true)
    expect(report.followUp.join(' ')).toContain('Restart')

    // The schema file really gained the collection, keeping the existing one.
    const schema = await readFile(join(root, 'cogenta.schema.mjs'), 'utf8')
    expect(schema).toContain('"name": "page"')
    expect(schema).toContain('"name": "dish"')
    // The design really landed.
    const tokens = JSON.parse(await readFile(join(root, 'theme.tokens.json'), 'utf8')) as {
      color: { accent: string }
    }
    expect(tokens.color.accent).toBe('#047857')

    await server.stop()

    // The table and its row are really there, read back from the database
    // itself rather than from the API that wrote them.
    const { createSqliteHandle } = await import('@cogenta/core')
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    const result = await db.execute<{ status: string }>({
      text: 'select status from cogenta_dish',
      params: [],
    })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.status).toBe('draft')
    await db.close()
  }, 60_000)

  it('refuses to redefine a collection the site already has, and says why', async () => {
    const root = await project({ proposed: [PROPOSED_PAGE, PROPOSED_DISH] })
    const server = await startServer(root, { registry: activeServers, development: true })
    const token = await adminSession(root, server.base)

    await fetch(`${server.base}/api/site-plans/draft-1/decisions`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({
        decisions: {
          'brief:locales': 'accepted',
          'brief:constraint-0': 'accepted',
          'contentModel:page': 'accepted',
          'contentModel:dish': 'accepted',
          'pages:contact': 'rejected',
          'skin:clinical': 'rejected',
          'demoContent:0': 'rejected',
        },
      }),
    })

    const response = await fetch(`${server.base}/api/site-plans/draft-1/apply`, {
      method: 'POST',
      headers: auth(token),
    })
    const report = (
      (await response.json()) as {
        data: { report: { added: string[]; skipped: { name: string; reason: string }[] } }
      }
    ).data.report

    expect(report.added).toEqual(['dish'])
    expect(report.skipped.map((entry) => entry.name)).toEqual(['page'])
    expect(report.skipped[0]?.reason).toContain('migration')

    // The live `page` collection is untouched: its own fields are still there.
    const schema = await readFile(join(root, 'cogenta.schema.mjs'), 'utf8')
    expect(schema).toContain('"slug"')
    expect(schema).not.toContain('"headline"')
    await server.stop()
  }, 60_000)

  it('refuses to apply on `cogenta serve`, because ADR-0010 keeps the schema read-only in production', async () => {
    const root = await project()
    // No `development: true` — this is `cogenta serve`, the production shape.
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    await fetch(`${server.base}/api/site-plans/draft-1/decisions`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({
        decisions: {
          'brief:locales': 'accepted',
          'brief:constraint-0': 'accepted',
          'contentModel:dish': 'accepted',
          'pages:contact': 'accepted',
          'skin:clinical': 'accepted',
          'demoContent:0': 'accepted',
        },
      }),
    })
    const response = await fetch(`${server.base}/api/site-plans/draft-1/apply`, {
      method: 'POST',
      headers: auth(token),
    })

    expect(response.status).toBe(403)
    const error = (await response.json()) as { error: { code: string; hint?: string } }
    expect(error.error.code).toBe('CONTENT_READ_ONLY')
    expect(error.error.hint).toContain('cogenta dev')

    // Reviewing is still possible, and the decisions really were kept —
    // refusing to apply is not refusing to work.
    const detail = (await (
      await fetch(`${server.base}/api/site-plans/draft-1`, { headers: auth(token) })
    ).json()) as { data: { decisions: Record<string, string> } }
    expect(detail.data.decisions['contentModel:dish']).toBe('accepted')

    // And nothing was written.
    const schema = await readFile(join(root, 'cogenta.schema.mjs'), 'utf8')
    expect(schema).not.toContain('"name": "dish"')
    await server.stop()
  }, 60_000)

  it('writes the schema file the site really loads, not a guessed filename', async () => {
    const root = await project()
    // A project following ADR-0010: TypeScript in git, which is also the
    // candidate `loadCollections` tries first.
    await writeFile(
      join(root, 'cogenta.schema.ts'),
      `export default ${JSON.stringify(COLLECTIONS, null, 2)}
`,
      'utf8',
    )
    const server = await startServer(root, { registry: activeServers, development: true })
    const token = await adminSession(root, server.base)

    await fetch(`${server.base}/api/site-plans/draft-1/decisions`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({
        decisions: {
          'brief:locales': 'accepted',
          'brief:constraint-0': 'accepted',
          'contentModel:dish': 'accepted',
          'pages:contact': 'rejected',
          'skin:clinical': 'rejected',
          'demoContent:0': 'rejected',
        },
      }),
    })
    const response = await fetch(`${server.base}/api/site-plans/draft-1/apply`, {
      method: 'POST',
      headers: auth(token),
    })
    expect(response.status).toBe(200)

    // The `.ts` gained the collection…
    expect(await readFile(join(root, 'cogenta.schema.ts'), 'utf8')).toContain('"name": "dish"')
    // …and the `.mjs` nobody loads was left alone.
    expect(await readFile(join(root, 'cogenta.schema.mjs'), 'utf8')).not.toContain('"name": "dish"')
    const report = ((await response.json()) as { data: { report: { followUp: string[] } } }).data
      .report
    expect(report.followUp.join(' ')).toContain('cogenta.schema.ts')
    await server.stop()
  }, 60_000)

  it('is invisible to an editor, whatever they ask for', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'editor@example.com', 'correct-horse-battery', ['editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct-horse-battery',
    )

    for (const path of ['/api/site-plans', '/api/site-plans/draft-1']) {
      const response = await fetch(`${server.base}${path}`, { headers: auth(token) })

      expect(response.status).toBe(403)
    }
    await server.stop()
  }, 60_000)

  it('turns away a non-admin POST before reading its body, not only before acting on it', async () => {
    // This route alone invites megabyte bodies by design (uploaded
    // documents), and `SitePlanRouter` itself only checks the role after the
    // whole request has already been buffered. The role is checked again
    // one layer up, before that buffering starts — proven here by a body
    // that is not even valid JSON: if the server tried to parse it before
    // rejecting, this would fail with `QUERY_INVALID`/500, not 403.
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'editor@example.com', 'correct-horse-battery', ['editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct-horse-battery',
    )

    const response = await fetch(`${server.base}/api/site-plans`, {
      method: 'POST',
      headers: auth(token),
      body: 'this is not json',
    })

    expect(response.status).toBe(403)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN')
    await server.stop()
  }, 60_000)

  it('rejects an oversized request body with 413, rather than buffering it in full', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    // One byte past the 64 MiB ceiling `readBody` enforces for every route.
    const oversized = Buffer.alloc(64 * 1024 * 1024 + 1, 0x61)
    const response = await fetch(`${server.base}/api/site-plans`, {
      method: 'POST',
      headers: auth(token),
      body: oversized,
    })

    expect(response.status).toBe(413)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'REQUEST_BODY_TOO_LARGE',
    )
    await server.stop()
  }, 60_000)
})
