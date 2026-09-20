import { createReadStream, createWriteStream } from 'node:fs'
import process from 'node:process'
import { createInterface } from 'node:readline'
import { collectDependencies } from '@cogenta/api'
import {
  CogentaError,
  createDatabaseMediaStore,
  createDatabaseRegistry,
  createLogger,
  createStorageRegistry,
  type DatabaseHandle,
  isCogentaError,
  type Logger,
  loadConfig,
  type MediaStore,
  type StorageDriver,
} from '@cogenta/core'
import {
  type ExportResult,
  exportContent,
  exportMediaArchive,
  type ImportReport,
  importContent,
} from '@cogenta/export'
import {
  type CollectionDefinition,
  type ContentStore,
  createContentStore,
  createMenuStore,
  createRedirectStore,
  createSchemaTables,
  createTaxonomyStore,
  ensureMenuTables,
  type TaxonomyDefinition,
  type TaxonomyStore,
} from '@cogenta/schema'
import type { Output, Writer } from '../output.js'
import { loadSchemaModule } from './serve.js'

export interface ExportOptions {
  readonly file: string | undefined
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
  readonly collections?: readonly string[]
  /**
   * Where to also write a ZIP of the referenced media's real bytes.
   *
   * Absent by default, and that default is the right one: the NDJSON already
   * carries a `media-ref` per medium, which is everything the target needs
   * whenever it shares the source's storage or had it restored alongside —
   * by far the common case (a staging copy, a migration to another database
   * engine, a re-import into the same install). Carrying the bytes doubles
   * the size of the export for nothing in that case, and an export is also
   * the artefact people hand to a partner.
   *
   * Ask for the archive when the target does *not* have the storage: a move
   * to another host, another bucket, or a hand-off to someone who has only
   * the files you gave them.
   */
  readonly mediaArchive?: string
}

export interface ImportContentOptions {
  readonly file: string | undefined
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
}

const EXPORT_USAGE = `Usage
  cogenta export <file.ndjson> [--collections a,b,c] [--media-archive <file.zip>]

Exports content — entries, taxonomy terms, menus, redirects and a reference to
every medium they point at — as one NDJSON file, \`export@1.0\` (fiche 26, task
1). The CLI runs as the site's own operator, so every collection is included
unless \`--collections\` narrows it; an HTTP caller instead goes through
\`/api/export\`, which never sees a collection the requesting actor may not
read.

Media are exported **by reference** by default: each one's id, filename, type
and storage key, which is all the target needs when it shares this site's
storage or has had it restored alongside. Pass \`--media-archive\` to also write
a ZIP of the real bytes — for a move to another host or bucket, or a hand-off
to someone who has only the files you give them.
`

const IMPORT_CONTENT_USAGE = `Usage
  cogenta import content <file.ndjson>

Re-imports an export produced by \`cogenta export\` — the round trip the
format's own acceptance criterion names. Existing ids are skipped, never
overwritten.
`

interface Assembled {
  readonly db: DatabaseHandle
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies: readonly TaxonomyDefinition[]
  readonly storeFor: (collection: CollectionDefinition) => ContentStore
  readonly taxonomyStoreFor: (taxonomy: TaxonomyDefinition) => TaxonomyStore
  readonly menus: ReturnType<typeof createMenuStore>
  readonly redirects: ReturnType<typeof createRedirectStore>
  readonly media: MediaStore
  readonly storage: () => Promise<{
    readonly instance: StorageDriver
    readonly dispose: () => Promise<void>
  }>
  readonly site: { readonly name: string; readonly url: string }
  readonly dispose: () => Promise<void>
}

