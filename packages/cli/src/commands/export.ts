import { createReadStream, createWriteStream } from 'node:fs'
import process from 'node:process'
import { createInterface } from 'node:readline'
import {
  CogentaError,
  createDatabaseRegistry,
  createLogger,
  type DatabaseHandle,
  isCogentaError,
  type Logger,
  loadConfig,
} from '@cogenta/core'
import { exportContent, type ImportReport, importContent } from '@cogenta/export'
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
  cogenta export <file.ndjson> [--collections a,b,c]

Exports content — entries, taxonomy terms, menus and redirects — as one
NDJSON file, \`export@1.0\` (fiche 26, task 1). The CLI runs as the site's own
operator, so every collection is included unless \`--collections\` narrows it;
an HTTP caller instead goes through \`/api/export\`, which never sees a
collection the requesting actor may not read.
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
        ...(options.collections === undefined
          ? {}
          : { selection: { collections: options.collections } }),
      })
      for (;;) {
        const step = await generator.next()
        if (step.done === true) {
          out.heading('Export complete')
          out.line(`${options.file}`)
          out.line(
            `${step.value.counts.entries} entries, ${step.value.counts.terms} terms, ${step.value.counts.menus} menus, ${step.value.counts.redirects} redirects, ${step.value.counts.mediaRefs} media references`,
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
      return 0
    } finally {
      await site.dispose()
    }
  } catch (error) {
    return reportError(error, stderr)
  }
}

function formatImportReport(report: ImportReport): string {
  const lines = [
    `entries: ${report.entries}, terms: ${report.terms}, menus: ${report.menus}, menu items: ${report.menuItems}, redirects: ${report.redirects}`,
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
