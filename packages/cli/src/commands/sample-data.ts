import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  MediaImageProcessor,
  SampleDataCollectionOutcome,
  SampleDataEngineLike,
  SampleDataMode,
  SampleDataPreview,
  SampleDataReport,
  SampleDataWarning,
} from '@cogenta/api'
import { createCommentSettingsStore, ensureCommentsTables } from '@cogenta/comments'
import {
  CogentaError,
  createDatabaseRegistry,
  type DatabaseHandle,
  identifier,
  type Logger,
  MEDIA_TABLE,
  type StorageDriver,
  sql,
} from '@cogenta/core'
import { verifyBackup } from '@cogenta/export'
import {
  type CollectionDefinition,
  type ContentEntry,
  createContentStore,
  createMenuStore,
  createSchemaTables,
  createSearchIndex,
  createSiteSettingsStore,
  createTaxonomyStore,
  dropSchemaTables,
  ensureMenuTables,
  ensureSiteSettingsTables,
  type FieldDefinition,
  MENU_TABLES,
  REDIRECTS_TABLE,
  reindexAll,
  SITE_SETTINGS_SITE_SCOPE,
  siteSettingByKey,
  type TaxonomyDefinition,
  type TaxonomyTerm,
} from '@cogenta/schema'
import {
  BLUEPRINT_CONTENT_PACKS,
  type BlueprintContentPack,
  type BlueprintMenus,
  seedBlueprintMenus,
  seedDemoMedia,
  seedSiteSettings,
} from '@cogenta/starters'
import { createSiteBackup } from './backup.js'
import { findSchemaFile, loadSchemaModule } from './serve.js'

/**
 * L28 — a theme applied together with the sample data of the starter that
 * ships it, the way WordPress offers a theme's demo import.
 *
 * The starter packs seed through their own stores, straight into whatever
 * database they are handed, so they cannot be told "skip this slug". They are
 * therefore run into a throwaway SQLite **staging** database first, and what
 * they wrote is read back and copied into the site under the rules the person
 * chose — keeping identities (entry and term ids), so references between the
 * copied rows stay valid. The same staging run backs the preview, which is
 * why its counts are the ones the import then applies.
 *
 * - `keep` is strictly additive (D4): nothing of the site is overwritten.
 * - `reset` replaces the content model and content (D5), only after a backup
 *   that was written *and* re-read successfully, and only when the person
 *   typed the site's name.
 * - Both write the schema file, so both are `cogenta dev` only (D6, ADR-0010),
 *   and the dev supervisor restarts the server to load it (D7).
 */

export interface SampleDataEngineOptions {
  readonly projectRoot: string
  readonly db: DatabaseHandle
  readonly storage: StorageDriver
  readonly images?: MediaImageProcessor
  readonly siteName: string
  readonly defaultLocale: string
  /** `cogenta dev`, and not read-only: the only state in which applying is allowed. */
  readonly writable: boolean
  readonly env?: Record<string, string | undefined>
  readonly logger: Logger
  /** Where a reset's backup goes. Default: `cogenta backup create`'s own directory. */
  readonly backupDir?: string
}

const MEDIA_PLACEHOLDER = 'cogenta-sample-media:'
const PAGE_COLLECTION = 'page'
/** Same locations `seedBlueprintMenus` writes, and `cogenta serve` reads. */
const MENU_LOCATIONS = {
  header: 'primary',
  footer: 'footer',
  headerAction: 'header-action',
} as const
const LISTED_SLUGS = 5

interface StarterPack {
  readonly id: string
  readonly pack: BlueprintContentPack
}

interface Staged {
  readonly entries: ReadonlyMap<string, readonly ContentEntry[]>
  readonly terms: ReadonlyMap<string, readonly TaxonomyTerm[]>
}

interface SiteModel {
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies: readonly TaxonomyDefinition[]
}

interface Plan {
  readonly preview: SampleDataPreview
  readonly starter: StarterPack
  readonly staged: Staged
  readonly site: SiteModel
  /** Per collection, the slugs this import leaves to the site's own entry, with that entry's id. */
  readonly conflicts: ReadonlyMap<string, ReadonlyMap<string, string>>
}

