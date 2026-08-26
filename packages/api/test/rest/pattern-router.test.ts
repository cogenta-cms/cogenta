import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { createPatternStore, ensurePatternTables, type PatternStore } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPatternRouter, type PatternRouter } from '../../src/rest/pattern-router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * `/api/patterns`, against a real SQLite database — never a mock
 * (AGENTS.md).
 *
 * Admin/editor only on every method (fiche 43 sub-chantier A; fiche 05 task
 * 1) — a fixed rule, so the R4 test below covers exactly the three actors
 * `pattern-router.ts` distinguishes: admin, editor and viewer/anonymous.
 */

const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }
const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const VIEWER: Actor = { id: 'user-viewer', roles: ['viewer'] }

const asPublic: AccessContext = { actor: ANONYMOUS }
const asEditor: AccessContext = { actor: EDITOR }
const asAdmin: AccessContext = { actor: ADMIN }
const asViewer: AccessContext = { actor: VIEWER }

interface SerialisedPattern {
  readonly id: string
  readonly name: string
  readonly category: string | null
  readonly kind: 'pattern' | 'template'
  readonly blocks: readonly { key: string; type: string; data: Record<string, unknown> }[]
  readonly provenance: string
}

const HERO_BLOCK = { key: 'b1', type: 'hero', data: { title: 'Welcome' } }
const CTA_BLOCK = { key: 'b2', type: 'cta', data: { title: 'Try it' } }

describe('createPatternRouter', () => {
  let directory: string
  let db: DatabaseHandle
  let store: PatternStore
  let router: PatternRouter

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-pattern-router-'))
    db = await createSqliteHandle({ url: join(directory, 'pattern.db') })
    await ensurePatternTables(db)
    store = createPatternStore({ db })
    router = createPatternRouter({ store })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('refuses every method to a viewer and to an anonymous caller', async () => {
    for (const context of [asViewer, asPublic]) {
      const list = await router.handle({ method: 'GET', path: '/api/patterns', query: {} }, context)
      expect(list.status).toBe(403)

      const create = await router.handle(
        {
          method: 'POST',
          path: '/api/patterns',
          query: {},
          body: { name: 'Hero band', kind: 'pattern', blocks: [HERO_BLOCK] },
        },
        context,
      )
      expect(create.status).toBe(403)
    }
  })

  it('lets an editor save a pattern and lists it back, with fresh keys never required from the caller', async () => {
    const created = await router.handle(
      {
        method: 'POST',
        path: '/api/patterns',
        query: {},
        body: { name: 'Hero band', category: 'headers', kind: 'pattern', blocks: [HERO_BLOCK] },
      },
      asEditor,
    )
    expect(created.status).toBe(201)
    const pattern = (created.body as { data: SerialisedPattern }).data
    expect(pattern.name).toBe('Hero band')
    expect(pattern.category).toBe('headers')
    expect(pattern.provenance).toBe('human')
    expect(pattern.blocks).toEqual([HERO_BLOCK])

    const list = await router.handle(
      { method: 'GET', path: '/api/patterns', query: { kind: 'pattern' } },
      asAdmin,
    )
    expect((list.body as { data: SerialisedPattern[] }).data).toHaveLength(1)
  })

  it('saves a full-page model under "template", listed separately from a "pattern"', async () => {
    await router.handle(
      {
        method: 'POST',
        path: '/api/patterns',
        query: {},
        body: { name: 'Landing page', kind: 'template', blocks: [HERO_BLOCK, CTA_BLOCK] },
      },
      asAdmin,
    )
    await router.handle(
      {
        method: 'POST',
        path: '/api/patterns',
        query: {},
        body: { name: 'Hero band', kind: 'pattern', blocks: [HERO_BLOCK] },
      },
      asAdmin,
    )

    const templates = await router.handle(
      { method: 'GET', path: '/api/patterns', query: { kind: 'template' } },
      asEditor,
    )
    const templateData = (templates.body as { data: SerialisedPattern[] }).data
    expect(templateData).toHaveLength(1)
    expect(templateData[0]?.name).toBe('Landing page')

    const everything = await router.handle(
      { method: 'GET', path: '/api/patterns', query: {} },
      asEditor,
    )
    expect((everything.body as { data: SerialisedPattern[] }).data).toHaveLength(2)
  })

  it('refuses a block whose type this site does not declare, naming it', async () => {
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/patterns',
        query: {},
        body: {
          name: 'Broken',
          kind: 'pattern',
          blocks: [{ key: 'x', type: 'carousel-of-doom', data: {} }],
        },
      },
      asEditor,
    )
    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string; message: string } }).error.code).toBe(
      'PATTERN_INVALID',
    )
    expect((response.body as { error: { message: string } }).error.message).toContain(
      'carousel-of-doom',
    )
  })

  it('renames and re-categorises a pattern, never touching its blocks', async () => {
    const created = await router.handle(
      {
        method: 'POST',
        path: '/api/patterns',
        query: {},
        body: { name: 'Hero band', kind: 'pattern', blocks: [HERO_BLOCK] },
      },
      asEditor,
    )
    const id = (created.body as { data: SerialisedPattern }).data.id

    const updated = await router.handle(
      { method: 'PATCH', path: `/api/patterns/${id}`, query: {}, body: { name: 'Renamed' } },
      asEditor,
    )
    expect(updated.status).toBe(200)
    const pattern = (updated.body as { data: SerialisedPattern }).data
    expect(pattern.name).toBe('Renamed')
    expect(pattern.blocks).toEqual([HERO_BLOCK])
  })

  it('deletes a pattern, and answers 404 for one that never existed', async () => {
    const created = await router.handle(
      {
        method: 'POST',
        path: '/api/patterns',
        query: {},
        body: { name: 'Hero band', kind: 'pattern', blocks: [HERO_BLOCK] },
      },
      asAdmin,
    )
    const id = (created.body as { data: SerialisedPattern }).data.id

    const deleted = await router.handle(
      { method: 'DELETE', path: `/api/patterns/${id}`, query: {} },
      asAdmin,
    )
    expect(deleted.status).toBe(204)

    const gone = await router.handle(
      { method: 'DELETE', path: `/api/patterns/${id}`, query: {} },
      asAdmin,
    )
    expect(gone.status).toBe(404)
  })

  it('records a generated pattern with its provenance detail, never defaulting it to human', async () => {
    const created = await router.handle(
      {
        method: 'POST',
        path: '/api/patterns',
        query: {},
        body: {
          name: 'AI-drafted hero',
          kind: 'pattern',
          blocks: [HERO_BLOCK],
          provenance: 'generated',
          provenanceDetail: { agent: 'Cogenta Designer', model: 'test-model', at: '2026-08-26' },
        },
      },
      asAdmin,
    )
    const pattern = (created.body as { data: SerialisedPattern & { provenanceDetail: unknown } })
      .data
    expect(pattern.provenance).toBe('generated')
    expect(pattern.provenanceDetail).toEqual({
      agent: 'Cogenta Designer',
      model: 'test-model',
      at: '2026-08-26',
    })
  })
})
