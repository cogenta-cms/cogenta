import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger, createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  createSchemaTables,
  createTaxonomyStore,
  f,
  type TaxonomyDefinition,
} from '@cogenta/schema'
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
    structuralGaps: [],
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

/**
 * Approving pages used to change nothing at all.
 *
 * The plan proposed them, the screen asked a human to accept them one by one,
 * and the applier never read `approved.pages` — the worst shape a gap can
 * take, because from the operator's side it is indistinguishable from having
 * worked.
 */
describe('creating the pages a human approved', () => {
  const ROUTED_PAGE: CollectionDefinition = {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: {} },
      slug: { kind: 'text', required: true, options: {} },
      excerpt: { kind: 'text', required: false, options: {} },
    },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  }

  function draftWithPages(
    collections: readonly CollectionDefinition[],
    pages: readonly { title: string; slug: string; purpose: string }[],
  ) {
    return { ...draft(collections), pages, demoContent: [] }
  }

  const DECIDE_PAGES = {
    'brief:locales': 'accepted',
    'contentModel:dish': 'accepted',
    'pages:a-propos': 'accepted',
    'pages:contact': 'accepted',
  } as const

  it('writes each approved page as a real draft entry, with its purpose', async () => {
    const { schemaPath, db, root } = await workspace([ROUTED_PAGE])
    const applier = createSitePlanApplier({
      projectRoot: root,
      db,
      collections: [ROUTED_PAGE],
      defaultLocale: 'fr',
      logger: createLogger({ level: 'silent' }),
      schemaPath,
      model: 'test-model',
    })

    const report = await applier.apply({
      draft: draftWithPages(
        [DISH],
        [
          { title: 'À propos', slug: 'a-propos', purpose: "L'histoire du restaurant." },
          { title: 'Contact', slug: 'contact', purpose: 'Adresse et horaires.' },
        ],
      ),
      decisions: DECIDE_PAGES,
      actorId: 'user-1',
    })

    expect(report.pagesCreated).toBe(2)
    expect(report.pagesSkipped).toEqual([])

    const store = createContentStore({ db, collection: ROUTED_PAGE, defaultLocale: 'fr' })
    const entries = await store.list({ state: 'working' })
    const titles = entries.items.map((entry) => entry.values.title)
    expect(titles).toContain('À propos')
    expect(titles).toContain('Contact')

    const about = entries.items.find((entry) => entry.values.title === 'À propos')
    expect(about?.values.slug).toBe('a-propos')
    expect(about?.values.excerpt).toBe("L'histoire du restaurant.")
    // Never published, and never claiming a human wrote it.
    expect(about?.status).toBe('draft')
    expect(about?.provenance).toBe('generated')
  })

  it('says so, page by page, when the site has nowhere to put one', async () => {
    // `dish` has no slug and no routing: it cannot hold a page.
    const { schemaPath, db, root } = await workspace([DISH])
    const applier = createSitePlanApplier({
      projectRoot: root,
      db,
      collections: [DISH],
      defaultLocale: 'fr',
      logger: createLogger({ level: 'silent' }),
      schemaPath,
    })

    const report = await applier.apply({
      draft: draftWithPages([DISH], [{ title: 'À propos', slug: 'a-propos', purpose: 'x' }]),
      decisions: {
        'brief:locales': 'accepted',
        'contentModel:dish': 'rejected',
        'pages:a-propos': 'accepted',
      },
      actorId: null,
    })

    expect(report.pagesCreated).toBe(0)
    expect(report.pagesSkipped).toHaveLength(1)
    expect(report.pagesSkipped[0]?.title).toBe('À propos')
    expect(report.pagesSkipped[0]?.reason).toContain('no collection that can hold a page')
  })

  it('creates nothing when the human refused the pages', async () => {
    const { schemaPath, db, root } = await workspace([ROUTED_PAGE])
    const applier = createSitePlanApplier({
      projectRoot: root,
      db,
      collections: [ROUTED_PAGE],
      defaultLocale: 'fr',
      logger: createLogger({ level: 'silent' }),
      schemaPath,
    })

    const report = await applier.apply({
      draft: draftWithPages([DISH], [{ title: 'À propos', slug: 'a-propos', purpose: 'x' }]),
      decisions: {
        'brief:locales': 'accepted',
        'contentModel:dish': 'rejected',
        'pages:a-propos': 'rejected',
      },
      actorId: null,
    })

    expect(report.pagesCreated).toBe(0)
    const store = createContentStore({ db, collection: ROUTED_PAGE, defaultLocale: 'fr' })
    expect((await store.list({ state: 'working' })).items).toHaveLength(0)
  })
})