/** The starter whose pack activates this theme, read off the packs rather than a table kept by hand. */
function starterFor(theme: string): StarterPack | undefined {
  for (const [id, pack] of Object.entries(BLUEPRINT_CONTENT_PACKS)) {
    if (pack.defaultTheme === theme) return { id, pack }
  }
  return undefined
}

function slugFieldOf(collection: CollectionDefinition): string | undefined {
  return Object.entries(collection.fields).find(([, field]) => field.kind === 'slug')?.[0]
}

function isEmptySetting(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

/** Replaces every media placeholder the staging run wrote with the id the real ingest produced. */
function withMedia(value: unknown, media: Readonly<Record<string, string>>): unknown {
  if (typeof value === 'string' && value.startsWith(MEDIA_PLACEHOLDER)) {
    return media[value.slice(MEDIA_PLACEHOLDER.length)] ?? null
  }
  if (Array.isArray(value)) return value.map((item) => withMedia(item, media))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, withMedia(item, media)]),
    )
  }
  return value
}

function mapIds(value: unknown, ids: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return ids.get(value) ?? value
  if (Array.isArray(value)) return value.map((item) => mapIds(item, ids))
  return value
}

/**
 * Why a sample collection cannot be written into the site's collection of the
 * same name: a field the sample uses that the site lacks or types differently,
 * or a field the site requires that the sample never fills.
 */
function mismatchesBetween(
  sample: CollectionDefinition,
  site: CollectionDefinition,
  entries: readonly ContentEntry[],
): string[] {
  // A field the sample declares but none of its entries fills (beyond its
  // default) costs nothing to leave out, so only fields carrying a value count.
  const used = new Set(
    entries.flatMap((entry) => [
      ...Object.entries(entry.values)
        .filter(([name, value]) => !isEmptySetting(value) && value !== sample.fields[name]?.default)
        .map(([name]) => name),
      ...Object.keys(entry.blocks),
    ]),
  )
  const out: string[] = []
  const same = (a: FieldDefinition, b: FieldDefinition): boolean => {
    if (a.kind !== b.kind) return false
    if (a.kind === 'relation' && a.options['to'] !== b.options['to']) return false
    if (a.kind === 'taxonomy' && a.options['of'] !== b.options['of']) return false
    if (a.kind === 'relation' || a.kind === 'taxonomy' || a.kind === 'media') {
      return (a.options['many'] === true) === (b.options['many'] === true)
    }
    return true
  }
  for (const [name, field] of Object.entries(sample.fields)) {
    if (!used.has(name)) continue
    const existing = site.fields[name]
    if (existing === undefined) out.push(`${name} (${field.kind})`)
    else if (!same(field, existing)) out.push(`${name} (${field.kind}, not ${existing.kind})`)
  }
  for (const [name, field] of Object.entries(site.fields)) {
    if (field.required === true && field.kind !== 'blocks' && sample.fields[name] === undefined) {
      out.push(`${name} (required on this site)`)
    }
  }
  return out
}

/** Contract A's `validate`/`default` may be functions, which a regenerated schema file would silently drop. */
function unserialisable(collections: readonly CollectionDefinition[]): string[] {
  const lost: string[] = []
  for (const collection of collections) {
    for (const [name, field] of Object.entries(collection.fields)) {
      if (typeof field.validate === 'function') lost.push(`${collection.name}.${name}.validate`)
      if (typeof field.default === 'function') lost.push(`${collection.name}.${name}.default`)
    }
  }
  return lost
}

function schemaFile(
  collections: readonly CollectionDefinition[],
  taxonomies: readonly TaxonomyDefinition[],
): string {
  const main = `export default ${JSON.stringify(collections, null, 2)}\n`
  return taxonomies.length === 0
    ? main
    : `${main}\nexport const taxonomies = ${JSON.stringify(taxonomies, null, 2)}\n`
}

