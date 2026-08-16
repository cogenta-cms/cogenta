import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger, createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { type CollectionDefinition, createSchemaTables, f } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createSitePlanApplier } from '../src/commands/site-plan.js'

/**
 * The two rules that only bite at the file and the row, and that an
 * end-to-end HTTP test cannot reach cleanly: a schema whose current contents
 * would not survive being regenerated, and the provenance of content a model
 * wrote.
 */

const dirs: string[] = []
const handles: DatabaseHandle[] = []

afterEach(async () => {
  await Promise.all(handles.splice(0).map((db) => db.close()))
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const PAGE: CollectionDefinition = {
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  fields: { title: { kind: 'text', required: true, options: {} } },
  permissions: { read: ['public'] },
}

const DISH: CollectionDefinition = {
  name: 'dish',
  labels: { singular: 'Dish', plural: 'Dishes' },
  fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
}

function draft(collections: readonly CollectionDefinition[]) {
  return {
    id: 'draft-1',
    createdAt: '2026-08-16T09:00:00.000Z',
    brief: {
      activity: 'A restaurant.',
      audience: 'Diners.',
      tone: 'Warm.',
      languages: ['fr'],
      pages: [],
      contentTypes: [],
      constraints: [],
      summary: 'A site.',
      sources: [],
      warnings: [],
    },
    contentModel: {
      collections: collections.map((definition) => ({ definition, rationale: 'x' })),
    },
    pages: [],
    skins: [],
    demoContent: [{ collection: 'dish', values: { title: 'Velouté de courge' } }],
    violations: [],
    warnings: [],
  }
}

const DECIDE_ALL = {
  'brief:locales': 'accepted',
  'contentModel:dish': 'accepted',
  'demoContent:0': 'accepted',
} as const

async function workspace(current: readonly CollectionDefinition[]) {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-applier-'))
  dirs.push(root)
  const schemaPath = join(root, 'cogenta.schema.mjs')
  await writeFile(schemaPath, `export default ${JSON.stringify(current, null, 2)}\n`, 'utf8')
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  handles.push(db)
  await createSchemaTables(db, current)
  return { root, schemaPath, db }
}

describe('regenerating the schema file', () => {
  it('refuses when a live field carries a validator, naming the field it would have lost', async () => {
    const withValidator: CollectionDefinition = {
      ...PAGE,
      fields: {
        title: f.text({ required: true, validate: (value) => (value === '' ? 'required' : true) }),
      },
    }
    const { schemaPath, db, root } = await workspace([withValidator])
    const applier = createSitePlanApplier({
      projectRoot: root,
      db,
      collections: [withValidator],
      defaultLocale: 'fr',
      logger: createLogger({ level: 'silent' }),
      schemaPath,
    })

    await expect(
      applier.apply({ draft: draft([DISH]), decisions: DECIDE_ALL, actorId: null }),
    ).rejects.toMatchObject({ code: 'SCHEMA_INVALID' })

    // And it refused before touching anything.
    expect(await readFile(schemaPath, 'utf8')).not.toContain('"name": "dish"')
  })

  it('goes ahead when nothing in the current schema would be lost', async () => {
    const { schemaPath, db, root } = await workspace([PAGE])
    const applier = createSitePlanApplier({
      projectRoot: root,
      db,
      collections: [PAGE],
      defaultLocale: 'fr',
      logger: createLogger({ level: 'silent' }),
      schemaPath,
    })

    const report = await applier.apply({
      draft: draft([DISH]),
      decisions: DECIDE_ALL,
      actorId: null,
    })

    expect(report.added).toEqual(['dish'])
    expect(await readFile(schemaPath, 'utf8')).toContain('"name": "dish"')
  })
})

describe('the provenance of content a model wrote', () => {
  it('marks a seeded demonstration entry as generated, never as human', async () => {
    const { schemaPath, db, root } = await workspace([PAGE])
    const applier = createSitePlanApplier({
      projectRoot: root,
      db,
      collections: [PAGE],
      defaultLocale: 'fr',
      logger: createLogger({ level: 'silent' }),
      schemaPath,
      model: 'claude-sonnet-5',
    })

    await applier.apply({ draft: draft([DISH]), decisions: DECIDE_ALL, actorId: 'user-1' })

    const result = await db.execute<{
      status: string
      provenance: string
      provenance_detail: string | null
    }>({ text: 'select status, provenance, provenance_detail from cogenta_dish', params: [] })

    expect(result.rows).toHaveLength(1)
    // Contract A calls `provenance` non-optional because the European AI
    // framework requires it. The store's default is `human`; inheriting it
    // here would make the one regulated field lie.
    expect(result.rows[0]?.provenance).toBe('generated')
    expect(result.rows[0]?.status).toBe('draft')
    expect(String(result.rows[0]?.provenance_detail)).toContain('site-planner')
    expect(String(result.rows[0]?.provenance_detail)).toContain('claude-sonnet-5')
  })
})