/**
 * Categories, at last.
 *
 * They were excluded by design: a proposal could not declare a taxonomy, so a
 * `taxonomy` field would always have pointed at nothing, and a plan answered
 * "my articles need categories" with a `select` of frozen strings nobody
 * could rename. Declaring them is what removes that reason.
 */
describe('declaring the taxonomies a plan proposes', () => {
  const CATEGORY: TaxonomyDefinition = {
    name: 'category',
    labels: { singular: { fr: 'Catégorie' }, plural: { fr: 'Catégories' } },
    hierarchical: true,
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  }

  function draftWithTaxonomy(taxonomies: readonly TaxonomyDefinition[]) {
    const base = draft([DISH])
    return {
      ...base,
      contentModel: {
        ...base.contentModel,
        taxonomies: taxonomies.map((definition) => ({ definition, rationale: 'x' })),
      },
      demoContent: [],
    }
  }

  const DECIDE = {
    'brief:locales': 'accepted',
    'contentModel:dish': 'accepted',
    'taxonomies:category': 'accepted',
  } as const

  it('writes them as the named export contract A actually reads, and creates their tables', async () => {
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
      draft: draftWithTaxonomy([CATEGORY]),
      decisions: DECIDE,
      actorId: null,
    })

    expect(report.added).toContain('dish')

    // A default export alone would have created the tables and then handed
    // the site a file that never mentions the taxonomy.
    const schema = await readFile(schemaPath, 'utf8')
    expect(schema).toContain('export const taxonomies')
    expect(schema).toContain('"name": "category"')

    // And the table is really there — a term can be written.
    const terms = createTaxonomyStore({ db, taxonomy: CATEGORY })
    await terms.create({ slug: 'entrees', labels: { fr: 'Entrées' } })
    expect((await terms.list()).map((term) => term.slug)).toContain('entrees')
  })

  it('refuses one the site already declares rather than redefining it', async () => {
    const { schemaPath, db, root } = await workspace([PAGE])
    const applier = createSitePlanApplier({
      projectRoot: root,
      db,
      collections: [PAGE],
      taxonomies: [CATEGORY],
      defaultLocale: 'fr',
      logger: createLogger({ level: 'silent' }),
      schemaPath,
    })

    const report = await applier.apply({
      draft: draftWithTaxonomy([CATEGORY]),
      decisions: DECIDE,
      actorId: null,
    })

    expect(report.skipped.map((entry) => entry.name)).toContain('category')
    expect(report.skipped.find((entry) => entry.name === 'category')?.reason).toContain('migration')
  })

  it('says a taxonomy needs `cogenta dev`, and still applies the rest', async () => {
    const { db, root } = await workspace([PAGE])
    // No schemaPath: the `cogenta serve` shape.
    const applier = createSitePlanApplier({
      projectRoot: root,
      db,
      collections: [PAGE],
      defaultLocale: 'fr',
      logger: createLogger({ level: 'silent' }),
    })

    const report = await applier.apply({
      draft: draftWithTaxonomy([CATEGORY]),
      decisions: DECIDE,
      actorId: null,
    })

    const refused = report.skipped.find((entry) => entry.name === 'category')
    expect(refused?.reason).toContain('cogenta dev')
    expect(report.added).toEqual([])
  })
})