async function listAll(
  db: DatabaseHandle,
  collection: CollectionDefinition,
  defaultLocale: string,
): Promise<ContentEntry[]> {
  const store = createContentStore({ db, collection, defaultLocale })
  const out: ContentEntry[] = []
  let cursor: string | undefined
  for (;;) {
    const page = await store.list({
      state: 'working',
      limit: 100,
      sort: { field: 'createdAt', direction: 'asc' },
      ...(cursor === undefined ? {} : { cursor }),
    })
    out.push(...page.items)
    if (!page.hasMore || page.nextCursor === null) return out
    cursor = page.nextCursor
  }
}

async function countRows(db: DatabaseHandle, table: string): Promise<number> {
  try {
    const result = await db.query<{ readonly n: number | string }>(
      sql`select count(*) as n from ${identifier(table, db.dialect)}`,
    )
    return Number(result.rows[0]?.n ?? 0)
  } catch {
    // A table this site never created holds nothing to delete.
    return 0
  }
}

async function deleteRows(db: DatabaseHandle, table: string): Promise<void> {
  try {
    await db.query(sql`delete from ${identifier(table, db.dialect)}`)
  } catch (error) {
    // Only "no such table" is expected here; anything else must stop a reset.
    const count = await countRows(db, table)
    if (count > 0) throw error
  }
}