async function assemble(
  options: { readonly cwd?: string; readonly env?: Record<string, string | undefined> },
  logger: Logger,
): Promise<Assembled> {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env
  const loaded = await loadConfig({ cwd, env })
  const { collections, taxonomies } = await loadSchemaModule(cwd)
  const dbSelection = await createDatabaseRegistry({ logger }).select(loaded.config.database)
  const db = dbSelection.instance
  // Both directions need every table to exist: an export against a site
  // that has never been served (schema declared, tables never created) and
  // an import into a genuinely empty one both start from nothing.
  await createSchemaTables(db, collections, taxonomies)
  await ensureMenuTables(db)
  await createRedirectStore({ db }).ensureTable()
  const media = createDatabaseMediaStore({ db })
  // The media store creates its table on first use; `list` is the cheapest
  // call that does so without writing, and an export of a site that has
  // never uploaded anything must not fail on a missing table.
  await media.list({ limit: 1 })

  const contentStores = new Map<string, ContentStore>()
  const taxonomyStores = new Map<string, TaxonomyStore>()
  for (const collection of collections) {
    contentStores.set(
      collection.name,
      createContentStore({ db, collection, siblings: collections }),
    )
  }
  for (const taxonomy of taxonomies) {
    taxonomyStores.set(taxonomy.name, createTaxonomyStore({ db, taxonomy }))
  }

  return {
    db,
    collections,
    taxonomies,
    storeFor: (collection) => {
      const store = contentStores.get(collection.name)
      if (store === undefined) {
        throw new CogentaError({
          code: 'INTERNAL',
          message: `No content store was assembled for collection "${collection.name}".`,
          hint: 'This is a bug in `cogenta export`/`cogenta import content`: every declared collection should have a store.',
          details: { collection: collection.name },
        })
      }
      return store
    },
    taxonomyStoreFor: (taxonomy) => {
      const store = taxonomyStores.get(taxonomy.name)
      if (store === undefined) {
        throw new CogentaError({
          code: 'INTERNAL',
          message: `No taxonomy store was assembled for "${taxonomy.name}".`,
          hint: 'This is a bug in `cogenta export`/`cogenta import content`: every declared taxonomy should have a store.',
          details: { taxonomy: taxonomy.name },
        })
      }
      return store
    },
    menus: createMenuStore({ db }),
    redirects: createRedirectStore({ db }),
    media,
    // Resolved lazily: only `--media-archive` reads the bytes, and a plain
    // export must not fail because an S3 bucket it never touches is
    // unreachable.
    storage: async () => {
      const selection = await createStorageRegistry({ logger }).select(loaded.config.storage)
      return { instance: selection.instance, dispose: selection.dispose }
    },
    site: { name: loaded.config.site.name, url: loaded.config.site.url },
    dispose: dbSelection.dispose,
  }
}

function reportError(error: unknown, stderr: Writer): number {
  if (isCogentaError(error)) {
    stderr(`${error.code}: ${error.message}\n`)
    if (error.hint !== undefined) stderr(`${error.hint}\n`)
  } else {
    stderr(`${error instanceof Error ? error.stack : String(error)}\n`)
  }
  return 1
}