export function createSampleDataEngine(options: SampleDataEngineOptions): SampleDataEngineLike {
  const { db, defaultLocale, logger } = options

  async function loadSite(): Promise<SiteModel> {
    const loaded = await loadSchemaModule(options.projectRoot)
    return { collections: loaded.collections, taxonomies: loaded.taxonomies }
  }

  /** Runs the starter's own seeding into a throwaway SQLite file and reads back what it wrote. */
  async function stage(pack: BlueprintContentPack): Promise<Staged> {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-sample-data-'))
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(dir, 'staging.db'),
    })
    try {
      const staging = selection.instance
      await createSchemaTables(staging, pack.collections, pack.taxonomies ?? [])
      const media = Object.fromEntries(
        (pack.mediaSpecs ?? []).map((spec) => [spec.name, `${MEDIA_PLACEHOLDER}${spec.name}`]),
      )
      await pack.seedDemoContent({
        db: staging,
        defaultLocale,
        adminId: null,
        media,
        siteName: options.siteName,
      })
      const terms = new Map<string, readonly TaxonomyTerm[]>()
      for (const taxonomy of pack.taxonomies ?? []) {
        terms.set(taxonomy.name, await createTaxonomyStore({ db: staging, taxonomy }).list())
      }
      const entries = new Map<string, readonly ContentEntry[]>()
      for (const collection of pack.collections) {
        entries.set(collection.name, await listAll(staging, collection, defaultLocale))
      }
      return { entries, terms }
    } finally {
      await selection.dispose()
      await rm(dir, { recursive: true, force: true, maxRetries: 5 })
    }
  }

  async function plan(theme: string, mode: SampleDataMode): Promise<Plan> {
    const starter = starterFor(theme)
    if (starter === undefined) {
      throw new CogentaError({
        code: 'THEME_SAMPLE_DATA_UNAVAILABLE',
        message: `The theme "${theme}" ships no sample data.`,
        hint: 'Apply the theme on its own; only themes that come with a starter site offer sample data.',
        details: { theme },
      })
    }
    const { pack } = starter
    const site = await loadSite()
    const staged = await stage(pack)
    const warnings: SampleDataWarning[] = []
    const conflicts = new Map<string, Map<string, string>>()
    const collections: SampleDataCollectionOutcome[] = []

    for (const collection of pack.collections) {
      const sample = staged.entries.get(collection.name) ?? []
      const existing = site.collections.find((item) => item.name === collection.name)
      if (mode === 'reset') {
        collections.push({
          name: collection.name,
          outcome: 'replace',
          entries: sample.length,
          conflictingSlugs: [],
          mismatches: [],
        })
        continue
      }
      if (existing === undefined) {
        collections.push({
          name: collection.name,
          outcome: 'add',
          entries: sample.length,
          conflictingSlugs: [],
          mismatches: [],
        })
        continue
      }
      const mismatches = mismatchesBetween(collection, existing, sample)
      if (mismatches.length > 0) {
        collections.push({
          name: collection.name,
          outcome: 'skip',
          entries: sample.length,
          conflictingSlugs: [],
          mismatches,
        })
        warnings.push({
          code: 'collection-incompatible',
          params: {
            collection: collection.name,
            entries: sample.length,
            fields: mismatches.join(', '),
          },
        })
        continue
      }
      const taken = new Map<string, string>()
      const slugField = slugFieldOf(existing)
      if (slugField !== undefined) {
        const store = createContentStore({ db, collection: existing, defaultLocale })
        for (const entry of sample) {
          const slug = entry.values[slugField]
          if (typeof slug !== 'string') continue
          const found = await store.list({
            where: { [slugField]: slug },
            trashed: 'include',
            limit: 1,
          })
          const match = found.items[0]
          if (match !== undefined) taken.set(slug, match.id)
        }
      }
      conflicts.set(collection.name, taken)
      collections.push({
        name: collection.name,
        outcome: 'import',
        entries: sample.length,
        conflictingSlugs: [...taken.keys()],
        mismatches: [],
      })
      if (taken.size > 0) {
        warnings.push({
          code: 'slug-conflict',
          params: {
            collection: collection.name,
            count: taken.size,
            slugs: [...taken.keys()].slice(0, LISTED_SLUGS).join(', '),
          },
        })
      }
    }

    const taxonomies = (pack.taxonomies ?? []).map((taxonomy) => ({
      name: taxonomy.name,
      outcome:
        mode === 'reset'
          ? ('replace' as const)
          : site.taxonomies.some((item) => item.name === taxonomy.name)
            ? ('merge' as const)
            : ('add' as const),
      terms: staged.terms.get(taxonomy.name)?.length ?? 0,
    }))

    await ensureMenuTables(db)
    const menuStore = createMenuStore({ db })
    const menus: SampleDataPreview['menus'][number][] = []
    const packMenus = pack.menus
    if (packMenus !== undefined) {
      const wanted: [string, number][] = [
        [MENU_LOCATIONS.header, packMenus.header.length],
        [MENU_LOCATIONS.footer, packMenus.footer.length],
        ...(packMenus.headerAction === undefined
          ? []
          : [[MENU_LOCATIONS.headerAction, 1] as [string, number]]),
      ]
      for (const [location, items] of wanted) {
        if (items === 0) continue
        if (mode === 'reset') {
          menus.push({ location, outcome: 'replace', items })
          continue
        }
        const taken = (await menuStore.byLocation(location, defaultLocale)) !== null
        menus.push({ location, outcome: taken ? 'keep' : 'fill', items })
        if (taken) warnings.push({ code: 'menu-kept', params: { location } })
      }
    }

    await ensureSiteSettingsTables(db)
    const settingsStore = createSiteSettingsStore({ db })
    const settings: SampleDataPreview['settings'][number][] = []
    for (const key of Object.keys(pack.siteSettings ?? {})) {
      const definition = siteSettingByKey(key)
      if (definition === undefined) continue
      const locale = definition.scope === 'site' ? SITE_SETTINGS_SITE_SCOPE : defaultLocale
      if (mode === 'reset') {
        settings.push({ key, outcome: 'replace' })
        continue
      }
      const current = await settingsStore.get(key, locale)
      const kept = current !== null && !isEmptySetting(current.value)
      settings.push({ key, outcome: kept ? 'keep' : 'fill' })
      if (kept) warnings.push({ code: 'setting-kept', params: { key } })
    }

    let removals: SampleDataPreview['removals'] = null
    if (mode === 'reset') {
      let entries = 0
      for (const collection of site.collections) {
        const counts = await createContentStore({ db, collection, defaultLocale })
          .count()
          .catch(() => ({ total: 0, trashed: 0 }))
        entries += counts.total + counts.trashed
        if (!pack.collections.some((item) => item.name === collection.name)) {
          warnings.push({
            code: 'collection-removed',
            params: { collection: collection.name, entries: counts.total + counts.trashed },
          })
        }
      }
      let terms = 0
      for (const taxonomy of site.taxonomies) {
        terms += (
          await createTaxonomyStore({ db, taxonomy })
            .list()
            .catch(() => [])
        ).length
      }
      removals = {
        entries,
        terms,
        media: await countRows(db, MEDIA_TABLE),
        menus: await countRows(db, MENU_TABLES.menus),
        redirects: await countRows(db, REDIRECTS_TABLE),
        collections: site.collections.map((collection) => collection.name),
      }
      warnings.unshift(
        {
          code: 'reset-deletes',
          params: {
            entries: removals.entries,
            terms: removals.terms,
            media: removals.media,
            menus: removals.menus,
            redirects: removals.redirects,
          },
        },
        { code: 'reset-backup', params: {} },
      )
      if (settings.length > 0) {
        warnings.push({
          code: 'settings-replaced',
          params: { keys: settings.map((setting) => setting.key).join(', ') },
        })
      }
      if (removals.media > 0) warnings.push({ code: 'media-files-kept', params: {} })
    }

    const addsSchema =
      mode === 'reset' ||
      collections.some((item) => item.outcome === 'add') ||
      taxonomies.some((item) => item.outcome === 'add')
    if (addsSchema) {
      warnings.push({ code: 'schema-rewrite', params: {} })
      const lost = mode === 'keep' ? unserialisable(site.collections) : []
      if (lost.length > 0) {
        warnings.push({ code: 'schema-not-serialisable', params: { fields: lost.join(', ') } })
      }
    }

    return {
      starter,
      staged,
      site,
      conflicts,
      preview: {
        theme,
        starter: starter.id,
        mode,
        siteName: options.siteName,
        writable: options.writable,
        collections,
        taxonomies,
        menus,
        settings,
        media: pack.mediaSpecs?.length ?? 0,
        removals,
        warnings,
      },
    }
  }

  /** Deletes what a reset replaces. Called only after the backup was written and re-read. */
  async function clearSite(site: SiteModel): Promise<void> {
    const index = await createSearchIndex({ db })
    for (const collection of site.collections) {
      await index.clear({ collection: collection.name }).catch(() => undefined)
    }
    await dropSchemaTables(db, site.collections, site.taxonomies)
    await deleteRows(db, MENU_TABLES.items)
    await deleteRows(db, MENU_TABLES.menus)
    await deleteRows(db, REDIRECTS_TABLE)
    // Rows only: the files stay on disk, so restoring the backup (which holds
    // the rows, not the files) gives the media library back intact.
    await deleteRows(db, MEDIA_TABLE)
  }

  return {
    writable: options.writable,

    themes: () =>
      Object.values(BLUEPRINT_CONTENT_PACKS)
        .map((pack) => pack.defaultTheme)
        .filter((theme): theme is string => theme !== undefined),

    preview: async ({ theme, mode }) => (await plan(theme, mode)).preview,

    async apply({ theme, mode, confirmation, actorId, activateTheme }): Promise<SampleDataReport> {
      if (!options.writable) {
        throw new CogentaError({
          code: 'CONTENT_READ_ONLY',
          message: 'Sample data can only be imported while the site runs under `cogenta dev`.',
          hint: 'Importing sample data rewrites the schema, which ADR-0010 keeps read-only in production. Run `cogenta dev` and apply again.',
        })
      }
      if (mode === 'reset' && confirmation?.trim() !== options.siteName) {
        throw new CogentaError({
          code: 'THEME_SAMPLE_DATA_CONFIRMATION_INVALID',
          message: 'Resetting the site needs its name typed exactly as confirmation.',
          hint: `Type "${options.siteName}" to confirm that the site's content is replaced.`,
        })
      }

      const { preview, starter, staged, site, conflicts } = await plan(theme, mode)
      const { pack } = starter
      if (preview.warnings.some((warning) => warning.code === 'schema-not-serialisable')) {
        throw new CogentaError({
          code: 'SCHEMA_INVALID',
          message: 'The current schema file declares functions that rewriting it would drop.',
          hint: 'Use "reset", or add the sample collections to the schema file by hand.',
          details: { fields: unserialisable(site.collections) },
        })
      }

      let backup: SampleDataReport['backup'] = null
      if (mode === 'reset') {
        const created = await createSiteBackup({
          cwd: options.projectRoot,
          filenamePrefix: 'theme-reset-',
          logger,
          ...(options.env === undefined ? {} : { env: options.env }),
          ...(options.backupDir === undefined ? {} : { dir: options.backupDir }),
        })
        // Re-read before anything is deleted: a backup that does not verify
        // (checksum) or holds no table is no backup, and nothing is touched.
        const manifest = await verifyBackup(created.path)
        if (manifest.tables.length === 0) {
          throw new CogentaError({
            code: 'BACKUP_CHECKSUM_MISMATCH',
            message: 'The backup taken before the reset holds no table, so nothing was deleted.',
            hint: 'Run `cogenta backup create` by hand and check its output before resetting.',
            details: { path: created.path },
          })
        }
        backup = {
          path: created.path,
          restoreCommand: `cogenta restore apply ${created.path}`,
        }
        await clearSite(site)
      }

      const collectionOf = (name: string): CollectionDefinition | undefined => {
        const outcome = preview.collections.find((item) => item.name === name)?.outcome
        if (outcome === 'import') return site.collections.find((item) => item.name === name)
        return pack.collections.find((item) => item.name === name)
      }
      const addedCollections =
        mode === 'reset'
          ? pack.collections
          : pack.collections.filter((collection) =>
              preview.collections.some(
                (item) => item.name === collection.name && item.outcome === 'add',
              ),
            )
      const addedTaxonomies = (pack.taxonomies ?? []).filter(
        (taxonomy) =>
          mode === 'reset' ||
          preview.taxonomies.some((item) => item.name === taxonomy.name && item.outcome === 'add'),
      )
      await createSchemaTables(db, addedCollections, addedTaxonomies)

      const media = await seedDemoMedia(
        {
          db,
          storage: options.storage,
          adminId: actorId,
          ...(options.images === undefined ? {} : { images: options.images }),
        },
        pack.mediaSpecs ?? [],
      )

      // Terms first: entries point at them. A term whose slug the site already
      // uses is the same term, so entries are attached to the site's own.
      const termIds = new Map<string, string>()
      let termsImported = 0
      for (const taxonomy of pack.taxonomies ?? []) {
        const store = createTaxonomyStore({ db, taxonomy })
        for (const term of staged.terms.get(taxonomy.name) ?? []) {
          const existing = mode === 'keep' ? await store.bySlug(term.slug) : null
          if (existing !== null) {
            termIds.set(term.id, existing.id)
            continue
          }
          const parent = term.parent === null ? null : (termIds.get(term.parent) ?? null)
          const created = await store.create({
            id: term.id,
            slug: term.slug,
            labels: term.labels,
            parent,
            position: term.position,
          })
          termIds.set(term.id, created.id)
          termsImported += 1
        }
      }

      const all = mode === 'reset' ? pack.collections : [...site.collections, ...addedCollections]
      const entryIds = new Map<string, string>()
      for (const [name, taken] of conflicts) {
        const existing = site.collections.find((item) => item.name === name)
        const slugField = existing === undefined ? undefined : slugFieldOf(existing)
        if (slugField === undefined) continue
        for (const entry of staged.entries.get(name) ?? []) {
          const slug = entry.values[slugField]
          const kept = typeof slug === 'string' ? taken.get(slug) : undefined
          if (kept !== undefined) entryIds.set(entry.id, kept)
        }
      }

      let entriesImported = 0
      let failed = 0
      const written: CollectionDefinition[] = []
      for (const outcome of preview.collections) {
        if (outcome.outcome === 'skip') continue
        const collection = collectionOf(outcome.name)
        if (collection === undefined) continue
        written.push(collection)
        const store = createContentStore({ db, collection, siblings: all, defaultLocale })
        const slugField = slugFieldOf(collection)
        const entries = [...(staged.entries.get(outcome.name) ?? [])].sort(
          (a, b) => Number(a.translationOf !== null) - Number(b.translationOf !== null),
        )
        for (const entry of entries) {
          const slug = slugField === undefined ? undefined : entry.values[slugField]
          if (typeof slug === 'string' && outcome.conflictingSlugs.includes(slug)) continue
          const values: Record<string, unknown> = {}
          for (const [field, value] of Object.entries(entry.values)) {
            const kind = collection.fields[field]?.kind
            if (kind === undefined || kind === 'blocks') continue
            values[field] =
              kind === 'taxonomy'
                ? mapIds(value, termIds)
                : kind === 'relation'
                  ? mapIds(value, entryIds)
                  : withMedia(value, media)
          }
          try {
            await store.create({
              id: entry.id,
              locale: entry.locale,
              translationOf:
                entry.translationOf === null
                  ? null
                  : (entryIds.get(entry.translationOf) ?? entry.translationOf),
              status: entry.status,
              createdBy: actorId,
              values,
              blocks: withMedia(entry.blocks, media) as ContentEntry['blocks'],
            })
            entryIds.set(entry.id, entry.id)
            entriesImported += 1
          } catch (error) {
            failed += 1
            logger.warn('a sample entry could not be imported', {
              collection: outcome.name,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
      }

      if (pack.menus !== undefined) {
        const fill = (location: string): boolean =>
          preview.menus.some((menu) => menu.location === location && menu.outcome !== 'keep')
        const menus: BlueprintMenus = {
          header: fill(MENU_LOCATIONS.header) ? pack.menus.header : [],
          footer: fill(MENU_LOCATIONS.footer) ? pack.menus.footer : [],
          ...(pack.menus.headerAction !== undefined && fill(MENU_LOCATIONS.headerAction)
            ? { headerAction: pack.menus.headerAction }
            : {}),
        }
        await seedBlueprintMenus(db, defaultLocale, menus)
      }

      const settings = Object.fromEntries(
        Object.entries(pack.siteSettings ?? {}).filter(([key]) =>
          preview.settings.some((setting) => setting.key === key && setting.outcome !== 'keep'),
        ),
      )
      await seedSiteSettings(db, defaultLocale, settings, actorId, logger)

      // No comment thread under a template page, as on a scaffolded site.
      if (written.some((collection) => collection.name === PAGE_COLLECTION) && mode === 'reset') {
        await ensureCommentsTables(db)
        await createCommentSettingsStore(db).setCollection(PAGE_COLLECTION, { enabled: false })
      } else if (addedCollections.some((collection) => collection.name === PAGE_COLLECTION)) {
        await ensureCommentsTables(db)
        await createCommentSettingsStore(db).setCollection(PAGE_COLLECTION, { enabled: false })
      }

      // The copy above wrote through plain stores, not the search-indexed ones
      // `cogenta serve` builds, so the index is brought in line here.
      const index = await createSearchIndex({ db })
      for (const collection of written) {
        await reindexAll(createContentStore({ db, collection, defaultLocale }), {
          collection,
          index,
        })
      }

      await activateTheme()

      const warnings = [...preview.warnings]
      if (failed > 0) warnings.push({ code: 'entries-failed', params: { count: failed } })

      const rewrite = mode === 'reset' || addedCollections.length > 0 || addedTaxonomies.length > 0
      if (rewrite) {
        const schemaPath =
          (await findSchemaFile(options.projectRoot)) ??
          join(options.projectRoot, 'cogenta.schema.mjs')
        const body =
          mode === 'reset'
            ? schemaFile(pack.collections, pack.taxonomies ?? [])
            : schemaFile(
                [...site.collections, ...addedCollections],
                [...site.taxonomies, ...addedTaxonomies],
              )
        // Last, on purpose: under `cogenta dev` this write is what restarts
        // the server, and everything above must already be in the database.
        await writeFile(schemaPath, body, 'utf8')
      }

      return {
        ...preview,
        warnings,
        imported: {
          entries: entriesImported,
          terms: termsImported,
          media: Object.keys(media).length,
        },
        backup,
        restarting: rewrite,
      }
    },
  }
}