export async function runExport(options: ExportOptions): Promise<number> {
  const { out, stderr } = options
  if (options.file === undefined || options.file.trim().length === 0) {
    stderr(`A destination file is required.\n\n${EXPORT_USAGE}`)
    return 2
  }
  const logger = options.logger ?? createLogger({ level: 'silent' })

  try {
    const site = await assemble(options, logger)
    const collectionsByName = new Map(site.collections.map((item) => [item.name, item]))
    try {
      const stream = createWriteStream(options.file, { mode: 0o600 })
      const generator = exportContent({
        db: site.db,
        site: site.site,
        collections: site.collections,
        taxonomies: site.taxonomies,
        storeFor: site.storeFor,
        taxonomyStoreFor: site.taxonomyStoreFor,
        menus: site.menus,
        redirects: site.redirects,
        media: site.media,
        // Most of a site's pictures sit in contract B blocks, not in declared
        // `f.media()` fields, and `@cogenta/export` cannot see them: reading
        // block data means reading the block vocabulary, which it does not
        // depend on (R9). This process does. `collectDependencies` is the
        // same walk `/api/content` uses to declare a response's dependencies,
        // so the export carries exactly what the API already considers this
        // entry to reference.
        mediaIn: (entry, collection) =>
          collectDependencies([{ ...entry, collection: collection.name }], {
            collection: (name) => collectionsByName.get(name),
          }).media,
        ...(options.collections === undefined
          ? {}
          : { selection: { collections: options.collections } }),
      })
      let result: ExportResult | undefined
      for (;;) {
        const step = await generator.next()
        if (step.done === true) {
          result = step.value
          out.heading('Export complete')
          out.line(`${options.file}`)
          out.line(
            `${result.counts.entries} entries, ${result.counts.terms} terms, ${result.counts.menus} menus, ${result.counts.redirects} redirects, ${result.counts.mediaRefs} media references`,
          )
          break
        }
        await new Promise<void>((resolve, reject) => {
          stream.write(step.value, (error) => (error ? reject(error) : resolve()))
        })
      }
      await new Promise<void>((resolve, reject) => {
        stream.end((error: unknown) => (error ? reject(error) : resolve()))
      })

      if (options.mediaArchive !== undefined && result !== undefined) {
        await writeMediaArchive(options.mediaArchive, site, result.mediaIds, out)
      }
      return 0
    } finally {
      await site.dispose()
    }
  } catch (error) {
    return reportError(error, stderr)
  }
}

/**
 * `--media-archive`: the referenced media's real bytes, streamed into a ZIP
 * beside the NDJSON rather than inside it. Two files on purpose — the content
 * export stays a text file a person can read, diff and grep, which it stops
 * being the moment a JPEG is base64'd into it.
 */
async function writeMediaArchive(
  path: string,
  site: Assembled,
  ids: readonly string[],
  out: Output,
): Promise<void> {
  const storage = await site.storage()
  try {
    const stream = createWriteStream(path, { mode: 0o600 })
    let assets = 0
    await exportMediaArchive({
      media: site.media,
      storage: storage.instance,
      ids,
      onAsset: () => {
        assets += 1
      },
      write: (chunk) =>
        new Promise((resolve, reject) => {
          stream.write(chunk, (error) => (error ? reject(error) : resolve()))
        }),
    })
    await new Promise<void>((resolve, reject) => {
      stream.end((error: unknown) => (error ? reject(error) : resolve()))
    })
    out.line(`${path}`)
    out.line(`${assets} media files archived`)
  } finally {
    await storage.dispose()
  }
}

function formatImportReport(report: ImportReport): string {
  const lines = [
    `entries: ${report.entries}, terms: ${report.terms}, menus: ${report.menus}, menu items: ${report.menuItems}, redirects: ${report.redirects}, media: ${report.mediaRefs}`,
    `skipped (already existed): ${report.skipped}`,
  ]
  if (report.errors.length > 0) {
    lines.push('errors:')
    for (const error of report.errors) lines.push(`  ${error.kind} ${error.id}: ${error.message}`)
  }
  return lines.join('\n')
}

export async function runImportContent(options: ImportContentOptions): Promise<number> {
  const { out, stderr } = options
  if (options.file === undefined || options.file.trim().length === 0) {
    stderr(`A source file is required.\n\n${IMPORT_CONTENT_USAGE}`)
    return 2
  }
  const logger = options.logger ?? createLogger({ level: 'silent' })

  try {
    const site = await assemble(options, logger)
    try {
      const lines = createInterface({ input: createReadStream(options.file, 'utf8') })
      const report = await importContent(lines, {
        collections: site.collections,
        taxonomies: site.taxonomies,
        storeFor: site.storeFor,
        taxonomyStoreFor: site.taxonomyStoreFor,
        menus: site.menus,
        redirects: site.redirects,
        media: site.media,
      })
      out.heading('Import complete')
      out.line(formatImportReport(report))
      return report.errors.length === 0 ? 0 : 1
    } finally {
      await site.dispose()
    }
  } catch (error) {
    return reportError(error, stderr)
  }
}
